import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const query = (sql) => db.query(sql);
const denied = async (sql) => assert.rejects(query(sql));

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY, nickname text, avatar_url text, created_at timestamptz,
      updated_at timestamptz, bio text, mmr integer, role_position text,
      profile_url text, team_name text, team_role text, looking_for_team boolean,
      discord_id text, discord_username text, discord_global_name text
    );
    INSERT INTO public.profiles (id, nickname, discord_id, discord_username, discord_global_name)
    VALUES ('${alice}', 'Alice', 'discord-alice', 'alice', 'Alice D'),
           ('${bob}', 'Bob', 'discord-bob', 'bob', 'Bob D');
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
      FOR SELECT TO PUBLIC USING (true);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT ON public.profiles TO PUBLIC, anon, authenticated, service_role;
  `);

  const migration = await readFile(
    new URL("../drizzle/migrations/0003_private_discord_profile.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration); // Cloud SQL and the repo migration runner can safely repeat it.

  for (const role of ["anon", "authenticated"]) {
    const privileges = await query(`
      SELECT has_table_privilege('${role}', 'public.profiles', 'SELECT') AS table_select,
             has_column_privilege('${role}', 'public.profiles', 'nickname', 'SELECT') AS nickname,
             has_column_privilege('${role}', 'public.profiles', 'discord_id', 'SELECT') AS discord_id,
             has_column_privilege('${role}', 'public.profiles', 'discord_username', 'SELECT') AS discord_username,
             has_column_privilege('${role}', 'public.profiles', 'discord_global_name', 'SELECT') AS discord_global_name
    `);
    assert.deepEqual(privileges.rows[0], {
      table_select: false,
      nickname: true,
      discord_id: false,
      discord_username: false,
      discord_global_name: false,
    });
    await db.exec(`SET ROLE ${role}`);
    assert.equal(
      (await query("SELECT count(*)::int AS count FROM public.profiles")).rows[0].count,
      2,
    );
    await denied("SELECT discord_id FROM public.profiles");
    await denied("SELECT nickname FROM public.profiles WHERE discord_id = 'discord-alice'");
    await db.exec("RESET ROLE");
  }

  await db.exec("SET ROLE anon");
  await denied("SELECT public.get_my_discord_identity()");
  await db.exec("RESET ROLE");

  for (const [user, expected] of [
    [alice, "discord-alice"],
    [bob, "discord-bob"],
  ]) {
    await db.exec(`SET request.jwt.claim.sub = '${user}'; SET ROLE authenticated`);
    const result = await query("SELECT public.get_my_discord_identity() AS identity");
    assert.equal(result.rows[0].identity.discord_id, expected);
    await denied("SELECT public.get_my_discord_identity('someone-else')");
    await db.exec("RESET ROLE");
  }

  await db.exec("SET ROLE service_role");
  assert.equal(
    (await query("SELECT count(discord_id)::int AS count FROM public.profiles")).rows[0].count,
    2,
  );
  console.log(
    "profile privacy SQL checks passed: public fields, private fields, guest, own RPC, service role",
  );
} finally {
  await db.close();
}
