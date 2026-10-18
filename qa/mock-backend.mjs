// Local-only Supabase-shaped fixture server for browser QA. Never use as a deployed backend.
import { createServer } from "node:http";

const port = 8090;
const adminId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const now = "2026-10-18T12:00:00Z";
const baseTournament = {
  description: "Локальная фикстура для проверки интерфейса.",
  mode: "online",
  place: null,
  prize_pool: 100000,
  prize_currency: "KZT",
  team_limit: 8,
  format: "single_elimination",
  image_url: null,
  registration_opens_at: "2026-10-10T12:00:00Z",
  registration_closes_at: "2026-10-20T12:00:00Z",
  cancel_reason: null,
  closed_reason: null,
  tournament_participants: [],
  matches: [],
  placements: [],
};
const tournaments = [
  {
    ...baseTournament,
    id: "44444444-4444-4444-8444-444444444444",
    title: "Autumn Cup",
    status: "registration_open",
    starts_at: "2026-10-25T12:00:00Z",
  },
  {
    ...baseTournament,
    id: "55555555-5555-4555-8555-555555555555",
    title: "Summer Finals",
    status: "finished",
    starts_at: "2026-08-05T12:00:00Z",
    tournament_participants: [{ team_id: teamId, team_name: "Aurora", logo_url: null }],
    matches: [
      { id: "m1", team_a_id: teamId, team_b_id: null, score_a: 2, score_b: 0, scheduled_at: now },
    ],
    placements: [{ team_id: teamId, team_name: "Aurora", place: 1, points: 50 }],
  },
];
const teams = [
  {
    id: teamId,
    name: "Aurora",
    tag: "AUR",
    owner_id: userId,
    logo_url: null,
    created_at: now,
    team_members: [
      { id: "p1", team_id: teamId, nickname: "Invoker", role: "mid", mmr: 6000, position: 0 },
      { id: "p2", team_id: teamId, nickname: "Rubick", role: "support", mmr: 5500, position: 2 },
    ],
    team_captains: [],
  },
];
const applications = [
  {
    id: "a1",
    tournament_id: tournaments[0].id,
    team_id: teamId,
    status: "rejected",
    reject_reason: "Нужна проверка состава",
    created_at: now,
    regulation_version_id: null,
    tournaments: {
      title: tournaments[0].title,
      registration_closes_at: tournaments[0].registration_closes_at,
      status: "registration_open",
    },
  },
  {
    id: "a2",
    tournament_id: tournaments[1].id,
    team_id: teamId,
    status: "withdrawn",
    reject_reason: null,
    created_at: now,
    regulation_version_id: null,
    tournaments: {
      title: tournaments[1].title,
      registration_closes_at: tournaments[1].registration_closes_at,
      status: "finished",
    },
  },
];
let publication = null;
let failNextPublish = false;

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function bearerRole(req) {
  const token = req.headers.authorization?.replace(/^Bearer /i, "");
  if (!token) return "anon";
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).app_role || "user";
  } catch {
    return "anon";
  }
}

function fakeToken(role) {
  const user = role === "admin" ? adminId : userId;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: user,
      aud: "authenticated",
      role: "authenticated",
      app_role: role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  return `${header}.${payload}.fixture`;
}

function authUser(role) {
  return {
    id: role === "admin" ? adminId : userId,
    aud: "authenticated",
    role: "authenticated",
    email: role === "admin" ? "admin@example.test" : "member@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { nickname: role === "admin" ? "Test Admin" : "Test Member" },
    created_at: now,
  };
}

async function readBody(req) {
  let value = "";
  for await (const chunk of req) value += chunk;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  console.log(`${req.method} ${url.pathname}`);
  const role = bearerRole(req);
  if (req.method === "OPTIONS") return json(res, 204, null);
  if (url.pathname === "/__fixture__/fail-next-publish" && req.method === "POST") {
    failNextPublish = true;
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const body = await readBody(req);
    if (
      body.password !== "fixture-password" ||
      !["admin@example.test", "member@example.test"].includes(body.email)
    )
      return json(res, 400, {
        error: "invalid_grant",
        error_description: "Invalid fixture credentials",
      });
    const loginRole = body.email.startsWith("admin") ? "admin" : "user";
    return json(res, 200, {
      access_token: fakeToken(loginRole),
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "fixture-refresh",
      user: authUser(loginRole),
    });
  }
  if (url.pathname === "/auth/v1/user")
    return json(
      res,
      role === "anon" ? 401 : 200,
      role === "anon" ? { message: "no fixture session" } : authUser(role),
    );
  if (url.pathname === "/auth/v1/logout") return json(res, 204, null);
  if (url.pathname === "/rest/v1/tournaments") return json(res, 200, tournaments);
  if (url.pathname === "/rest/v1/teams") {
    if (req.method === "POST") {
      const input = await readBody(req);
      const team = {
        id: crypto.randomUUID(),
        name: input.name,
        tag: input.tag,
        owner_id: role === "admin" ? adminId : userId,
        logo_url: null,
        created_at: new Date().toISOString(),
        team_members: [],
        team_captains: [],
      };
      teams.push(team);
      return json(res, 201, [team]);
    }
    const owner = url.searchParams.get("owner_id")?.replace("eq.", "");
    return json(res, 200, owner ? teams.filter((team) => team.owner_id === owner) : teams);
  }
  if (url.pathname === "/rest/v1/team_captains") return json(res, 200, []);
  if (url.pathname === "/rest/v1/team_members") {
    if (req.method === "POST") {
      const input = await readBody(req);
      const team = teams.find((item) => item.id === input.team_id);
      if (!team) return json(res, 400, { message: "missing fixture team" });
      const member = { id: crypto.randomUUID(), ...input };
      team.team_members.push(member);
      return json(res, 201, [member]);
    }
    return json(
      res,
      200,
      teams.flatMap((team) => team.team_members),
    );
  }
  if (url.pathname === "/rest/v1/applications") return json(res, 200, applications);
  if (url.pathname === "/rest/v1/regulation_versions") return json(res, 200, []);
  if (url.pathname === "/rest/v1/profiles")
    return json(res, 200, [
      {
        id: role === "admin" ? adminId : userId,
        nickname: role === "admin" ? "Test Admin" : "Test Member",
        avatar_url: null,
      },
    ]);
  if (url.pathname === "/rest/v1/user_roles")
    return json(res, 200, role === "admin" ? [{ role: "admin" }] : []);
  if (url.pathname === "/rest/v1/draft_publications")
    return json(res, 200, publication ? [publication] : []);
  if (url.pathname === "/rest/v1/rpc/publish_draft_result" && req.method === "POST") {
    if (role !== "admin") return json(res, 403, { message: "forbidden" });
    if (failNextPublish) {
      failNextPublish = false;
      return json(res, 503, { message: "fixture publish failure" });
    }
    const body = await readBody(req);
    if (body.p_expected_version !== (publication?.version ?? 0))
      return json(res, 409, { message: "stale version" });
    publication = {
      id: 1,
      result: body.p_result,
      version: (publication?.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    };
    return json(res, 200, publication);
  }
  return json(res, 404, { message: `fixture route not found: ${req.method} ${url.pathname}` });
}).listen(port, "127.0.0.1", () => console.log(`Fixture Supabase API listening on ${port}`));
