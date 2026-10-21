// Real independent PostgreSQL sessions; refuses production/nonempty databases.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import postgres from 'postgres';
const url=process.env.TEAM_TEST_DATABASE_URL;
if(!url){console.error('NOT RUN: TEAM_TEST_DATABASE_URL must name a fresh loopback tdl_test_* database');process.exit(2);}
const u=new URL(url);
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^\/tdl_test_[a-z0-9_]+$/i.test(u.pathname)) throw Error('Refusing nonlocal/non-test database');
const options={max:1,prepare:false,onnotice:()=>{}};
const db=postgres(url,options), a=postgres(url,options), b=postgres(url,options);
const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=async(c,q,p=[])=>Object.values((await c.unsafe(q,p))[0])[0];
const team=async(n,tag)=>scalar(db,"INSERT INTO teams(name,tag,owner_id) VALUES('Fixture',$1,$2) RETURNING id",[tag,id(n)]);
const snapshot=()=>scalar(db,"SELECT jsonb_build_object('teams',(SELECT jsonb_agg(t ORDER BY id) FROM teams t),'members',(SELECT jsonb_agg(m ORDER BY id) FROM team_members m),'captains',(SELECT jsonb_agg(c ORDER BY team_id,user_id) FROM team_captains c),'profiles',(SELECT jsonb_agg(p ORDER BY id) FROM profiles p))");
async function blocked(q,p=[]){await assert.rejects(db.unsafe(q,p),/already_in_team/);}
async function race(isolation,label,q1,p1,q2,p2){
 await a.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);await b.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);
 // Pin the second snapshot before the first writes: essential RR regression.
 await b.unsafe('SELECT count(*) FROM teams');
 const pid=await scalar(b,'SELECT pg_backend_pid()');
 let pending;
 try{
  await a.unsafe(q1,p1);
  pending=b.unsafe(q2,p2).then(value=>({value}),error=>({error}));
  let waits=false;
  for(let n=0;n<200;n++){
   waits=await scalar(db,"SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted)",[pid]);
   if(waits)break;
   await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(waits,true,`${label}: actual concurrent lock wait`);
  await a.unsafe('COMMIT');
  const result=await pending;
  assert.ok(result.error,`${label}: second write must fail`);
  if(isolation==='REPEATABLE READ')assert.equal(result.error.code,'40001',label);
  else assert.match(result.error.message,/already_in_team/,label);
  console.log(`PASS ${isolation}: ${label}`);
 }finally{await a.unsafe('ROLLBACK');if(pending)await pending;await b.unsafe('ROLLBACK');}
}
try{
 assert.equal(await scalar(db,"SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')"),0,'fresh database required');
 await db.unsafe(`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
 END $$;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
 const dir=new URL('../supabase/migrations/',import.meta.url),name='20261021185000_legacy_team_guard.sql';
 for(const f of (await readdir(dir)).filter(f=>f<name&&f.endsWith('.sql')).sort())await db.unsafe(await readFile(new URL(f,dir),'utf8'));
 for(const f of ['0000_roles_and_tournament_schema.sql','0001_stage3_admin_rpcs.sql','0002_draft_publication.sql','0003_private_discord_profile.sql'])await db.unsafe(await readFile(new URL(`../drizzle/migrations/${f}`,import.meta.url),'utf8'));
 for(let n=1;n<=80;n++)await db.unsafe('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(n),`fixture${n}@invalid.test`]);
 const old1=await team(1,'OLD1'),old2=await team(1,'OLD2'),target=await team(2,'TARGET');
 await db.unsafe("INSERT INTO team_members(team_id,nickname) VALUES($1,'das')",[old1]);
 await db.unsafe('INSERT INTO team_captains(team_id,user_id) VALUES($1,$2),($3,$2)',[old1,id(3),old2]);
 const before=await snapshot();
 await db.unsafe(await readFile(new URL(name,dir),'utf8'));
 assert.deepEqual(await snapshot(),before,'installation must not mutate existing rows');
 assert.equal(await scalar(db,'SELECT count(*)::int FROM team_membership_guard'),0,'no identity backfill');
 await db.unsafe("UPDATE teams SET name='Renamed' WHERE id=$1",[old1]);
 await db.unsafe("UPDATE team_members SET nickname='das unchanged account' WHERE team_id=$1",[old1]);
 await db.unsafe('UPDATE team_captains SET user_id=user_id WHERE user_id=$1',[id(3)]);
 await blocked("INSERT INTO teams(name,owner_id) VALUES('Duplicate',$1)",[id(1)]);
 await blocked("INSERT INTO teams(name,owner_id) VALUES('Captain',$1)",[id(3)]);
 await blocked('INSERT INTO team_members(team_id,profile_id,nickname) VALUES($1,$2,\'X\')',[target,id(1)]);
 await blocked('INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)',[target,id(1)]);
 await blocked('UPDATE team_members SET profile_id=$1 WHERE team_id=$2',[id(2),old1]);
 await blocked('UPDATE teams SET owner_id=$1 WHERE id=$2',[id(2),old1]);
 await blocked('UPDATE team_captains SET user_id=$1 WHERE team_id=$2',[id(2),old1]);
 // A move excludes its own old row, but not other existing associations.
 const moved=await scalar(db,"INSERT INTO team_members(team_id,profile_id,nickname) VALUES($1,$2,'Move') RETURNING id",[old1,id(4)]);
 await db.unsafe('UPDATE team_members SET team_id=$1 WHERE id=$2',[target,moved]);
 await blocked("INSERT INTO teams(name,owner_id) VALUES('Member',$1)",[id(4)]);
 await db.unsafe('UPDATE team_members SET profile_id=$1 WHERE id=$2',[id(5),moved]);
 await team(4,'FREED');
 // Model Supabase table grants explicitly; existing RLS remains in force.
 await db.unsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON teams,team_members,team_captains TO authenticated');
 await db.unsafe("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(1)]);await db.unsafe('SET ROLE authenticated');
 await blocked("INSERT INTO teams(name,owner_id) VALUES('Own duplicate',$1)",[id(1)]);
 await assert.rejects(db.unsafe("INSERT INTO teams(name,owner_id) VALUES('Impersonation',$1)",[id(70)]),/row-level security/);
 await assert.rejects(db.unsafe('SELECT * FROM team_membership_guard'),/permission denied/);
 await assert.rejects(db.unsafe('UPDATE team_membership_guard SET revision=0'),/permission denied/);
 await db.unsafe('RESET ROLE');
 console.log('PASS preservation, benign updates, direct writes, identity moves, authenticated RLS');
 let n=10;
 for(const isolation of ['READ COMMITTED','REPEATABLE READ']){
  for(const seeded of [false,true]){
   // Existing and absent guard row paths both need stale-snapshot coverage.
   const user=n++;
   if(seeded){const temporary=await team(user,`SEED${user}`);await db.unsafe('DELETE FROM teams WHERE id=$1',[temporary]);}
   await race(isolation,`create vs join (${seeded?'existing':'new'} guard)`,"INSERT INTO teams(name,owner_id) VALUES('Race',$1)",[id(user)],"INSERT INTO team_members(team_id,profile_id,nickname) VALUES($1,$2,'Race')",[target,id(user)]);
  }
  let user=n++;
  await race(isolation,'join vs create',"INSERT INTO team_members(team_id,profile_id,nickname) VALUES($1,$2,'Race')",[target,id(user)],"INSERT INTO teams(name,owner_id) VALUES('Race',$1)",[id(user)]);
  user=n++;
  await race(isolation,'create vs captain',"INSERT INTO teams(name,owner_id) VALUES('Race',$1)",[id(user)],'INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)',[target,id(user)]);
  user=n++;
  await race(isolation,'create vs create',"INSERT INTO teams(name,owner_id) VALUES('Race',$1)",[id(user)],"INSERT INTO teams(name,owner_id) VALUES('Race',$1)",[id(user)]);
  user=n++;
  await race(isolation,'join vs captain',"INSERT INTO team_members(team_id,profile_id,nickname) VALUES($1,$2,'Race')",[target,id(user)],'INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)',[old1,id(user)]);
  user=n++;
  const row=await scalar(db,"INSERT INTO team_members(team_id,nickname) VALUES($1,'Unbound') RETURNING id",[target]);
  await race(isolation,'create vs bind existing text row',"INSERT INTO teams(name,owner_id) VALUES('Race',$1)",[id(user)],'UPDATE team_members SET profile_id=$1 WHERE id=$2',[id(user),row]);
 }
 await assert.rejects(db.unsafe(await readFile(new URL('20261021190000_team_membership.sql',dir),'utf8')),/migration_duplicate_owners/);
 await db.unsafe('ROLLBACK');
 assert.equal(await scalar(db,"SELECT to_regclass('public.team_membership_guard') IS NOT NULL"),true,'failed full migration preserves guard');
 await blocked("INSERT INTO teams(name,owner_id) VALUES('Still protected',$1)",[id(1)]);
 console.log('PASS legacy guard: 14 real-session races; full preflight rollback retains protection; no production access or cleanup');
}finally{await Promise.all([a.end({timeout:5}),b.end({timeout:5}),db.end({timeout:5})]);}
