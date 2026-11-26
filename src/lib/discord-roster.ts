export type RosterTeam = { id: string; name: string; players: { name: string; rating: number | null; captain: boolean; position: number }[] };

export function rosterPayload(title: string, tournamentId: string, teams: RosterTeam[]) {
  const blocks = teams.map((team) => {
    const total = team.players.filter((p) => p.position < 5).reduce((sum, p) => sum + (p.rating ?? 0), 0);
    return `🏅 ***${team.name}*** \`${total} ммр\`\n${team.players.map((p) => `${p.name} \`${p.rating ?? "—"}\`${p.captain ? " ⭐" : ""}${p.position >= 5 ? " (замена)" : ""}`).join("\n")}`;
  });
  const description = blocks.join("\n\n") || "Пока нет подтверждённых команд.";
  const chunks: string[] = [];
  for (const block of blocks) {
    const last = chunks.length - 1;
    if (last >= 0 && (chunks[last]?.length ?? 0) + block.length + 2 <= 3900) chunks[last] += `\n\n${block}`;
    else chunks.push(block);
  }
  const overflow = description.length > 5600 || chunks.length > 10 || blocks.some((b) => b.length > 3900);
  const descriptions = overflow ? [`Подтверждено команд: ${teams.length}. Полный список составов — в приложенном файле.`] : chunks.length ? chunks : [description];
  return {
    payload: {
      username: "TrueDotaLeague", allowed_mentions: { parse: [] },
      embeds: descriptions.map((text, index) => ({
        ...(index === 0 ? { title: `Список команд ${title} ✅`.slice(0, 250), url: `https://truedotaleague.kz/tournaments/${tournamentId}` } : {}),
        color: 0x3b82f6, description: text,
        ...(index === descriptions.length - 1 ? { footer: { text: `TrueDotaLeague • Команд: ${teams.length}` } } : {}),
      })),
      attachments: overflow ? [{ id: 0, filename: "rosters.txt" }] : [],
    },
    fullList: overflow ? `${title}\n\n${description}` : null,
  };
}

/** A repeated update edits the same Discord message; only a deleted message is recreated. */
export async function writeRosterMessage(url: string, messageId: string | null, body: ReturnType<typeof rosterPayload>, request: typeof fetch = fetch): Promise<string> {
  const base = url.split("?")[0] ?? url;
  const send = async (id: string | null) => {
    let content: BodyInit;
    let headers: HeadersInit | undefined;
    if (body.fullList) {
      const form = new FormData();
      form.set("payload_json", JSON.stringify(body.payload));
      form.set("files[0]", new Blob([body.fullList], { type: "text/plain;charset=utf-8" }), "rosters.txt");
      content = form;
    } else { content = JSON.stringify(body.payload); headers = { "content-type": "application/json" }; }
    return request(id ? `${base}/messages/${id}` : `${base}?wait=true`, {
      method: id ? "PATCH" : "POST", body: content, ...(headers ? { headers } : {}), signal: AbortSignal.timeout(15000),
    });
  };
  let response = await send(messageId);
  if (messageId && response.status === 404) response = await send(null);
  if (!response.ok) {
    const text = await response.text();
    console.error(`Discord roster failed [${response.status}]: ${text}`);
    throw new Error(`Discord [${response.status}]: ${text}`);
  }
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Discord не вернул номер сообщения");
  return result.id;
}