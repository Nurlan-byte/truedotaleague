/** Only our invitation route can survive login; never accept arbitrary redirects. */
export function safeAuthReturn(value: unknown): string {
  return typeof value === "string" && /^\/join\?token=[a-f0-9]{64}$/.test(value) ? value : "/";
}

export function authRetryUrl(next: unknown, error?: string): string {
  const params = new URLSearchParams();
  const target = safeAuthReturn(next);
  if (target !== "/") params.set("next", target);
  if (error) params.set("discord_error", error);
  return `/auth${params.size ? `?${params}` : ""}`;
}

export async function completeDiscordLogin(
  search: string,
  verify: (input: { type: "email"; token_hash: string }) => Promise<{ error: unknown }>,
): Promise<string> {
  const query = new URLSearchParams(search);
  const token = query.get("token_hash");
  if (!token) throw new Error("Ссылка входа недействительна или устарела. Попробуйте войти снова.");
  const { error } = await verify({ type: "email", token_hash: token });
  if (error) throw new Error("Сессия истекла или ссылка уже использована. Войдите через Discord ещё раз.");
  return safeAuthReturn(query.get("next"));
}
