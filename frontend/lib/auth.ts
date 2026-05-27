export const AUTH_TOKEN_KEY = "vidsage_token";
const AUTH_TOKEN_EXP_KEY = "vidsage_token_exp";
const LEGACY_AUTH_TOKEN_KEY = "vidsage_token";

let inMemoryToken: string | null = null;
let inMemoryTokenExp: number | null = null;
let refreshPromise: Promise<string | null> | null = null;

export type LoginResult = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export const getApiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const nowEpochSeconds = () => Math.floor(Date.now() / 1000);

const parseJwtExp = (token: string): number | null => {
  if (typeof window === "undefined") return null;
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = window.atob(base64);
    const parsed = JSON.parse(json);
    return typeof parsed?.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
};

const hasUsableToken = (token: string | null, exp: number | null): token is string => {
  if (!token || !exp) return false;
  // Keep a small safety margin so requests don't race token expiry.
  return exp > nowEpochSeconds() + 15;
};

const getStoredToken = (): { token: string | null; exp: number | null } => {
  if (typeof window === "undefined") return { token: null, exp: null };
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  const expRaw = sessionStorage.getItem(AUTH_TOKEN_EXP_KEY);
  const exp = expRaw ? Number(expRaw) : parseJwtExp(token || "");
  return { token, exp: Number.isFinite(exp) ? exp : null };
};

const setStoredToken = (token: string, exp: number | null) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  if (exp) {
    sessionStorage.setItem(AUTH_TOKEN_EXP_KEY, String(exp));
  }
  // Migrate away from localStorage persistence for reduced exposure.
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
};

const clearStoredToken = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_EXP_KEY);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
};

const redirectToLogin = (reason?: string) => {
  if (typeof window === "undefined") return;
  const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = `/login${suffix}`;
  }
};

export const getAuthToken = (): string | null => {
  if (hasUsableToken(inMemoryToken, inMemoryTokenExp)) {
    return inMemoryToken;
  }

  const { token, exp } = getStoredToken();
  if (hasUsableToken(token, exp)) {
    inMemoryToken = token;
    inMemoryTokenExp = exp;
    return token;
  }

  clearStoredToken();
  inMemoryToken = null;
  inMemoryTokenExp = null;
  return null;
};

export const setAuthToken = (token: string, expiresInSeconds?: number) => {
  const exp = parseJwtExp(token) || (expiresInSeconds ? nowEpochSeconds() + expiresInSeconds : null);
  inMemoryToken = token;
  inMemoryTokenExp = exp;
  setStoredToken(token, exp);
};

export const clearAuthToken = () => {
  inMemoryToken = null;
  inMemoryTokenExp = null;
  clearStoredToken();
};

export const isAuthenticated = (): boolean => !!getAuthToken();

export const saveToken = setAuthToken;
export const removeToken = clearAuthToken;
export const isLoggedIn = isAuthenticated;

async function refreshAuthToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        clearAuthToken();
        return null;
      }

      const data = await res.json().catch(() => ({}));
      if (!data?.access_token) {
        clearAuthToken();
        return null;
      }

      setAuthToken(data.access_token, data.expires_in);
      return data.access_token as string;
    } catch {
      clearAuthToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function ensureAuthSession(): Promise<boolean> {
  if (getAuthToken()) {
    return true;
  }
  const refreshed = await refreshAuthToken();
  return Boolean(refreshed);
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${getApiBase()}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Client token cleanup still runs in finally-equivalent path.
  }
  clearAuthToken();
}

export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${getApiBase()}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Authentication failed");
  }

  if (!data?.access_token) {
    throw new Error("Auth token not returned by server");
  }

  setAuthToken(data.access_token, data.expires_in);
  return data as LoginResult;
}

export function beginGoogleLogin(nextPath = "/dashboard") {
  if (typeof window === "undefined") return;
  const url = new URL(`${getApiBase()}/api/auth/google`);
  url.searchParams.set("next", nextPath);
  window.location.href = url.toString();
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await refreshAuthToken();
  if (!refreshedToken) {
    redirectToLogin("session_expired");
    return response;
  }

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
  return fetch(input, {
    ...init,
    headers: retryHeaders,
    credentials: "include",
  });
}

export const login = async (username: string, password: string): Promise<void> => {
  await loginWithPassword(username, password);
};
