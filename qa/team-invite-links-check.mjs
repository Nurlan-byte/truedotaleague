// Run only against a fresh disposable loopback PostgreSQL database.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import postgres from 'postgres';
const url=process.env.TEAM_TEST_DATABASE_URL;
if(!url) throw Error('Set TEAM_TEST_DATABASE_URL to an empty local tdl_test_* database');
const parsed=new URL(url);
if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!/^\/tdl_test_[a-z0-9_]+$/i.test(parsed.pathname))throw Error('Refusing non-loopback or non-test database');
const options={max:1,prepare:false,onnotice:()=>{}};
const admin=postgres(url,options),first=postgres(url,options),second=postgres(url,options);
const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=async(sql,q,p=[])=>Object.values((await sql.unsafe(q,p))[0])[0];
async function actor(sql,n){await sql.unsafe('RESET ROLE');await sql.unsafe("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await sql.unsafe('SET ROLE authenticated');}
async function create(n){await actor(admin,n);return scalar(admin,"SELECT create_team($1,$2)",[`Team${n}`,`T${n}`]);}
async function link(owner,team){await actor(admin,owner);return scalar(admin,'SELECT create_team_invite_link($1)',[team]);}
async function accept(user,token){await actor(admin,user);return scalar(admin,'SELECT accept_team_invite_link($1)',[token]);}
async function race(label,userA,qA,pA,userB,qB,pB,errorPattern,isolation='READ COMMITTED',successfulRetry=false){
 await actor(first,userA);await actor(second,userB);
 const pid=await scalar(second,'SELECT pg_backend_pid()');
 await first.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);await second.unsafe(`BEGIN ISOLATION LEVEL ${isolation}`);
 await second.unsafe('SELECT count(*) FROM teams');
 try{
  await first.unsafe(qA,pA);
  const pending=second.unsafe(qB,pB).then(value=>({value}),error=>({error}));
  await admin.unsafe('RESET ROLE');
  let blocked=false;for(let n=0;n<160;n++){blocked=await scalar(admin,'SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted)',[pid]);if(blocked)break;await new Promise(r=>setTimeout(r,25));}
  assert.equal(blocked,true,label+': actual lock wait');await first.unsafe('COMMIT');
  const result=await pending;
  if(isolation==='REPEATABLE READ')assert.equal(result.error?.code,'40001',label);
  else if(successfulRetry){assert.equal(result.error,undefined,label);assert.equal(Object.values(result.value[0])[0].already_accepted,true,label);}
  else assert.match(result.error?.message??'',errorPattern,label);
  console.log(`PASS ${isolation}: ${label}`);
 }finally{await first.unsafe('ROLLBACK');await second.unsafe('ROLLBACK');}
}
try{
 assert.equal(await scalar(admin,"SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')"),0,'database must be empty');
 await admin.unsafe(`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
 END $$;
 CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const file of(await readdir(directory)).filter(f=>f<'20261021185000_legacy_team_guard.sql'&&f.endsWith('.sql')).sort())await admin.unsafe(await readFile(new URL(file,directory),'utf8'));
 for(const file of['0000_roles_and_tournament_schema.sql','0001_stage3_admin_rpcs.sql','0002_draft_publication.sql','0003_private_discord_profile.sql'])await admin.unsafe(await readFile(new URL('../drizzle/migrations/'+file,import.meta.url),'utf8'));
 for(let n=1;n<=120;n++)await admin.unsafe('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id(n),`fixture${n}@invalid.test`,JSON.stringify({nickname:`Fixture${n}`})]);
 const legacy=await scalar(admin,"INSERT INTO teams(name,tag,owner_id) VALUES('Legacy','OLD',$1) RETURNING id",[id(110)]);
 await admin.unsafe("INSERT INTO teams(name,tag,owner_id) VALUES('Legacy duplicate','OLD',$1)",[id(110)]);
 await admin.unsafe("INSERT INTO team_members(team_id,nickname,role,mmr) VALUES($1,'legacy','carry',1234)",[legacy]);
 await admin.unsafe('INSERT INTO team_captains(team_id,user_id) VALUES($1,$2)',[legacy,id(111)]);
 for(const file of['20261021185000_legacy_team_guard.sql','20261022090000_team_invitations.sql','20261022100000_team_application_roster.sql'])await admin.unsafe(await readFile(new URL(file,directory),'utf8'));
 const snapshot=()=>scalar(admin,"SELECT jsonb_build_object('teams',(SELECT jsonb_agg(t ORDER BY id) FROM teams t),'members',(SELECT jsonb_agg(m ORDER BY id) FROM team_members m),'captains',(SELECT jsonb_agg(c ORDER BY team_id,user_id) FROM team_captains c),'profiles',(SELECT jsonb_agg(p ORDER BY id) FROM profiles p),'invites',(SELECT jsonb_agg(i ORDER BY id) FROM team_invites i),'roles',(SELECT jsonb_agg(r ORDER BY id) FROM user_roles r))");
 const before=await snapshot();
 await admin.unsafe(await readFile(new URL('20261023110000_team_invite_links.sql',directory),'utf8'));
 assert.deepEqual(await snapshot(),before,'new migration preserves every existing row');
 const a=await create(1),b=await create(2),l=await link(1,a);
 assert.match(l.token,/^[0-9a-f]{64}$/);assert.equal(l.status,'pending');
 await admin.unsafe('RESET ROLE');
 const stored=await scalar(admin,'SELECT token_hash FROM team_invite_links WHERE id=$1',[l.id]);assert.notEqual(stored,l.token);
 assert.equal(await scalar(admin,'SELECT token_hash=encode(sha256(convert_to($1,\'UTF8\')),\'hex\') FROM team_invite_links WHERE id=$2',[l.token,l.id]),true);
 await admin.unsafe('SET ROLE anon');
 const preview=await scalar(admin,'SELECT preview_team_invite_link($1)',[l.token]);
 assert.deepEqual(Object.keys(preview).sort(),['logo_url','name','status','tag','team_id']);assert.equal(preview.team_id,a);
 assert.deepEqual(await scalar(admin,'SELECT preview_team_invite_link($1)',['bad']),{status:'unavailable'});
 await assert.rejects(admin.unsafe('SELECT * FROM team_invite_links'),/permission denied/);
 await assert.rejects(admin.unsafe('SELECT accept_team_invite_link($1)',[l.token]),/permission denied/);
 await actor(admin,3);
 for(const [q,p] of [['SELECT create_team_invite_link($1)',[a]],['SELECT list_team_invite_links($1)',[a]],['SELECT revoke_team_invite_link($1)',[l.id]]])await assert.rejects(admin.unsafe(q,p),/owner_required/);
 await assert.rejects(admin.unsafe("UPDATE team_invite_links SET status='accepted' WHERE id=$1",[l.id]),/permission denied/);
 await assert.rejects(admin.unsafe('SELECT * FROM team_invite_links'),/permission denied/);
 assert.equal((await accept(3,l.token)).already_accepted,false);assert.equal((await accept(3,l.token)).already_accepted,true);
 await assert.rejects(accept(4,l.token),/invitation_link_used/);
 await actor(admin,1);const listed=await scalar(admin,'SELECT list_team_invite_links($1)',[a]);assert.deepEqual(Object.keys(listed[0]).sort(),['created_at','id','status']);
 await assert.rejects(admin.unsafe('SELECT revoke_team_invite_link($1)',[l.id]),/invitation_link_used/);
 const revoked=await link(1,a);await admin.unsafe('SELECT revoke_team_invite_link($1)',[revoked.id]);await admin.unsafe('SELECT revoke_team_invite_link($1)',[revoked.id]);
 await assert.rejects(accept(4,revoked.token),/invitation_link_unavailable/);
 const free=await link(2,b);await assert.rejects(accept(1,free.token),/already_in_team/);await assert.rejects(accept(3,free.token),/already_in_team/);await assert.rejects(accept(111,free.token),/already_in_team/);
 await actor(admin,3);await admin.unsafe("SELECT manage_team($1,'leave')",[a]);assert.equal((await accept(3,l.token)).already_accepted,true);
 await admin.unsafe('RESET ROLE');assert.equal(await scalar(admin,'SELECT count(*)::int FROM team_members WHERE profile_id=$1',[id(3)]),0,'retry after leave must not rejoin');
 const deletable=await create(5),gone=await link(5,deletable);await admin.unsafe("SELECT manage_team($1,'delete')",[deletable]);
 await assert.rejects(accept(4,gone.token),/invitation_link_unavailable/);
 await actor(admin,1);const addressed=await scalar(admin,'SELECT invite_player($1,$2)',[a,id(6)]);await actor(admin,6);await admin.unsafe('SELECT accept_invite($1)',[addressed]);
 await admin.unsafe('RESET ROLE');await admin.unsafe('UPDATE profiles SET mmr=5432 WHERE id=$1',[id(6)]);assert.equal(await scalar(admin,'SELECT mmr FROM team_roster WHERE profile_id=$1',[id(6)]),5432);
 console.log('PASS old-row preservation, hash-only storage, private fields, owner authorization, guest preview, revoke, idempotency, busy identities, deletion, addressed invites and profile MMR');
 let n=10;
 for(const isolation of ['READ COMMITTED','REPEATABLE READ']){
  const owner=n++,team=await create(owner),other=n++,team2=await create(other);
  let user=n++,inv=await link(owner,team);
  await race('same user create vs link accept',user,"SELECT create_team('Race',$1)",[`R${user}`],user,'SELECT accept_team_invite_link($1)',[inv.token],/already_in_team/,isolation);
  user=n++;inv=await link(owner,team);const rival=n++;
  await race('one link two users',user,'SELECT accept_team_invite_link($1)',[inv.token],rival,'SELECT accept_team_invite_link($1)',[inv.token],/invitation_link_used/,isolation);
  user=n++;inv=await link(owner,team);const inv2=await link(other,team2);
  await race('same user two links',user,'SELECT accept_team_invite_link($1)',[inv.token],user,'SELECT accept_team_invite_link($1)',[inv2.token],/already_in_team/,isolation);
  user=n++;inv=await link(owner,team);
  await race('same user duplicate accept',user,'SELECT accept_team_invite_link($1)',[inv.token],user,'SELECT accept_team_invite_link($1)',[inv.token],/unused/,isolation,true);
  user=n++;inv=await link(owner,team);
  await race('revoke wins over accept',owner,'SELECT revoke_team_invite_link($1)',[inv.id],user,'SELECT accept_team_invite_link($1)',[inv.token],/invitation_link_unavailable/,isolation);
  for(let k=0;k<2;k++)await accept(n++,(await link(owner,team)).token);
  const last=n++,extra=n++,lastLink=await link(owner,team),extraLink=await link(owner,team);
  await race('last roster slot',last,'SELECT accept_team_invite_link($1)',[lastLink.token],extra,'SELECT accept_team_invite_link($1)',[extraLink.token],/team_full/,isolation);
  await admin.unsafe('RESET ROLE');assert.equal(await scalar(admin,'SELECT count(*)::int FROM team_members WHERE team_id=$1',[team]),7);
  assert.equal(await scalar(admin,'SELECT count(*)::int FROM team_members WHERE team_id=$1 AND position<5',[team]),5);
  assert.equal(await scalar(admin,'SELECT count(*)::int FROM team_members WHERE team_id=$1 AND position>=5',[team]),2);
 }
 console.log('PASS 12 true multi-session link races; no production connection');
}finally{await Promise.all([admin.end(),first.end(),second.end()]);}
