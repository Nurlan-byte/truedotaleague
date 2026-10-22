// Isolated fixtures only: no network, credentials, or production data.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const uid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await query(sql, args)).rows[0])[0];
async function as(n) {
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${uid(n)}'; SET ROLE authenticated`);
}
async function signup(n, metadata = {}) {
  await db.exec("RESET ROLE");
  await query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)",
    [uid(n), `fixture${n}@invalid.test`, JSON.stringify({ nickname: `Player ${n}`, ...metadata })]);
}
const save = (name = "Player 2", mmr = 2200, url = "https://steamcommunity.com/id/player2") =>
  scalar("SELECT public.save_profile_for_review($1,$2,$3)", [name, mmr, url]);
const state = () => scalar("SELECT public.get_my_profile_verification()");
const decide = (n, submitted, approve = true) =>
  query("SELECT public.decide_profile_review($1,$2,$3)", [uid(n), submitted, approve]);

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql") && n < "20261021185000").sort()) {
    await db.exec(await readFile(new URL(name, dir), "utf8"));
  }
  for (const name of ["0000_roles_and_tournament_schema.sql", "0001_stage3_admin_rpcs.sql", "0002_draft_publication.sql", "0003_private_discord_profile.sql"]) {
    await db.exec(await readFile(new URL(`../drizzle/migrations/${name}`, import.meta.url), "utf8"));
  }
  await signup(1);
  await query("UPDATE profiles SET team_name='Historical team',team_role='Historical role',mmr=1234 WHERE id=$1", [uid(1)]);
  const before = await scalar("SELECT to_jsonb(p) FROM profiles p WHERE id=$1", [uid(1)]);
  const roleBefore = (await query("SELECT * FROM user_roles ORDER BY user_id")).rows;
  // Table-level revokes alone do not remove earlier column grants.
  await db.exec("GRANT UPDATE(team_name,team_role,mmr),INSERT(id,nickname) ON profiles TO authenticated");
  await db.exec(await readFile(new URL("20261022091000_profile_verification.sql", dir), "utf8"));
  assert.deepEqual(await scalar("SELECT to_jsonb(p) FROM profiles p WHERE id=$1", [uid(1)]), before);
  assert.deepEqual((await query("SELECT * FROM user_roles ORDER BY user_id")).rows, roleBefore);
  assert.equal(await scalar("SELECT count(*)::int FROM profile_verifications"), 0);
  await as(1);
  assert.equal((await state()).status, "unverified");

  // Every auth provider goes through profile INSERT; supplied statuses never win.
  for (const [n, provider] of [[2, "discord"], [3, "google"], [4, "email"]]) {
    await signup(n, { provider, status: "verified", verified: true, verification_status: "verified", role: "admin", mmr: 9999 });
    await as(n);
    assert.equal((await state()).status, "unverified");
    assert.equal(await scalar("SELECT role FROM user_roles WHERE user_id=$1", [uid(n)]), "user");
  }
  await db.exec("RESET ROLE");
  await query("UPDATE user_roles SET role='moderator' WHERE user_id=$1", [uid(3)]);
  await query("UPDATE user_roles SET role='admin' WHERE user_id=$1", [uid(4)]);

  await as(2);
  for (const sql of [
    "UPDATE profiles SET mmr=10 WHERE id=auth.uid()",
    "UPDATE profiles SET nickname='Bypass' WHERE id=auth.uid()",
    "UPDATE profiles SET team_name='Fake',team_role='Captain' WHERE id=auth.uid()",
    "UPDATE profiles SET discord_id='fake' WHERE id=auth.uid()",
    "DELETE FROM profiles WHERE id=auth.uid()",
    "INSERT INTO profiles(id,nickname) VALUES(auth.uid(),'Overwrite') ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname",
    "UPDATE profile_verifications SET status='verified' WHERE profile_id=auth.uid()",
    "INSERT INTO profile_verifications(profile_id,status) VALUES(auth.uid(),'verified')",
    "DELETE FROM profile_verifications WHERE profile_id=auth.uid()",
    "SELECT public.list_profile_reviews()",
  ]) await assert.rejects(query(sql));
  await query("UPDATE profiles SET avatar_url='https://example.test/avatar.png' WHERE id=auth.uid()");
  for (const args of [["X", 1, "https://x.test"], ["Valid", null, "https://x.test"], ["Valid", -1, "https://x.test"], ["Valid", 15001, "https://x.test"], ["Valid", 1, ""], ["Valid", 1, "javascript:alert(1)"], ["Valid", 1, "https://"], ["Valid", 1, "https://bad host"]]) {
    await assert.rejects(save(...args));
  }
  assert.equal((await state()).status, "unverified");
  const pending = await save();
  assert.equal(pending.status, "pending");
  await assert.rejects(decide(2, pending.submitted_at), /forbidden/);
  await as(3);
  const reviews = await scalar("SELECT public.list_profile_reviews()");
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].mmr, 2200);
  assert.equal(reviews[0].profile_id, uid(2));
  await assert.rejects(decide(2, null), /stale_profile_review/);
  await decide(2, pending.submitted_at);
  await assert.rejects(decide(2, pending.submitted_at), /stale_profile_review/);
  const ownPending = await save("Moderator", 0, "http://example.test/mod");
  await assert.rejects(decide(3, ownPending.submitted_at), /cannot_review_own_profile/);

  // Repeated login updates auth metadata and Discord profile fields only.
  await db.exec("RESET ROLE");
  await query("UPDATE auth.users SET raw_user_meta_data=$1 WHERE id=$2", [JSON.stringify({ status: "unverified" }), uid(2)]);
  await db.exec("SET ROLE service_role");
  await query("INSERT INTO profiles(id,discord_username) VALUES($1,'new-discord-name') ON CONFLICT(id) DO UPDATE SET discord_username=excluded.discord_username", [uid(2)]);
  await as(2);
  assert.equal((await state()).status, "verified");
  assert.equal((await save()).status, "verified");
  const changed = await save("Player 2", 2300);
  assert.equal(changed.status, "pending");
  await as(4);
  await assert.rejects(decide(2, pending.submitted_at), /stale_profile_review/);
  await decide(2, changed.submitted_at, false);
  await as(2);
  assert.equal((await state()).status, "unverified");
  const resubmitted = await save("Player 2", 2300);
  await as(4);
  await decide(2, resubmitted.submitted_at);
  await decide(3, ownPending.submitted_at);
  await as(1);
  const auditPending = await save("Old player", 0, "https://example.test/old");

  // Any audit failure must roll back the decision and the profile save itself.
  await db.exec("RESET ROLE");
  const auditCount = await scalar("SELECT count(*)::int FROM audit_log WHERE action='approve_profile'");
  assert.equal(auditCount, 3);
  await db.exec(`CREATE FUNCTION fail_profile_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_unavailable'; END $$;
    CREATE TRIGGER fail_profile_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_profile_audit();`);
  await as(4);
  await assert.rejects(decide(1, auditPending.submitted_at), /audit_unavailable/);
  await as(1);
  assert.equal((await state()).status, "pending");
  await as(2);
  await assert.rejects(save("Changed", 2500), /audit_unavailable/);
  assert.equal((await state()).status, "verified");
  assert.equal(await scalar("SELECT mmr FROM profiles WHERE id=auth.uid()"), 2300);
  await db.exec("RESET ROLE; DROP TRIGGER fail_profile_audit ON audit_log");
  await as(1);
  const first = await save("Old player", 0, "https://example.test/old");
  assert.equal(first.status, "pending");
  assert.equal(await scalar("SELECT team_name FROM profiles WHERE id=auth.uid()"), "Historical team");
  assert.equal(await scalar("SELECT team_role FROM profiles WHERE id=auth.uid()"), "Historical role");
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal(await scalar("SELECT status FROM profile_verifications WHERE profile_id=$1", [uid(2)]), "verified");
  await assert.rejects(query("SELECT reviewed_by FROM profile_verifications"));
  await assert.rejects(save());
  await assert.rejects(state());
  console.log("profile verification SQL PASS: existing rows/roles retained; OAuth/email metadata ignored; repeat login retained; validation; direct-write denial; pending/moderator/admin/self-review/stale checks; live profile changes re-review; audit atomicity. Single connection: no concurrent-session proof.");
} finally {
  await db.close();
}
