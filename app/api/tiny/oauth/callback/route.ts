import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  getOAuthStateCookieName,
} from "@/lib/olist-v3";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_ADMIN_URL = "https://www.jkfashionkids.com.br/admin";

function getAdminUrlSafe(): URL {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();

  if (configured) {
    try {
      const parsed = new URL(configured);
      // Only allow http(s) origins; ignore accidental paths/query strings.
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return new URL("/admin", parsed.origin);
      }
    } catch {
      // Fall back to the known production origin below.
    }
  }

  return new URL(FALLBACK_ADMIN_URL);
}

function redirectToAdmin(
  params: Record<string, string>
): NextResponse {
  const adminUrl = getAdminUrlSafe();
  for (const [key, value] of Object.entries(params)) {
    adminUrl.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(adminUrl, { status: 303 });
  response.cookies.set({
    name: getOAuthStateCookieName(),
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  try {
    if (providerError) {
      throw new Error(
        providerErrorDescription ||
          `Olist/Tiny recusou a autorização: ${providerError}`
      );
    }

    if (!code || !state) {
      throw new Error(
        "Olist/Tiny não retornou o código de autorização ou o estado da conexão."
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get(getOAuthStateCookieName())?.value;

    if (!savedState || savedState !== state) {
      throw new Error(
        "O estado de autorização não confere. Inicie a conexão novamente."
      );
    }

    await exchangeAuthorizationCode(code);

    return redirectToAdmin({ tiny: "conectado" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao concluir a autorização do Olist/Tiny.";

    console.error("[OAUTH CALLBACK] Falha ao conectar Olist/Tiny:", error);

    return redirectToAdmin({ tinyError: message });
  }
}
