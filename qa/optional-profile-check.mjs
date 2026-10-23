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

  await db.exec(await readFile(new URL("20261022091000_profile_verification.sql", dir), "utf8"));
  await signup(1); await signup(2); await signup(3);
  await query("UPDATE user_roles SET role='admin' WHERE user_id=$1", [uid(3)]);
  await query("UPDATE profiles SET team_name='Historical',team_role='Old role',mmr=2000 WHERE id=$1", [uid(1)]);
  await query("UPDATE profile_verifications SET status='pending',submitted_at=clock_timestamp() WHERE profile_id=$1", [uid(1)]);
  await query("UPDATE profile_verifications SET status='verified',reviewed_at=clock_timestamp(),reviewed_by=$1 WHERE profile_id=$2", [uid(3),uid(2)]);
  const priorProfiles=(await query("SELECT * FROM profiles ORDER BY id")).rows;
  const priorVerifications=(await query("SELECT * FROM profile_verifications ORDER BY profile_id")).rows;
  const priorRoles=(await query("SELECT * FROM user_roles ORDER BY user_id")).rows;
  await db.exec(await readFile(new URL("20261023092000_optional_profile.sql", dir), "utf8"));
  assert.deepEqual((await query("SELECT * FROM profiles ORDER BY id")).rows,priorProfiles);
  assert.deepEqual((await query("SELECT * FROM profile_verifications ORDER BY profile_id")).rows,priorVerifications);
  assert.deepEqual((await query("SELECT * FROM user_roles ORDER BY user_id")).rows,priorRoles);
  await as(1);
  assert.equal((await save('Nickname only',null,'')).saved,true);
  assert.equal(await scalar("SELECT mmr FROM profiles WHERE id=auth.uid()"),null);
  assert.equal(await scalar("SELECT profile_url FROM profiles WHERE id=auth.uid()"),'');
  assert.equal(await scalar("SELECT team_name FROM profiles WHERE id=auth.uid()"),'Historical');
  assert.equal(await scalar("SELECT team_role FROM profiles WHERE id=auth.uid()"),'Old role');
  await as(2); assert.equal((await save('Changed',3300,'https://example.test')).saved,true);
  await as(3); assert.deepEqual(await scalar("SELECT list_profile_reviews()"),[]);
  await assert.rejects(decide(1,priorVerifications[0].submitted_at),/profile_review_disabled/);
  await as(1);
  await assert.rejects(query("SELECT list_profile_reviews()"),/forbidden/);
  await assert.rejects(decide(2,null),/forbidden/);
  for(const args of [['X',1,''],['Valid',-1,''],['Valid',15001,''],['Valid',1,'javascript:alert(1)'],['Valid',1,'https://bad host']])await assert.rejects(save(...args));
  for(const sql of ["UPDATE profiles SET mmr=10 WHERE id=auth.uid()","UPDATE profiles SET discord_id='fake' WHERE id=auth.uid()","UPDATE profiles SET team_name='Fake' WHERE id=auth.uid()","UPDATE profile_verifications SET status='verified' WHERE profile_id=auth.uid()","UPDATE user_roles SET role='admin' WHERE user_id=auth.uid()"]){await assert.rejects(query(sql));}
  await db.exec("RESET ROLE");
  assert.deepEqual((await query("SELECT * FROM profile_verifications ORDER BY profile_id")).rows,priorVerifications);
  assert.deepEqual((await query("SELECT * FROM user_roles ORDER BY user_id")).rows,priorRoles);
  await db.exec(`CREATE FUNCTION fail_optional_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_unavailable'; END $$; CREATE TRIGGER fail_optional_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_optional_audit();`);
  await as(1); await assert.rejects(save('Not saved',100,''),/audit_unavailable/);
  assert.equal(await scalar("SELECT nickname FROM profiles WHERE id=auth.uid()"),'Nickname only');
  await db.exec("RESET ROLE; SET ROLE anon");await assert.rejects(save());
  console.log('optional profile SQL PASS: no existing rows changed by migration; nickname-only save; pending/verified state untouched; roles/identity protected; no review queue; staff review disabled; validation; audit rollback; anon denied.');
}finally{await db.close();}
