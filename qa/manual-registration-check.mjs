// Isolated in-memory PostgreSQL; never connects to production.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

const url=process.env.TEAM_TEST_DATABASE_URL;
if(url){
 const parsed=new URL(url);
 if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!/^\/tdl_test_[a-z0-9_]+$/i.test(parsed.pathname))throw Error('Refusing nonlocal/non-test database');
}
const options={max:1,prepare:false,onnotice:()=>{}};
const pg=url?postgres(url,options):null;
const db = pg?{query:async(q,p=[])=>({rows:await pg.unsafe(q,p)}),exec:q=>pg.unsafe(q),close:()=>pg.end()}:new PGlite();
const id = n => `30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const run = async (sql,params=[]) => (await db.query(sql,params)).rows;
const scalar = async (sql,params=[]) => Object.values((await run(sql,params))[0])[0];
const actor = async n => {
 await db.exec('RESET ROLE');
 await run("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(n)]);
 await db.exec('SET ROLE authenticated');
};
try {
 assert.equal(Number(await scalar("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')")),0,'Requires fresh isolated database');
 await db.exec(`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
 END $$;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
 const directory = new URL('../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(directory)).filter(f=>f<'20261021185000_legacy_team_guard.sql'&&f.endsWith('.sql')).sort())
  await db.exec(await readFile(new URL(file,directory),'utf8'));
 for(const file of ['0000_roles_and_tournament_schema.sql','0001_stage3_admin_rpcs.sql','0002_draft_publication.sql','0003_private_discord_profile.sql'])
  await db.exec(await readFile(new URL('../drizzle/migrations/'+file,import.meta.url),'utf8'));
 for(const file of ['20261021185000_legacy_team_guard.sql','20261022090000_team_invitations.sql','20261022100000_team_application_roster.sql'])
  await db.exec(await readFile(new URL(file,directory),'utf8'));
 for(let n=1;n<=6;n++)await run('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)',[id(n),`fixture${n}@invalid.test`,JSON.stringify({nickname:`Player ${n}`})]);
 await run("UPDATE user_roles SET role='admin' WHERE user_id=$1",[id(6)]);
 const regulation=await scalar('INSERT INTO regulations DEFAULT VALUES RETURNING id');
 const version=await scalar("INSERT INTO regulation_versions(regulation_id,status,body) VALUES($1,'published','Fixture') RETURNING id",[regulation]);
 const oldTournament=await scalar("INSERT INTO tournaments(title,status,registration_closes_at) VALUES('Past deadline','registration_open',now()-interval '1 day') RETURNING id");
 const before=await scalar('SELECT to_jsonb(t) FROM tournaments t WHERE id=$1',[oldTournament]);
 await db.exec(await readFile(new URL('20261023090000_manual_registration.sql',directory),'utf8'));
 assert.deepEqual(await scalar('SELECT to_jsonb(t) FROM tournaments t WHERE id=$1',[oldTournament]),before,'migration preserves all historical row values');
 await actor(1);
 const team=await scalar("SELECT create_team('Fixture','FIXTURE')");
 const apply=key=>scalar('SELECT (submit_application($1,$2,$3,$4)).id',[oldTournament,team,version,key]);
 await assert.rejects(apply('four-or-less'),/minimum_five_main_players/);
 for(let n=2;n<=5;n++){
  await actor(1);const inv=await scalar('SELECT invite_player($1,$2)',[team,id(n)]);
  await actor(n);await run('SELECT accept_invite($1)',[inv]);
 }
 await actor(1);const app=await apply('past-date-open');
 await run('SELECT withdraw_application($1)',[app]);
 await db.exec('RESET ROLE');
 assert.equal(await scalar("SELECT to_jsonb(t)->>'registration_closes_at' FROM tournaments t WHERE id=$1",[oldTournament]),before.registration_closes_at,'deadline not cleared');
 const noDate=await scalar("INSERT INTO tournaments(title,status) VALUES('No deadline','registration_open') RETURNING id");
 await actor(1);await run('SELECT submit_application($1,$2,$3,$4)',[noDate,team,version,'without-close-date']);
 await assert.rejects(run("SELECT change_tournament_status($1,'registration_closed',NULL)",[oldTournament]),/forbidden/);
 await actor(6);await run("SELECT change_tournament_status($1,'registration_closed',NULL)",[oldTournament]);
 await actor(1);await assert.rejects(apply('closed-by-admin'),/registration_not_open/);
 await actor(6);await run("SELECT change_tournament_status($1,'registration_open','Reopen fixture')",[oldTournament]);
 await actor(1);await apply('reopened-by-admin');
 console.log('PASS: past/null deadline accepts five-main team; four/solo rejected; withdrawal ignores date; only admin closes/reopens; closed status rejects; migration preserves rows');
 if(url){
  const first=postgres(url,options),second=postgres(url,options);
  try{
   for(const isolation of ['READ COMMITTED','REPEATABLE READ']){
    await db.exec('RESET ROLE');
    const raceTournament=await scalar("INSERT INTO tournaments(title,status) VALUES('Close race','registration_open') RETURNING id");
    for(const [connection,user] of [[first,6],[second,1]]){
     await connection.unsafe('RESET ROLE');
     await connection.unsafe("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(user)]);
     await connection.unsafe('SET ROLE authenticated');
     await connection.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);
    }
    const pid=Object.values((await second.unsafe('SELECT pg_backend_pid()'))[0])[0];
    await second.unsafe('SELECT count(*) FROM tournaments');
    await first.unsafe("SELECT change_tournament_status($1,'registration_closed',NULL)",[raceTournament]);
    const pending=second.unsafe('SELECT submit_application($1,$2,$3,$4)',[raceTournament,team,version,`race-${isolation}`]).then(value=>({value}),error=>({error}));
    let waiting=false;
    for(let n=0;n<100;n++){
     waiting=await scalar('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted)',[pid]);
     if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(waiting,true,'submission must wait for close transaction');
    await first.unsafe('COMMIT');
    const outcome=await pending;
    assert.ok(outcome.error,'concurrent submit must fail after close');
    if(isolation==='REPEATABLE READ')assert.equal(outcome.error.code,'40001');
    else assert.match(outcome.error.message,/registration_not_open/);
    await second.unsafe('ROLLBACK');
    console.log(`PASS real-session close/application race ${isolation}`);
   }
  }finally{await first.end();await second.end();}
 }
} finally { await db.close(); }
