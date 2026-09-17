import crypto from "node:crypto";

const OLIST_API_BASE = "https://api.tiny.com.br/public-api/v3";
const OLIST_ACCOUNTS_BASE =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect";

const TOKEN_KEY = "jkfashion:olist:v3:oauth";
const STATE_COOKIE = "jkfashion_olist_v3_oauth_state";

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

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.jkfashionkids.com.br"
  );
}

export function getOlistClientId(): string {
  return (process.env.OLIST_V3_CLIENT_ID || "").trim();
}

export function getOlistClientSecret(): string {
  return (process.env.OLIST_V3_CLIENT_SECRET || "").trim();
}

export function getOlistRedirectUri(): string {
  return (
    process.env.OLIST_V3_REDIRECT_URI?.trim() ||
    `${siteUrl()}/api/tiny/oauth/callback`
  );
}

function assertOAuthConfigured() {
  if (!getOlistClientId() || !getOlistClientSecret()) {
    throw new OlistOAuthError(
      "As variáveis OLIST_V3_CLIENT_ID e OLIST_V3_CLIENT_SECRET precisam estar configuradas na Vercel e o projeto precisa ser redeployado.",
      "NOT_CONFIGURED"
    );
  }
}

function assertRedisConfigured() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN precisam estar configuradas."
    );
  }
}

async function redisCommand<T = unknown>(command: unknown[]): Promise<T> {
  assertRedisConfigured();

  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Redis HTTP ${response.status}: ${raw || "sem resposta"}`);
  }

  let data: { result?: T; error?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as { result?: T; error?: string }) : {};
  } catch {
    throw new Error(`Resposta inválida do Redis: ${raw}`);
  }

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
  return crypto.randomBytes(32).toString("hex");
}

export function getOAuthStateCookieName(): string {
  return STATE_COOKIE;
}

export function getAuthorizationUrl(state: string): string {
  assertOAuthConfigured();

  const params = new URLSearchParams({
    client_id: getOlistClientId(),
    redirect_uri: getOlistRedirectUri(),
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
      Accept: "application/json",
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
    const message = String(
      data.error_description ||
        data.error ||
        data.mensagem ||
        raw ||
        `Falha na autenticação (HTTP ${response.status})`
    );
    throw new OlistOAuthError(
      `Olist/Tiny recusou a autenticação: ${message}`,
      "AUTH_FAILED"
    );
  }

  return data;
}

function makeToken(
  data: Record<string, unknown>,
  previous?: OlistOAuthToken
): OlistOAuthToken {
  const accessToken = String(data.access_token || "").trim();
  const refreshToken = String(
    data.refresh_token || previous?.refreshToken || ""
  ).trim();
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

export async function exchangeAuthorizationCode(
  code: string
): Promise<OlistOAuthToken> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getOlistClientId(),
    client_secret: getOlistClientSecret(),
    redirect_uri: getOlistRedirectUri(),
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

async function refreshAccessToken(
  previous: OlistOAuthToken
): Promise<OlistOAuthToken> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getOlistClientId(),
    client_secret: getOlistClientSecret(),
    refresh_token: previous.refreshToken,
  });

  try {
    const data = await tokenRequest(form);
    const token = makeToken(data, previous);
    await redisSetJson(TOKEN_KEY, token);
    return token;
  } catch (error) {
    await clearStoredToken().catch(() => undefined);
    const message =
      error instanceof Error ? error.message : "Falha ao renovar o token.";
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

  return (await refreshAccessToken(token)).accessToken;
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
    if (!token) {
      throw new OlistOAuthError("Token não encontrado.", "NOT_CONNECTED");
    }
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

    throw new Error(
      `Olist/Tiny API ${response.status}: ${message}`
    );
  }

  return data as T;
}
