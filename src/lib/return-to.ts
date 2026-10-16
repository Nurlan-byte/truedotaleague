const KEY = "tdl_return_to";

/** Запомнить, куда вернуть гостя после входа (только пути этого сайта). */
export function setReturnTo(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

export function takeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
  } catch {
    return null;
  }
}

export function peekReturnTo(): boolean {
  try {
    return !!sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}
