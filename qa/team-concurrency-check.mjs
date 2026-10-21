// Optional true multi-session test, ONLY against a fresh disposable local database.
// Example: TEAM_TEST_DATABASE_URL=postgres://...@127.0.0.1/tdl_test_membership
// No production URL fallback and no database/table deletion.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.TEAM_TEST_DATABASE_URL;
if (!url) {
  console.error("NOT RUN: set TEAM_TEST_DATABASE_URL to an empty disposable local tdl_test_* database.");
  process.exit(2);
}
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !/^\/tdl_test_[a-z0-9_]+$/i.test(parsed.pathname)) {
  throw new Error("Refusing non-loopback or non-test database. Use an empty local tdl_test_* database.");
}
const options = { max: 1, prepare: false, onnotice: () => {} };
const admin = postgres(url, options);
const first = postgres(url, options);
const second = postgres(url, options);
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scalar = async (sql, query, params = []) => Object.values((await sql.unsafe(query, params))[0])[0];
async function actor(sql, n) {
  await sql.unsafe("RESET ROLE");
  await sql.unsafe("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  await sql.unsafe("SET ROLE authenticated");
}
async function create(n, tag) {
  await actor(admin, n);
  return scalar(admin, "SELECT public.create_team($1,$2)", [`Team ${n}`, tag]);
}
async function invite(owner, team, member) {
  await actor(admin, owner);
  return scalar(admin, "SELECT public.invite_player($1,$2)", [team, id(member)]);
}
async function accept(member, invitation) {
  await actor(admin, member);
  await admin.unsafe("SELECT public.accept_invite($1)", [invitation]);
}
async function race(label, userA, statementA, argsA, userB, statementB, argsB, expectedError) {
  await actor(first, userA);
  await actor(second, userB);
  const pid = await scalar(second, "SELECT pg_backend_pid()");
  await first.unsafe("BEGIN");
  await second.unsafe("BEGIN");
  let outcome;
  try {
    await first.unsafe(statementA, argsA);
    const pending = second.unsafe(statementB, argsB).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await admin.unsafe("RESET ROLE");
    let blocked = false;
    // Observe the actual advisory-lock wait instead of assuming a timing race.
    for (let n = 0; n < 100; n++) {
      blocked = await scalar(admin, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted)", [pid]);
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, `${label}: second session must actually wait for the first`);
    await first.unsafe("COMMIT");
    outcome = await pending;
    assert.ok(outcome.error, `${label}: competing operation should fail`);
    assert.match(outcome.error.message, expectedError, label);
    console.log(`PASS simultaneous sessions: ${label}`);
  } finally {
    await first.unsafe("ROLLBACK");
    await second.unsafe("ROLLBACK");
  }
}

try {
  assert.equal(await scalar(admin, "SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')"), 0, "Database must be empty");
  await admin.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  const name = "20261021190000_team_membership.sql";
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f < name && f.endsWith(".sql")).sort()) {
    await admin.unsafe(await readFile(new URL(file, directory), "utf8"));
  }
  for (const file of ["0000_roles_and_tournament_schema.sql", "0001_stage3_admin_rpcs.sql", "0002_draft_publication.sql", "0003_private_discord_profile.sql"]) {
    await admin.unsafe(await readFile(new URL(`../drizzle/migrations/${file}`, import.meta.url), "utf8"));
  }
  await admin.unsafe(await readFile(new URL(name, directory), "utf8"));
  for (let n = 1; n <= 20; n++) await admin.unsafe("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)", [id(n), `fixture${n}@invalid.test`, JSON.stringify({ nickname: `Player ${n}` })]);
  const a = await create(1, "A");
  const b = await create(2, "B");
  const third = await invite(1, a, 3);
  await race("create beats accept", 3, "SELECT public.create_team('Third','C')", [], 3, "SELECT public.accept_invite($1)", [third], /already_in_team/);
  const fourth = await invite(1, a, 4);
  await race("accept beats create", 4, "SELECT public.accept_invite($1)", [fourth], 4, "SELECT public.create_team('Fourth','D')", [], /already_in_team/);
  const fifthA = await invite(1, a, 5);
  const fifthB = await invite(2, b, 5);
  await race("two teams invite same member", 5, "SELECT public.accept_invite($1)", [fifthA], 5, "SELECT public.accept_invite($1)", [fifthB], /invitation_not_pending/);
  for (const n of [6, 7, 8]) await accept(n, await invite(1, a, n));
  const ninth = await invite(1, a, 9);
  const tenth = await invite(1, a, 10);
  await race("two players compete for final roster slot", 9, "SELECT public.accept_invite($1)", [ninth], 10, "SELECT public.accept_invite($1)", [tenth], /team_full/);
  await race("duplicate owner", 11, "SELECT public.create_team('Eleven','E11')", [], 11, "SELECT public.create_team('Eleven again','E12')", [], /already_in_team/);
  await race("normalized tag", 12, "SELECT public.create_team('Twelve','RACE')", [], 13, "SELECT public.create_team('Thirteen',' race ')", [], /teams_unique_tag/);
  const fourteenth = await invite(2, b, 14);
  await race("double accept", 14, "SELECT public.accept_invite($1)", [fourteenth], 14, "SELECT public.accept_invite($1)", [fourteenth], /invitation_not_pending/);
  await admin.unsafe("RESET ROLE");
  assert.equal(await scalar(admin, "SELECT count(*)::int FROM team_members WHERE team_id=$1", [a]), 7);
  assert.equal(await scalar(admin, "SELECT count(*)::int FROM (SELECT profile_id FROM team_members GROUP BY profile_id HAVING count(*)>1) d"), 0);
  console.log("All multi-session checks passed. Fixtures retained in the disposable local database.");
} finally {
  await Promise.all([admin.end(), first.end(), second.end()]);
}
