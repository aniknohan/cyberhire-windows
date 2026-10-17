// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
// The Android app bundles these screens and talks to the hosted backend: VITE_API_BASE is set
// at build time (see native/README.md) and auth uses a bearer token instead of the cookie.
const REMOTE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
const BASE = `${REMOTE}/api`;
export const IS_NATIVE = REMOTE !== "";
export const WEB_ORIGIN = REMOTE || window.location.origin;
const TOKEN_KEY = "cyberhire_token";
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  // Web: auth rides the httpOnly session cookie. Android app: bearer token from X-Session-Token.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (IS_NATIVE) {
    // The token only ever exists inside the Android app, whose code is all bundled in the APK.
    headers["X-CyberHire-Client"] = "android";
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (IS_NATIVE) {
    const fresh = res.headers.get("X-Session-Token");
    if (fresh) localStorage.setItem(TOKEN_KEY, fresh);
    if (path === "/auth/logout") clearToken();
  }

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
