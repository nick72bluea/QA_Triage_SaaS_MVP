"use client";

// Remembers where to send someone after they sign in (e.g. an invite link).
// Stored in localStorage because the magic link often opens in a new tab.
// Expires after an hour so a stale destination never hijacks a later login.

const KEY = "proofdeck_post_login";
const TTL_MS = 60 * 60 * 1000;

// Only same-site paths like "/join/abc" — never "//evil.com" or "https://…".
function isSafePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export function rememberPostLoginPath(path: string | null | undefined) {
  if (!path || !isSafePath(path)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {}
}

// Where to go after sign-in. Doesn't clear it — the destination page does that.
export function postLoginPath(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return "/home";
    const { path, at } = JSON.parse(raw);
    if (typeof path === "string" && isSafePath(path) && Date.now() - at < TTL_MS) return path;
    localStorage.removeItem(KEY);
  } catch {}
  return "/home";
}

export function hasPendingInvite(): boolean {
  return postLoginPath().startsWith("/join/");
}

export function clearPostLoginPath() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
