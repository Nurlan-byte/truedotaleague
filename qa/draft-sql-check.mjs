// Run with a temporary PGlite install: npm install --no-save --package-lock=false @electric-sql/pglite
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const admin = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const valid = {
  title: "Fixture Draft",
  captainPlays: true,
  teams: [
    { name: "Alpha", captain: "Alice", captainNick: "A", players: [{ name: "P1" }] },
    { name: "Beta", captain: "Bob", players: [] },
  ],
};

async function query(sql, params = []) {
  return db.query(sql, params);
}
async function rejects(sql, params, label) {
  await assert.rejects(query(sql, params), undefined, label);
}
async function publish(version, result) {
  return query("select (public.publish_draft_result($1, $2::jsonb)).version as version", [
    version,
    JSON.stringify(result),
  ]);
}

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${admin}'), ('${member}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.audit_log(id bigint GENERATED ALWAYS AS IDENTITY, action text, actor_id uuid);
    CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT _uid = '${admin}'::uuid
    $$;
    CREATE FUNCTION public.write_audit(_action text, _entity text, _entity_id text,
      _tournament_id uuid, _reason text, _before jsonb, _after jsonb)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.fail_audit', true) = 'on' THEN RAISE EXCEPTION 'audit failure'; END IF;
      INSERT INTO public.audit_log(action, actor_id) VALUES (_action, auth.uid());
    END $$;
    SET request.jwt.claim.sub = '${admin}';
  `);
  const migration = await readFile(
    new URL("../drizzle/migrations/0002_draft_publication.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  // A manually applied Cloud migration must remain safe if the repo runner later sees it.
  await db.exec(migration);

  for (const [label, result] of [
    ["missing title", { captainPlays: true, teams: valid.teams }],
    ["null title", { ...valid, title: null }],
    ["missing captain participation", { title: "x", teams: valid.teams }],
    ["null captain participation", { ...valid, captainPlays: null }],
    ["missing teams", { title: "x", captainPlays: true }],
    ["null teams", { ...valid, teams: null }],
    ["one team", { ...valid, teams: valid.teams.slice(0, 1) }],
    ["too many teams", { ...valid, teams: Array(33).fill(valid.teams[0]) }],
    ["missing captain", { ...valid, teams: [{ name: "A", players: [] }, valid.teams[1]] }],
    [
      "null captain",
      { ...valid, teams: [{ name: "A", captain: null, players: [] }, valid.teams[1]] },
    ],
    ["missing players", { ...valid, teams: [{ name: "A", captain: "C" }, valid.teams[1]] }],
    [
      "too many players",
      {
        ...valid,
        teams: [{ ...valid.teams[0], players: Array(17).fill({ name: "P" }) }, valid.teams[1]],
      },
    ],
    [
      "missing player name",
      { ...valid, teams: [{ ...valid.teams[0], players: [{}] }, valid.teams[1]] },
    ],
    [
      "null player name",
      { ...valid, teams: [{ ...valid.teams[0], players: [{ name: null }] }, valid.teams[1]] },
    ],
    ["extra key", { ...valid, privateNote: "secret" }],
    ["oversize", { ...valid, title: "x".repeat(65537) }],
  ]) {
    await rejects(
      "select public.publish_draft_result($1, $2::jsonb)",
      [0, JSON.stringify(result)],
      label,
    );
  }
  assert.equal(
    (await query("select count(*)::int as count from public.draft_publications")).rows[0].count,
    0,
  );
  assert.equal((await publish(0, valid)).rows[0].version, 1);
  assert.equal(
    (await query("select count(*)::int as count from public.audit_log")).rows[0].count,
    1,
  );
  await rejects(
    "select public.publish_draft_result($1, $2::jsonb)",
    [0, JSON.stringify(valid)],
    "stale insert",
  );
  assert.equal((await publish(1, valid)).rows[0].version, 2);
  await rejects(
    "select public.publish_draft_result($1, $2::jsonb)",
    [1, JSON.stringify(valid)],
    "stale update",
  );
  await db.exec("SET test.fail_audit = 'on'");
  await rejects(
    "select public.publish_draft_result($1, $2::jsonb)",
    [2, JSON.stringify(valid)],
    "audit rollback",
  );
  assert.equal((await query("select version from public.draft_publications")).rows[0].version, 2);
  await db.exec("SET test.fail_audit = 'off'");

  await db.exec(`SET request.jwt.claim.sub = '${member}'; SET ROLE authenticated`);
  await rejects(
    "select public.publish_draft_result($1, $2::jsonb)",
    [2, JSON.stringify(valid)],
    "member publish",
  );
  await rejects("update public.draft_publications set version = 5", [], "member write");
  await rejects("select updated_by from public.draft_publications", [], "member private column");
  assert.equal((await query("select version from public.draft_publications")).rows[0].version, 2);
  await db.exec("RESET ROLE; SET ROLE anon");
  await rejects(
    "select public.publish_draft_result($1, $2::jsonb)",
    [2, JSON.stringify(valid)],
    "anonymous publish",
  );
  await rejects("update public.draft_publications set version = 5", [], "anonymous write");
  await rejects("select updated_by from public.draft_publications", [], "anonymous private column");
  assert.equal((await query("select version from public.draft_publications")).rows[0].version, 2);
  console.log(
    "draft SQL checks passed: validation, public read, private column, roles, version, audit rollback",
  );
} finally {
  await db.close();
}
