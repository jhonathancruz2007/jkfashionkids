import crypto from "node:crypto";

const OLIST_API_BASE = "https://api.tiny.com.br/public-api/v3";
const OLIST_ACCOUNTS_BASE = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const OLIST_CLIENT_ID = process.env.OLIST_V3_CLIENT_ID;
const OLIST_CLIENT_SECRET = process.env.OLIST_V3_CLIENT_SECRET;

export const OLIST_REDIRECT_URI =
  process.env.OLIST_V3_REDIRECT_URI ||
  `${(process.env.NEXT_PUBLIC_SITE_URL || "https://www.jkfashionkids.com.br").replace(/\/$/, "")}/api/tiny/oauth/callback`;

const TOKEN_KEY = "jkfashion:olist:v3:oauth";

export type OlistOAuthToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  updatedAt: number;
};

export class OlistOAuthError extends Error {
  code: "NOT_CONFIGURED" | "NOT_CONNECTED" | "REFRESH_FAILED" | "AUTH_FAILED";

  constructor(
    message: string,
    code: OlistOAuthError["code"]
  ) {
    super(message);
    this.name = "OlistOAuthError";
    this.code = code;
  }
}

function assertRedisConfigured() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN precisam estar configuradas."
    );
  }
}

function assertOAuthConfigured() {
  if (!OLIST_CLIENT_ID || !OLIST_CLIENT_SECRET) {
    throw new OlistOAuthError(
      "OLIST_V3_CLIENT_ID e OLIST_V3_CLIENT_SECRET não estão configurados.",
      "NOT_CONFIGURED"
    );
  }
}

async function redisCommand<T = unknown>(command: unknown[]): Promise<T> {
  assertRedisConfigured();

  const response = await fetch(REDIS_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Redis HTTP ${response.status}`);
  }

  const data = (await response.json()) as { result?: T; error?: string };
  if (data.error) {
    throw new Error(`Redis: ${data.error}`);
  }

  return data.result as T;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const result = await redisCommand<string | null>(["GET", key]);
  if (result == null || result === "") return null;

  try {
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const args: unknown[] = ["SET", key, JSON.stringify(value)];
  if (ttlSeconds) args.push("EX", ttlSeconds);
  await redisCommand(args);
}

export async function redisDelete(key: string): Promise<void> {
  await redisCommand(["DEL", key]);
}

export async function redisSetNx(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<boolean> {
  const result = await redisCommand<string | number | null>([
    "SET",
    key,
    value,
    "EX",
    ttlSeconds,
    "NX",
  ]);

  return result === "OK" || result === "ok" || result === 1;
}

export function createOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function saveOAuthState(state: string): Promise<void> {
  await redisSetJson(
    `jkfashion:olist:v3:oauth:state:${state}`,
    { createdAt: Date.now() },
    600
  );
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  const key = `jkfashion:olist:v3:oauth:state:${state}`;
  const exists = await redisGetJson<{ createdAt?: number }>(key);
  if (!exists) return false;
  await redisDelete(key);
  return true;
}

export function getAuthorizationUrl(state: string): string {
  assertOAuthConfigured();

  const params = new URLSearchParams({
    client_id: OLIST_CLIENT_ID!,
    redirect_uri: OLIST_REDIRECT_URI,
    scope: "openid",
    response_type: "code",
    state,
  });

  return `${OLIST_ACCOUNTS_BASE}/auth?${params.toString()}`;
}

async function tokenRequest(form: URLSearchParams): Promise<Record<string, unknown>> {
  assertOAuthConfigured();

  const response = await fetch(`${OLIST_ACCOUNTS_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    const message =
      String(data.error_description || data.error || data.mensagem || raw || "Falha na autenticação");
    throw new OlistOAuthError(message, "AUTH_FAILED");
  }

  return data;
}

function makeToken(data: Record<string, unknown>, previous?: OlistOAuthToken): OlistOAuthToken {
  const accessToken = String(data.access_token || "").trim();
  const refreshToken = String(data.refresh_token || previous?.refreshToken || "").trim();
  const expiresIn = Number(data.expires_in || 0);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new OlistOAuthError(
      "Olist/Tiny não retornou access_token, refresh_token ou expires_in válidos.",
      "AUTH_FAILED"
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    updatedAt: Date.now(),
  };
}

export async function exchangeAuthorizationCode(code: string): Promise<OlistOAuthToken> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OLIST_CLIENT_ID || "",
    client_secret: OLIST_CLIENT_SECRET || "",
    redirect_uri: OLIST_REDIRECT_URI,
    code,
  });

  const data = await tokenRequest(form);
  const token = makeToken(data);
  await redisSetJson(TOKEN_KEY, token);
  return token;
}

export async function getStoredToken(): Promise<OlistOAuthToken | null> {
  return redisGetJson<OlistOAuthToken>(TOKEN_KEY);
}

export async function clearStoredToken(): Promise<void> {
  await redisDelete(TOKEN_KEY);
}

async function refreshAccessToken(previous: OlistOAuthToken): Promise<OlistOAuthToken> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: OLIST_CLIENT_ID || "",
    client_secret: OLIST_CLIENT_SECRET || "",
    refresh_token: previous.refreshToken,
  });

  try {
    const data = await tokenRequest(form);
    const token = makeToken(data, previous);
    await redisSetJson(TOKEN_KEY, token);
    return token;
  } catch (error) {
    await clearStoredToken();
    const message = error instanceof Error ? error.message : "Falha ao renovar o token.";
    throw new OlistOAuthError(
      `${message} Faça a conexão com o Olist/Tiny novamente.`,
      "REFRESH_FAILED"
    );
  }
}

export async function getValidAccessToken(): Promise<string> {
  assertOAuthConfigured();
  const token = await getStoredToken();

  if (!token?.accessToken || !token.refreshToken) {
    throw new OlistOAuthError(
      "A conta Olist/Tiny ainda não foi conectada. Clique em 'Conectar Olist/Tiny'.",
      "NOT_CONNECTED"
    );
  }

  if (token.expiresAt > Date.now() + 60_000) {
    return token.accessToken;
  }

  const refreshed = await refreshAccessToken(token);
  return refreshed.accessToken;
}

export async function getOlistV3<T>(
  path: string,
  init?: RequestInit,
  retryOn401 = true
): Promise<T> {
  let accessToken = await getValidAccessToken();

  const doRequest = async (token: string) => {
    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`${OLIST_API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  };

  let response = await doRequest(accessToken);

  if (response.status === 401 && retryOn401) {
    const token = await getStoredToken();
    if (!token) throw new OlistOAuthError("Token não encontrado.", "NOT_CONNECTED");
    const refreshed = await refreshAccessToken(token);
    accessToken = refreshed.accessToken;
    response = await doRequest(accessToken);
  }

  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const details =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : {};
    const message = String(
      details.mensagem ||
        details.message ||
        details.error ||
        raw ||
        `Olist/Tiny HTTP ${response.status}`
    );

    throw new Error(`Olist/Tiny API ${response.status}: ${message}`);
  }

  return data as T;
}
