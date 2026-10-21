// Isolated PostgreSQL WASM checks. No network or production credentials are used.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrationPath = "20261021190000_team_membership.sql";
const migration = await readFile(new URL(`../supabase/migrations/${migrationPath}`, import.meta.url), "utf8");
const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await query(sql, args)).rows[0])[0];
async function as(user) {
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${uid(user)}'; SET ROLE authenticated;`);
}
async function denied(sql, args = [], match) {
  await assert.rejects(query(sql, args), match);
}
async function create(user, name = `Team ${user}`, tag = `T${user}`) {
  await as(user);
  return scalar("SELECT public.create_team($1,$2)", [name, tag]);
}
async function invite(owner, team, player) {
  await as(owner);
  return scalar("SELECT public.invite_player($1,$2)", [team, uid(player)]);
}
async function accept(player, id) {
  await as(player);
  return query("SELECT public.accept_invite($1)", [id]);
}

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter((n) => n < "20261021185000_legacy_team_guard.sql").sort()) {
    if (name.endsWith(".sql")) await db.exec(await readFile(new URL(name, directory), "utf8"));
  }
  for (const name of ["0000_roles_and_tournament_schema.sql", "0001_stage3_admin_rpcs.sql", "0002_draft_publication.sql", "0003_private_discord_profile.sql"]) {
    await db.exec(await readFile(new URL(`../drizzle/migrations/${name}`, import.meta.url), "utf8"));
  }
  for (let n = 1; n <= 16; n++) {
    await query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)", [uid(n), `fixture${n}@invalid.test`, JSON.stringify({ nickname: `Player ${n}` })]);
    await query("UPDATE public.profiles SET mmr=$1 WHERE id=$2", [n * 100, uid(n)]);
  }
  // The migration is a release gate, not a cleanup script. Failure rolls back all DDL.
  const legacy = await scalar("INSERT INTO teams(name,tag,owner_id) VALUES('Legacy','OLD',$1) RETURNING id", [uid(1)]);
  await query("INSERT INTO teams(name,tag,owner_id) VALUES('Duplicate','OTHER',$1)", [uid(1)]);
  await assert.rejects(db.exec(migration), /migration_duplicate_owners/);
  await db.exec("ROLLBACK");
  assert.equal(await scalar("SELECT count(*)::int FROM teams"), 2);
  assert.equal(await scalar("SELECT to_regclass('public.team_captains') IS NOT NULL"), true);
  await query("DELETE FROM teams WHERE id<>$1", [legacy]);
  await query("INSERT INTO teams(name,tag,owner_id) VALUES('Tag conflict',' old ',$1)", [uid(2)]);
  await assert.rejects(db.exec(migration), /migration_conflicting_tags/);
  await db.exec("ROLLBACK");
  assert.equal(await scalar("SELECT count(*)::int FROM teams"), 2);
  await query("DELETE FROM teams WHERE id<>$1", [legacy]);
  await query("INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)", [legacy, uid(2)]);
  await assert.rejects(db.exec(migration), /migration_legacy_data_requires_approval/);
  await db.exec("ROLLBACK");
  assert.equal(await scalar("SELECT count(*)::int FROM team_captains"), 1);
  await db.exec("DELETE FROM team_captains");
  await query("INSERT INTO team_members(team_id,nickname) VALUES($1,'das')", [legacy]);
  await assert.rejects(db.exec(migration), /migration_unlinked_members/);
  await db.exec("ROLLBACK");
  assert.equal(await scalar("SELECT nickname FROM team_members"), "das");
  await query("UPDATE team_members SET profile_id=$1", [uid(1)]);
  await assert.rejects(db.exec(migration), /migration_legacy_data_requires_approval/);
  await db.exec("ROLLBACK");
  assert.equal(await scalar("SELECT nickname FROM team_members"), "das");
  await db.exec("DELETE FROM team_members; DELETE FROM teams;");
  await db.exec(await readFile(new URL("../supabase/migrations/20261021185000_legacy_team_guard.sql", import.meta.url), "utf8"));
  await db.exec(migration);
  assert.equal(await scalar("SELECT to_regclass('public.team_membership_guard') IS NULL"), true);
  assert.equal(await scalar("SELECT to_regclass('public.team_captains') IS NULL"), true);
  assert.equal(await scalar("SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='team_members' AND column_name IN ('nickname','role','mmr')"), 0);
  assert.equal(await scalar("SELECT to_regprocedure('public.is_team_captain(uuid,uuid)') IS NULL"), true);

  await db.exec("SET ROLE anon");
  await denied("SELECT public.create_team('Guest','GUEST')");
  await denied("SELECT public.team_system_version()");
  await db.exec("RESET ROLE");
  const a = await create(1, "Альфа", "Alpha");
  assert.equal(await scalar("SELECT public.team_system_version()"), 2);
  assert.deepEqual((await query("SELECT profile_id,position FROM team_members WHERE team_id=$1", [a])).rows, [{ profile_id: uid(1), position: 0 }]);
  await denied("SELECT public.create_team('Again','A2')", [], /already_in_team/);
  await denied("INSERT INTO teams(name,tag,owner_id) VALUES('Direct','D',$1)", [uid(1)]);
  await denied("UPDATE teams SET owner_id=$1 WHERE id=$2", [uid(2), a]);
  await denied("INSERT INTO team_members(team_id,profile_id,position) VALUES($1,$2,1)", [a, uid(2)]);
  await denied("SELECT public.import_legacy_team('{}')");
  await as(2);
  await denied("SELECT public.create_team('Duplicate tag',' alpha ')", [], /teams_unique_tag/);
  await denied("SELECT public.create_team('No tag','')", [], /invalid_team_name_or_tag/);
  const b = await create(2, "Бета", "Beta");
  await denied("SELECT public.invite_player($1,$2)", [a, uid(3)], /owner_required/);
  const inviteA = await invite(1, a, 3);
  await denied("SELECT public.invite_player($1,$2)", [a, uid(3)], /team_invites_pending_unique/);
  const inviteB = await invite(2, b, 3);
  await as(4);
  await denied("SELECT public.accept_invite($1)", [inviteA], /not_invitation_recipient/);
  await denied("SELECT public.decline_invite($1)", [inviteA], /not_invitation_recipient/);
  await denied("SELECT public.cancel_invite($1)", [inviteA], /owner_required/);
  assert.equal(await scalar("SELECT jsonb_array_length(public.list_team_invites())"), 0);
  assert.equal(await scalar("SELECT count(*)::int FROM team_invites"), 0);
  await denied("INSERT INTO team_invites(team_id,invited_user_id) VALUES($1,$2)", [a, uid(4)]);
  await denied("UPDATE team_invites SET status='accepted' WHERE id=$1", [inviteA]);
  await accept(3, inviteA);
  await denied("SELECT public.accept_invite($1)", [inviteA], /invitation_not_pending/);
  await denied("SELECT public.accept_invite($1)", [inviteB], /invitation_not_pending/);
  await denied("SELECT public.create_team('Member team','M3')", [], /already_in_team/);
  await denied("SELECT public.invite_player($1,$2)", [a, uid(4)], /owner_required/);
  await denied("SELECT public.manage_team($1,'captain',$2)", [a, uid(4)], /owner_required/);
  await as(1);
  await denied("SELECT public.manage_team($1,'captain',$2)", [a, uid(3)], /invalid_action/);
  await denied("SELECT public.manage_team($1,NULL)", [a], /invalid_action/);
  await denied("SELECT public.manage_team($1,'remove',$2)", [a, uid(1)], /cannot_remove_owner/);
  await denied("SELECT public.manage_team($1,'leave')", [a], /owner_cannot_leave/);
  await denied("SELECT public.invite_player($1,$2)", [a, uid(2)], /already_in_team/);

  // MMR/nickname are live JOINs; no roster snapshot update is needed.
  await as(3);
  await query("UPDATE profiles SET mmr=7777,nickname='Новый ник' WHERE id=$1", [uid(3)]);
  assert.deepEqual((await query("SELECT nickname,mmr,is_captain FROM team_roster WHERE profile_id=$1", [uid(3)])).rows[0], { nickname: "Новый ник", mmr: 7777, is_captain: false });
  const declined = await invite(1, a, 4);
  await as(4); await query("SELECT public.decline_invite($1)", [declined]);
  await denied("SELECT public.accept_invite($1)", [declined], /invitation_not_pending/);
  const cancelled = await invite(1, a, 4);
  await query("SELECT public.cancel_invite($1)", [cancelled]);
  await as(4); await denied("SELECT public.accept_invite($1)", [cancelled], /invitation_not_pending/);
  const racingOwner = await invite(1, a, 10);
  const c = await create(10, "Owner during invitation", "C10");
  await denied("SELECT public.accept_invite($1)", [racingOwner], /already_in_team/);
  for (const player of [4, 5, 6, 7]) await accept(player, await invite(1, a, player));
  const last = await invite(1, a, 8);
  const overflow = await invite(1, a, 9);
  await accept(8, last);
  await as(9); await denied("SELECT public.accept_invite($1)", [overflow], /team_full/);
  await as(1); await denied("SELECT public.invite_player($1,$2)", [a, uid(11)], /team_full/);
  assert.deepEqual((await query("SELECT roster_slot,count(*)::int n FROM team_roster WHERE team_id=$1 GROUP BY roster_slot ORDER BY roster_slot", [a])).rows, [{ roster_slot: "main", n: 5 }, { roster_slot: "reserve", n: 2 }]);

  // Constraints are also enforced against privileged writes bypassing all RPC checks.
  await db.exec("RESET ROLE");
  await denied("INSERT INTO teams(name,tag,owner_id) VALUES('Bypass','BYPASS',$1)", [uid(3)], /team_members_single_team/);
  await denied("INSERT INTO team_members(team_id,profile_id,position) VALUES($1,$2,1)", [b, uid(3)], /team_members_single_team/);
  await denied("INSERT INTO team_members(team_id,profile_id,position) VALUES($1,$2,7)", [a, uid(11)], /team_members_position_range/);
  await denied("UPDATE team_members SET position=6 WHERE profile_id=$1", [uid(1)], /owner_first_member/);
  await denied("UPDATE teams SET owner_id=$1 WHERE id=$2", [uid(11), b], /owner_transfer_disabled/);
  await denied("DELETE FROM team_members WHERE profile_id=$1", [uid(1)], /teams_owner_membership/);

  // Solo owner can apply; ordinary members cannot submit, withdraw or reacknowledge.
  const regulation = await scalar("INSERT INTO regulations DEFAULT VALUES RETURNING id");
  const version = await scalar("INSERT INTO regulation_versions(regulation_id,status,body) VALUES($1,'published','Fixture') RETURNING id", [regulation]);
  const tournament = await scalar("INSERT INTO tournaments(title,status,registration_closes_at) VALUES('Fixture','registration_open',now()+interval '1 day') RETURNING id");
  await as(2);
  const application = await scalar("SELECT (public.submit_application($1,$2,$3,'solo-fixture')).id", [tournament, b, version]);
  assert.equal(await scalar("SELECT jsonb_array_length(roster_snapshot->'members') FROM applications WHERE id=$1", [application]), 1);
  await as(3);
  await denied("SELECT public.submit_application($1,$2,$3,'member-fixture')", [tournament, a, version], /owner_required/);
  await denied("SELECT public.withdraw_application($1)", [application], /owner_required/);
  await denied("SELECT public.reacknowledge_regulation($1,$2)", [application, version], /owner_required/);
  await as(2); await query("SELECT public.withdraw_application($1)", [application]);
  await denied("SELECT public.manage_team($1,'delete')", [b], /team_has_history/);

  // Failed audit writes roll back team/membership creation atomically.
  await db.exec(`RESET ROLE; CREATE FUNCTION public.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_audit_failure'; END $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.test_audit_failure();`);
  await as(12); await denied("SELECT public.create_team('Rollback','ROLL')", [], /fixture_audit_failure/);
  assert.equal(await scalar("SELECT count(*)::int FROM teams WHERE owner_id=$1", [uid(12)]), 0);
  assert.equal(await scalar("SELECT count(*)::int FROM team_members WHERE profile_id=$1", [uid(12)]), 0);
  await db.exec("RESET ROLE; DROP TRIGGER test_audit_failure ON public.audit_log;");
  await as(3); await query("SELECT public.manage_team($1,'leave')", [a]);
  await create(3, "After leaving", "AFTER");
  await as(10); await query("SELECT public.manage_team($1,'delete')", [c]);
  assert.equal(await scalar("SELECT count(*)::int FROM team_members WHERE profile_id=$1", [uid(10)]), 0);
  console.log("team membership SQL checks passed: baseline migrations, preflight rollback, owner/member uniqueness, 5+2 limits, invitation authorization/lifecycle, live profile JOIN, solo applications, direct-write denial, audit atomicity");
  console.log("PGlite uses one connection: true simultaneous sessions require qa/team-concurrency-check.mjs against an isolated local PostgreSQL instance.");
} finally {
  await db.close();
}
