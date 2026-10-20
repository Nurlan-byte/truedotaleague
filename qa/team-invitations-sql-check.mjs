import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
const connection = process.env.TDL_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /^\/tdl_team_rework_fixture(?:_[a-z0-9_]+)?$/);
}
const pg = connection ? postgres(connection, { max: 1, prepare: false, onnotice: () => {} }) : null;
const db = pg
  ? {
      query: async (s, p = []) => ({ rows: await pg.unsafe(s, p) }),
      exec: (s) => pg.unsafe(s),
      close: () => pg.end(),
    }
  : new PGlite();
const q = (s, p = []) => db.query(s, p);
const v = async (s, p) => Object.values((await q(s, p)).rows[0])[0];
const ids = Array.from(
  { length: 16 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [a, b, c, d, e] = ids;
let n = 0;
const eq = (x, y) => {
  assert.deepEqual(x, y);
  n++;
};
const deny = async (s, p, pattern) => {
  await assert.rejects(q(s, p), pattern);
  n++;
};
const as = async (u, role = "authenticated") =>
  db.exec(`RESET ROLE;SET request.jwt.claim.sub='${u ?? ""}';SET ROLE ${role}`);
const sql = await readFile(
  new URL("./pending-migrations/0004_team_invitations.sql", import.meta.url),
  "utf8",
);
try {
  await db.exec(
    `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;END $$;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`,
  );
  for (const f of (await readdir(new URL("../supabase/migrations", import.meta.url))).sort())
    await db.exec(await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"));
  for (const f of [
    "0000_roles_and_tournament_schema.sql",
    "0001_stage3_admin_rpcs.sql",
    "0002_draft_publication.sql",
    "0003_private_discord_profile.sql",
  ])
    await db.exec(await readFile(new URL("../drizzle/migrations/" + f, import.meta.url), "utf8"));
  await q(
    `INSERT INTO auth.users(id,email) SELECT x::uuid,'p'||n||'@example.invalid' FROM unnest($1::text[]) WITH ORDINALITY u(x,n)`,
    [ids],
  );
  await q(`UPDATE profiles SET nickname='Player',mmr=5000,role_position='Мид (2)'`);
  await q(`INSERT INTO teams(name,owner_id) VALUES('Legacy A',$1),('Legacy B',$1)`, [a]);
  await assert.rejects(db.exec(sql), /legacy_duplicate_owners/);
  await db.exec("ROLLBACK");
  eq(await v("select count(*)::int from teams"), 2);
  // Only disposable fixtures are removed to test the clean installation.
  await q("DELETE FROM teams");
  const legacy = await v(`INSERT INTO teams(name,owner_id) VALUES('Legacy',$1) RETURNING id`, [a]);
  const text = await v(
    `INSERT INTO team_members(team_id,nickname) VALUES($1,'unlinked') RETURNING id`,
    [legacy],
  );
  await assert.rejects(db.exec(sql), /legacy_unlinked_members/);
  await db.exec("ROLLBACK");
  eq(await v("select count(*)::int from team_members"), 1);
  await q("DELETE FROM team_members WHERE id=$1", [text]);
  await db.exec(sql);
  eq(await v("select count(*)::int from team_members where profile_id=$1", [a]), 1);
  await as(a);
  await deny(`insert into teams(name,owner_id) values('Bypass',$1)`, [a], /permission denied/);
  await deny(
    `insert into team_members(team_id,profile_id,nickname) values($1,$2,'x')`,
    [legacy, b],
    /permission denied/,
  );
  await deny(
    `insert into team_captains(team_id,user_id) values($1,$2)`,
    [legacy, b],
    /permission denied/,
  );
  await deny(`select create_team('Second','S')`, [], /already_in_team/);
  await as(b);
  const second = await v(`select create_team('Other','O')`);
  await as(a);
  await deny(
    "update team_members set profile_id=$1 where team_id=$2",
    [c, legacy],
    /permission denied/,
  );
  await deny("delete from team_members where team_id=$1", [legacy], /permission denied/);
  await deny("select team_actor()", [], /permission denied/);
  await deny("select team_gate()", [], /permission denied/);
  await deny("select manage_team($1,'remove',$2)", [legacy, a], /cannot_remove_owner/);
  const inv = await v("select create_team_invitation($1,$2)", [legacy, c]);
  await deny("select create_team_invitation($1,$2)", [legacy, c], /duplicate key/);
  await as(b);
  const competing = await v("select create_team_invitation($1,$2)", [second, c]);
  await as(d);
  eq(await v("select count(*)::int from team_invitations"), 0);
  eq(await v("select list_team_invitations()"), []);
  await deny(`select respond_team_invitation($1,'accept')`, [inv], /not_invitation_recipient/);
  await deny(`select respond_team_invitation($1,'cancel')`, [inv], /not_team_captain/);
  await deny("select search_team_players($1,$2)", [legacy, "Pl"], /not_team_captain/);
  await as(null, "anon");
  await deny("select list_team_invitations()", [], /permission denied/);
  await as(c);
  eq(await v(`select respond_team_invitation($1,'accept')`, [inv]), "accepted");
  eq(await v("select status from team_invitations where id=$1", [competing]), "cancelled");
  await deny(`select respond_team_invitation($1,'accept')`, [inv], /invitation_not_pending/);
  await deny(`select create_team('Third','T')`, [], /already_in_team/);
  await deny(`select manage_team($1,'captain',$2)`, [legacy, d], /owner_required/);
  await as(a);
  await deny(`select manage_team($1,'captain',$2)`, [legacy, d], /member_required/);
  await q(`select manage_team($1,'captain',$2)`, [legacy, c]);
  await as(c);
  eq((await v("select search_team_players($1,$2)", [legacy, "Pl"])).length, 13);
  const decline = await v("select create_team_invitation($1,$2)", [legacy, d]);
  await as(d);
  eq(await v(`select respond_team_invitation($1,'decline')`, [decline]), "declined");
  await as(c);
  const cancel = await v("select create_team_invitation($1,$2)", [legacy, d]);
  eq(await v(`select respond_team_invitation($1,'cancel')`, [cancel]), "cancelled");
  await as(a);
  await deny(`select manage_team($1,'leave')`, [legacy], /owner_cannot_leave/);
  await as(c);
  await q(
    `update profiles set nickname='Changed',mmr=6000,role_position='Саппорт (5)' where id=$1`,
    [c],
  );
  eq(await v("select mmr from team_members where profile_id=$1", [c]), 6000);
  await q(`select manage_team($1,'leave')`, [legacy]);
  eq(await v("select count(*)::int from team_captains where user_id=$1", [c]), 0);
  await as(a);
  let pending;
  for (let i = 2; i < 9; i++) {
    const x = await v("select create_team_invitation($1,$2)", [legacy, ids[i]]);
    if (i === 8) {
      pending = x;
      break;
    }
    await as(ids[i]);
    eq(await v(`select respond_team_invitation($1,'accept')`, [x]), "accepted");
    await as(a);
  }
  eq(
    await v(`select count(*)::int from team_members where team_id=$1 and roster_slot='main'`, [
      legacy,
    ]),
    5,
  );
  eq(
    await v(`select count(*)::int from team_members where team_id=$1 and roster_slot='reserve'`, [
      legacy,
    ]),
    2,
  );
  await as(ids[8]);
  await deny(`select respond_team_invitation($1,'accept')`, [pending], /team_full/);
  eq(await v("select status from team_invitations where id=$1", [pending]), "pending");
  await as(a);
  await q(`select manage_team($1,'remove',$2)`, [legacy, c]);
  await as(ids[8]);
  eq(await v(`select respond_team_invitation($1,'accept')`, [pending]), "accepted");
  await as(a);
  await deny(`select manage_team($1,'reserve',$2)`, [legacy, d], /slot_full/);
  await db.exec("RESET ROLE");
  await deny(
    `insert into teams(name,owner_id) values('Duplicate',$1)`,
    [a],
    /duplicate key|already_in_team/,
  );
  eq(
    (await v(
      `select count(*)::int from audit_log where action in ('invite_player','respond_invitation','manage_team','create_team')`,
    )) > 10,
    true,
  );
  const functions = (
    await q(
      "select proname,prosecdef,proconfig from pg_proc join pg_namespace ns on ns.oid=pronamespace where ns.nspname='public' and proname in ('create_team','manage_team','create_team_invitation','respond_team_invitation','list_team_invitations','search_team_players','team_gate','team_actor','team_owner_guard','team_member_guard','team_profile_sync')",
    )
  ).rows;
  eq(functions.length, 11);
  for (const f of functions) {
    eq(f.prosecdef, true);
    eq(
      f.proconfig.some((v) => v === 'search_path=""'),
      true,
    );
  }
  eq(await v("select to_regclass('public.team_invite_links')"), null);
  if (pg) await contention();
  console.log(
    `PASS ${n} assertions: real migration chain, preservation gates, grants/RLS, identity, captain membership, profile sync, 5+2 capacity, rollback/retry, cancellation, audit. ${pg ? "Isolated PostgreSQL 18, 3 real concurrent-session races passed." : "Isolated PGlite, serial only."}`,
  );
} catch (e) {
  console.error(
    "FAIL",
    e.message,
    e.where ?? "",
    e.detail ?? "",
    e.position,
    e.position ? sql.slice(Number(e.position) - 120, Number(e.position) + 120) : "",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}

async function contention() {
  await db.exec("RESET ROLE");
  const extra = Array.from(
    { length: 20 },
    (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  await q(
    `INSERT INTO auth.users(id,email) SELECT x::uuid,'race'||n||'@example.invalid' FROM unnest($1::text[]) WITH ORDINALITY u(x,n)`,
    [extra],
  );
  async function session(uid, fn) {
    const client = postgres(connection, { max: 1, prepare: false, onnotice: () => {} });
    try {
      return await client.begin(async (tx) => {
        await tx.unsafe(
          `SET LOCAL request.jwt.claim.sub='${uid}';SET LOCAL ROLE authenticated;SET LOCAL statement_timeout='8s'`,
        );
        return fn(tx);
      });
    } finally {
      await client.end();
    }
  }
  const rpc = async (uid, sql, p = []) =>
    session(uid, async (tx) => Object.values((await tx.unsafe(sql, p))[0])[0]);
  async function race(tasks) {
    const blocker = postgres(connection, { max: 1, prepare: false, onnotice: () => {} });
    let settled;
    try {
      await blocker.begin(async (tx) => {
        await tx.unsafe("select pg_advisory_xact_lock(620261020,1)");
        settled = Promise.allSettled(tasks.map((task) => task()));
        let waiters = 0;
        for (let attempt = 0; attempt < 100; attempt++) {
          waiters = await v(
            "select count(*)::int from pg_locks where locktype='advisory' and classid=620261020 and objid=1 and not granted",
          );
          if (waiters >= 2) break;
          await q("select pg_sleep(0.02)");
        }
        eq(waiters >= 2, true);
      });
      return await settled;
    } finally {
      await blocker.end();
    }
  }
  const t1 = await rpc(extra[0], "select create_team('Race1','R1')");
  const t2 = await rpc(extra[1], "select create_team('Race2','R2')");
  const i1 = await rpc(extra[0], "select create_team_invitation($1,$2)", [t1, extra[2]]);
  const i2 = await rpc(extra[1], "select create_team_invitation($1,$2)", [t2, extra[2]]);
  const same = await race([
    () => rpc(extra[2], "select respond_team_invitation($1,'accept')", [i1]),
    () => rpc(extra[2], "select respond_team_invitation($1,'accept')", [i2]),
  ]);
  eq(same.filter((r) => r.status === "fulfilled").length, 1);
  eq(await v("select count(*)::int from team_members where profile_id=$1", [extra[2]]), 1);
  const i3 = await rpc(extra[0], "select create_team_invitation($1,$2)", [t1, extra[3]]);
  const createAccept = await race([
    () => rpc(extra[3], "select respond_team_invitation($1,'accept')", [i3]),
    () => rpc(extra[3], "select create_team('RaceCreate','RC')"),
  ]);
  eq(createAccept.filter((r) => r.status === "fulfilled").length, 1);
  eq(
    await v(
      `WITH m AS (SELECT team_id FROM team_members WHERE profile_id=$1 UNION SELECT id FROM teams WHERE owner_id=$1) SELECT count(*)::int FROM m`,
      [extra[3]],
    ),
    1,
  );
  const cap = await rpc(extra[4], "select create_team('Capacity','CP')");
  for (let j = 5; j < 10; j++) {
    const i = await rpc(extra[4], "select create_team_invitation($1,$2)", [cap, extra[j]]);
    await rpc(extra[j], "select respond_team_invitation($1,'accept')", [i]);
  }
  const ca = await rpc(extra[4], "select create_team_invitation($1,$2)", [cap, extra[10]]);
  const cb = await rpc(extra[4], "select create_team_invitation($1,$2)", [cap, extra[11]]);
  const last = await race([
    () => rpc(extra[10], "select respond_team_invitation($1,'accept')", [ca]),
    () => rpc(extra[11], "select respond_team_invitation($1,'accept')", [cb]),
  ]);
  eq(last.filter((r) => r.status === "fulfilled").length, 1);
  eq(await v("select count(*)::int from team_members where team_id=$1", [cap]), 7);
  eq(
    await v("select count(*)::int from team_members where team_id=$1 and roster_slot='main'", [
      cap,
    ]),
    5,
  );
  eq(
    await v("select count(*)::int from team_members where team_id=$1 and roster_slot='reserve'", [
      cap,
    ]),
    2,
  );
}
