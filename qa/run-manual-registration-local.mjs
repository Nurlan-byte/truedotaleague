// Existing portable runtime only; creates an isolated local cluster, never a service.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.dirname(repo),bin=path.join(workspace,'portable-postgres-16','pgsql','bin');
const folder=await fs.mkdtemp(path.join(workspace,'qa-artifacts','manual-registration-pg-'));
const data=path.join(folder,'data'),passwordFile=path.join(folder,'init-password');
const password=randomBytes(32).toString('hex');
const env={...process.env,PGPASSWORD:password};
function run(exe,args,environment=env){return new Promise((resolve,reject)=>{
 const child=spawn(exe,args,{cwd:repo,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${path.basename(exe)} failed (${code})`)));
});}
let started=false;
try{
 await fs.writeFile(passwordFile,password,{flag:'wx',mode:0o600});
 await run(path.join(bin,'initdb.exe'),['-D',data,'--username=tdl_test_admin','--auth=scram-sha-256','--encoding=UTF8','--locale=C',`--pwfile=${passwordFile}`]);
 await fs.unlink(passwordFile);
 await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(folder,'postgres.log'),'-o','-h 127.0.0.1 -p 55432','-w','start']);started=true;
 await run(path.join(bin,'createdb.exe'),['-h','127.0.0.1','-p','55432','-U','tdl_test_admin','tdl_test_manual_registration']);
 await run(process.execPath,['qa/manual-registration-check.mjs'],{...env,TEAM_TEST_DATABASE_URL:`postgres://tdl_test_admin:${password}@127.0.0.1:55432/tdl_test_manual_registration`});
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 await fs.unlink(passwordFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
 if(started)await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop']);
 console.log('Isolated PostgreSQL stopped; fixtures retained in '+folder);
}
