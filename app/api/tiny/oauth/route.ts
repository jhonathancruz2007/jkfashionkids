import { NextResponse } from "next/server";
import {
  createOAuthState,
  getAuthorizationUrl,
  getOAuthStateCookieName,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_ADMIN_URL = "https://www.jkfashionkids.com.br/admin";

function getAdminUrlSafe(): URL {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();

  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return new URL("/admin", parsed.origin);
      }
    } catch {
      // Use the known production URL below.
    }
  }

  return new URL(FALLBACK_ADMIN_URL);
}

export async function GET() {
  try {
    const state = createOAuthState();
    const authorizationUrl = getAuthorizationUrl(state);

    const response = NextResponse.redirect(authorizationUrl, { status: 303 });
    response.cookies.set({
      name: getOAuthStateCookieName(),
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível iniciar a conexão com o Olist/Tiny.";

    console.error("[OAUTH START] Falha ao iniciar conexão:", error);

    const fallback = getAdminUrlSafe();
    fallback.searchParams.set("tinyError", message);
    return NextResponse.redirect(fallback, { status: 303 });
  }
}
