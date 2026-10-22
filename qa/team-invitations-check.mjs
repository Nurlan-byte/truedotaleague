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
  const name = "20261022090000_team_invitations.sql";
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f < "20261021185000_legacy_team_guard.sql" && f.endsWith(".sql")).sort()) {
    await admin.unsafe(await readFile(new URL(file, directory), "utf8"));
  }
  for (const file of ["0000_roles_and_tournament_schema.sql", "0001_stage3_admin_rpcs.sql", "0002_draft_publication.sql", "0003_private_discord_profile.sql"]) {
    await admin.unsafe(await readFile(new URL(`../drizzle/migrations/${file}`, import.meta.url), "utf8"));
  }
  for(let n=1;n<=80;n++) await admin.unsafe("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)",[id(n),`fixture${n}@invalid.test`,JSON.stringify({nickname:`Player ${n}`})]);
  const old=await scalar(admin,"INSERT INTO teams(name,tag,owner_id) VALUES('Legacy','OLD',$1) RETURNING id",[id(70)]);
  await admin.unsafe("INSERT INTO teams(name,tag,owner_id) VALUES('Legacy duplicate','OLD',$1)",[id(70)]);
  await admin.unsafe("INSERT INTO team_members(team_id,nickname,role,mmr) VALUES($1,'das','legacy',1234)",[old]);
  await admin.unsafe('INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)',[old,id(71)]);
  const snapshot=()=>scalar(admin,"SELECT jsonb_build_object('teams',(SELECT jsonb_agg(t ORDER BY id) FROM teams t),'members',(SELECT jsonb_agg(m ORDER BY id) FROM team_members m),'captains',(SELECT jsonb_agg(c ORDER BY team_id,user_id) FROM team_captains c),'profiles',(SELECT jsonb_agg(p ORDER BY id) FROM profiles p))");
  const before=await snapshot();
  await admin.unsafe(await readFile(new URL('20261021185000_legacy_team_guard.sql',directory),'utf8'));
  await admin.unsafe(await readFile(new URL(name,directory),'utf8'));
  assert.deepEqual(await snapshot(),before,'migration preserves every old row');
  const a=await create(1,'A'),b=await create(2,'B');
  await actor(admin,1);
  assert.equal(await scalar(admin,'SELECT team_system_version()'),2);
  assert.equal(await scalar(admin,'SELECT count(*)::int FROM team_members WHERE team_id=$1 AND profile_id=$2 AND position=0',[a,id(1)]),1);
  const denied=async(q,p=[],pattern=/permission denied/)=>assert.rejects(admin.unsafe(q,p),pattern);
  await denied("INSERT INTO team_members(team_id,nickname) VALUES($1,'Bypass')",[a]);
  await denied('UPDATE team_members SET profile_id=$1 WHERE team_id=$2',[id(3),a]);
  await denied('INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)',[a,id(3)]);
  await denied("SELECT import_legacy_team('{}')");
  await denied('SELECT lock_team_user($1)',[id(3)]);
  await denied('SELECT * FROM team_write_guard');
  await denied("SELECT create_team('Again','AGAIN')",[],/already_in_team/);
  await actor(admin,71);await denied('SELECT invite_player($1,$2)',[old,id(3)],/owner_required/);
  await actor(admin,72);await denied("SELECT create_team('Tag',' old ')",[],/teams_unique_tag/);
  const inv=await invite(1,a,3);
  await actor(admin,4);await denied('SELECT accept_invite($1)',[inv],/not_invitation_recipient/);
  await denied('SELECT decline_invite($1)',[inv],/not_invitation_recipient/);
  await denied('SELECT cancel_invite($1)',[inv],/owner_required/);
  assert.equal((await scalar(admin,'SELECT list_team_invites()')).length,0);
  await accept(3,inv);
  await denied('SELECT accept_invite($1)',[inv],/invitation_not_pending/);
  await admin.unsafe('RESET ROLE');
  assert.deepEqual((await admin.unsafe('SELECT nickname,role,mmr FROM team_members WHERE profile_id=$1',[id(3)]))[0],{nickname:'',role:'',mmr:null});
  await admin.unsafe('UPDATE profiles SET mmr=4321 WHERE id=$1',[id(3)]);
  assert.equal(await scalar(admin,'SELECT mmr FROM team_roster WHERE profile_id=$1',[id(3)]),4321);
  assert.equal(await scalar(admin,'SELECT mmr FROM team_roster WHERE team_id=$1',[old]),null);
  const dec=await invite(1,a,4);await actor(admin,4);await admin.unsafe('SELECT decline_invite($1)',[dec]);
  const can=await invite(1,a,4);await actor(admin,1);await admin.unsafe('SELECT cancel_invite($1)',[can]);
  await actor(admin,70);await denied("SELECT manage_team($1,'delete')",[old],/legacy_data_requires_review/);
  await actor(admin,1);await denied("SELECT manage_team($1,'remove',$2)",[a,id(1)],/cannot_remove_owner/);
  await denied("SELECT manage_team($1,'leave')",[a],/owner_cannot_leave/);
  await actor(admin,2);await denied("SELECT manage_team($1,'logo',NULL,'x')",[a],/owner_required/);
  await admin.unsafe('RESET ROLE');
  const regulation=await scalar(admin,'INSERT INTO regulations DEFAULT VALUES RETURNING id');
  const version=await scalar(admin,"INSERT INTO regulation_versions(regulation_id,status,body) VALUES($1,'published','Fixture') RETURNING id",[regulation]);
  const tournament=await scalar(admin,"INSERT INTO tournaments(title,status,registration_closes_at) VALUES('Fixture','registration_open',now()+interval '1 day') RETURNING id");
  await actor(admin,70);
  const legacyApp=await scalar(admin,"SELECT (submit_application($1,$2,$3,'legacy-snapshot')).id",[tournament,old,version]);
  assert.deepEqual(await scalar(admin,"SELECT roster_snapshot->'members' FROM applications WHERE id=$1",[legacyApp]),[{nickname:'das',mmr:null,profile_id:null}]);
  await actor(admin,2);
  const soloApp=await scalar(admin,"SELECT (submit_application($1,$2,$3,'solo-snapshot')).id",[tournament,b,version]);
  assert.equal(await scalar(admin,"SELECT jsonb_array_length(roster_snapshot->'members') FROM applications WHERE id=$1",[soloApp]),1);
  await actor(admin,3);await denied('SELECT withdraw_application($1)',[soloApp],/owner_required/);
  await actor(admin,2);await admin.unsafe('SELECT withdraw_application($1)',[soloApp]);
  assert.equal(await scalar(admin,'SELECT status FROM applications WHERE id=$1',[soloApp]),'withdrawn');
  console.log('PASS preserved legacy snapshot with profile-only MMR, solo application, owner-only withdrawal');
  console.log('PASS preservation, owner-first, registered invitations, recipient authorization, direct writes denied, live MMR');
  let n=10;
  for(const isolation of ['READ COMMITTED','REPEATABLE READ']){
    const owner=n++,team=await create(owner,`R${owner}`),other=n++,team2=await create(other,`R${other}`);
    let user=n++,i=await invite(owner,team,user);
    await race('create vs accept',user,"SELECT create_team('Race',$1)",[`X${user}`],user,'SELECT accept_invite($1)',[i],/already_in_team/,isolation);
    user=n++;i=await invite(owner,team,user);
    await race('accept vs create',user,'SELECT accept_invite($1)',[i],user,"SELECT create_team('Race',$1)",[`X${user}`],/already_in_team/,isolation);
    user=n++;i=await invite(owner,team,user);const otherInvite=await invite(other,team2,user);
    await race('two invitations same user',user,'SELECT accept_invite($1)',[i],user,'SELECT accept_invite($1)',[otherInvite],/invitation_not_pending|already_in_team/,isolation);
    user=n++;i=await invite(owner,team,user);
    await race('double accept',user,'SELECT accept_invite($1)',[i],user,'SELECT accept_invite($1)',[i],/invitation_not_pending/,isolation);
    for(let k=0;k<2;k++){user=n++;await accept(user,await invite(owner,team,user));}
    const last=n++,excess=n++,lastInv=await invite(owner,team,last),excessInv=await invite(owner,team,excess);
    await race('last roster slot',last,'SELECT accept_invite($1)',[lastInv],excess,'SELECT accept_invite($1)',[excessInv],/team_full/,isolation);
    await admin.unsafe('RESET ROLE');assert.equal(await scalar(admin,'SELECT count(*)::int FROM team_members WHERE team_id=$1',[team]),7);
    const tagA=n++,tagB=n++;
    await race('normalized tag',tagA,"SELECT create_team('Tag',$1)",[`Z${tagA}`],tagB,"SELECT create_team('Tag',$1)",[` z${tagA} `],/teams_unique_tag/,isolation);
  }
  console.log('PASS 12 real-session races across READ COMMITTED and REPEATABLE READ; fixtures retained locally');
} finally { await Promise.all([admin.end(),first.end(),second.end()]); }
