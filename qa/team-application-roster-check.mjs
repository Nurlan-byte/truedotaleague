// Optional true multi-session test, ONLY against a fresh disposable local database.
// Example: TEAM_TEST_DATABASE_URL=postgres://...@127.0.0.1/tdl_test_membership
// No production URL fallback and no database/table deletion.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";

const url = process.env.TEAM_TEST_DATABASE_URL;
if (url) {
 const parsed=new URL(url);
 if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!/^\/tdl_test_[a-z0-9_]+$/i.test(parsed.pathname))throw Error('Refusing nonlocal/non-test database');
}
const options={max:1,prepare:false,onnotice:()=>{}};
const wasm=url?null:new PGlite();
const adapter={unsafe:async(q,p=[])=>p.length?(await wasm.query(q,p)).rows:(await wasm.exec(q)).at(-1)?.rows??[],end:()=>wasm.close()};
const admin=url?postgres(url,options):adapter;
const first=url?postgres(url,options):null,second=url?postgres(url,options):null;
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
async function race(label, userA, statementA, argsA, userB, statementB, argsB, expectedError, isolation="READ COMMITTED") {
  await actor(first, userA);
  await actor(second, userB);
  const pid = await scalar(second, "SELECT pg_backend_pid()");
  await first.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);
  await second.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);
  await second.unsafe("SELECT count(*) FROM teams");
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
      blocked = await scalar(admin, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted)", [pid]);
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, `${label}: second session must actually wait for the first`);
    await first.unsafe("COMMIT");
    outcome = await pending;
    assert.ok(outcome.error, `${label}: competing operation should fail`);
    if(isolation==="REPEATABLE READ") assert.equal(outcome.error.code,"40001",label);
    else assert.match(outcome.error.message, expectedError, label);
    console.log(`PASS ${isolation}: ${label}`);
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
  const name = "20261022100000_team_application_roster.sql";
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f < "20261021185000_legacy_team_guard.sql" && f.endsWith(".sql")).sort()) {
    await admin.unsafe(await readFile(new URL(file, directory), "utf8"));
  }
  for (const file of ["0000_roles_and_tournament_schema.sql", "0001_stage3_admin_rpcs.sql", "0002_draft_publication.sql", "0003_private_discord_profile.sql"]) {
    await admin.unsafe(await readFile(new URL(`../drizzle/migrations/${file}`, import.meta.url), "utf8"));
  }
  for(let n=1;n<=60;n++)await admin.unsafe('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::text::jsonb)',[id(n),`fixture${n}@invalid.test`,JSON.stringify({nickname:`Player ${n}`})]);
  for(const f of ['20261021185000_legacy_team_guard.sql','20261022090000_team_invitations.sql'])await admin.unsafe(await readFile(new URL(f,directory),'utf8'));
  const team=await create(1,'TEAM'),other=await create(2,'OTHER');
  await admin.unsafe('RESET ROLE');
  const regulation=await scalar(admin,'INSERT INTO regulations DEFAULT VALUES RETURNING id');
  const version=await scalar(admin,"INSERT INTO regulation_versions(regulation_id,status,body) VALUES($1,'published','Fixture') RETURNING id",[regulation]);
  const tournament=await scalar(admin,"INSERT INTO tournaments(title,status,registration_closes_at) VALUES('Fixture','registration_open',now()+interval '1 day') RETURNING id");
  // An existing solo application is preserved, including its historical snapshot.
  await actor(admin,2);const historic=await scalar(admin,"SELECT (submit_application($1,$2,$3,'old-solo-app')).id",[tournament,other,version]);
  await admin.unsafe('RESET ROLE');const before=await scalar(admin,'SELECT to_jsonb(a) FROM applications a WHERE id=$1',[historic]);
  await admin.unsafe(await readFile(new URL(name,directory),'utf8'));
  assert.deepEqual(await scalar(admin,'SELECT to_jsonb(a) FROM applications a WHERE id=$1',[historic]),before);
  const apply=async(key='new-roster')=>scalar(admin,'SELECT (submit_application($1,$2,$3,$4)).id',[tournament,team,version,key]);
  const fails=()=>assert.rejects(apply(),/minimum_five_main_players/);
  await actor(admin,1);await fails(); // Solo creation remains valid, submission is blocked.
  const pending=await invite(1,team,3);await actor(admin,1);await fails();
  await accept(3,pending);
  for(const n of [4,5])await accept(n,await invite(1,team,n));
  await actor(admin,1);await fails(); // Four registered members.
  await admin.unsafe('RESET ROLE');
  const text=await scalar(admin,"INSERT INTO team_members(team_id,nickname,position) VALUES($1,'text',4) RETURNING id",[team]);
  await actor(admin,1);await fails(); // Free text cannot stand in for an account.
  await admin.unsafe('RESET ROLE');await admin.unsafe('DELETE FROM team_members WHERE id=$1',[text]);
  await accept(6,await invite(1,team,6));
  await admin.unsafe('RESET ROLE');await admin.unsafe('UPDATE team_members SET position=5 WHERE profile_id=$1',[id(6)]);
  await actor(admin,1);await fails(); // Reserve excluded.
  await admin.unsafe('RESET ROLE');await admin.unsafe('UPDATE team_members SET position=0 WHERE profile_id=$1',[id(6)]);
  await actor(admin,1);await fails(); // Duplicate legacy slots cannot stand in for five main slots.
  await admin.unsafe('RESET ROLE');await admin.unsafe('UPDATE team_members SET position=4 WHERE profile_id=$1',[id(6)]);
  const ownerRow=await scalar(admin,'SELECT to_jsonb(m) FROM team_members m WHERE profile_id=$1',[id(1)]);
  await admin.unsafe('DELETE FROM team_members WHERE profile_id=$1',[id(1)]);
  await actor(admin,1);await fails(); // Owner account does not count without membership.
  await admin.unsafe('RESET ROLE');await admin.unsafe("INSERT INTO team_members(id,team_id,profile_id,position,nickname) VALUES($1,$2,$3,0,'')",[ownerRow.id,team,id(1)]);
  // Same registered profile duplicated in another slot still counts once.
  await admin.unsafe('UPDATE team_members SET profile_id=$1 WHERE profile_id=$2',[id(5),id(6)]);
  await actor(admin,1);await fails();
  await admin.unsafe('RESET ROLE');await admin.unsafe('UPDATE team_members SET profile_id=$1 WHERE team_id=$2 AND position=4',[id(6),team]);
  await actor(admin,1);const app=await apply();
  assert.equal(await scalar(admin,"SELECT jsonb_array_length(roster_snapshot->'members') FROM applications WHERE id=$1",[app]),5);
  assert.equal(await apply(),app,'idempotent resubmission');
  const search=await scalar(admin,"SELECT search_team_players($1,'Player 2')",[team]);
  assert.equal(search.find(p=>p.id===id(2)).already_in_team,true,'busy owner visible');
  assert.equal((await scalar(admin,"SELECT search_team_players($1,'Player 3')",[team])).find(p=>p.id===id(3)).already_in_team,true,'busy member visible');
  assert.equal((await scalar(admin,"SELECT search_team_players($1,'Player 10')",[team])).find(p=>p.id===id(10)).already_in_team,false,'available profile visible');
  await assert.rejects(admin.unsafe('SELECT invite_player($1,$2)',[team,id(2)]),/already_in_team/);
  await assert.rejects(admin.unsafe('SELECT invite_player($1,$2)',[team,id(3)]),/already_in_team/);
  // Pending invitation becomes unusable after its recipient creates another team.
  const busyInvite=await invite(1,team,7);await create(7,'BUSY');await actor(admin,7);
  await assert.rejects(admin.unsafe('SELECT accept_invite($1)',[busyInvite]),/already_in_team/);
  console.log('PASS minimum-five registered main roster, duplicates/text/pending/reserves excluded, owner membership, preserved history, busy search/invite/accept');
  if(url){
   for(const [index,isolation] of ['READ COMMITTED','REPEATABLE READ'].entries()){
    const owner=20+index*10,roster=await create(owner,`R${owner}`);
    for(let n=1;n<5;n++)await accept(owner+n,await invite(owner,roster,owner+n));
    await race('leave wins before submit',owner+4,"SELECT manage_team($1,'leave')",[roster],owner,"SELECT submit_application($1,$2,$3,$4)",[tournament,roster,version,`race-test-${owner}`],/minimum_five_main_players/,isolation);
   }
   console.log('PASS real-session leave/application races RC and RR');
  }else console.log('PGlite single-session only: set TEAM_TEST_DATABASE_URL for actual RC/RR races');
} finally { await Promise.all([admin.end(),...(first?[first.end(),second.end()]:[])]); }
