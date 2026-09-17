import { NextResponse } from "next/server";
import {
  createOAuthState,
  getAuthorizationUrl,
  getOAuthStateCookieName,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = createOAuthState();
    const authorizationUrl = getAuthorizationUrl(state);

    const response = NextResponse.redirect(authorizationUrl);
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

    const fallback = new URL(
      "/admin",
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.jkfashionkids.com.br"
    );
    fallback.searchParams.set("tinyError", message);

    return NextResponse.redirect(fallback, { status: 303 });
  }
}
