/**
 * Fetch wrapper. Shape only — auth flow (refresh on 401, shared refresh
 * promise, "waking the server" state) arrives in Stage 3.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Access token lives in memory only. Never localStorage. */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken !== null) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include", // refresh token cookie
  });
}
