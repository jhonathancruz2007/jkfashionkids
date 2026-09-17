import { NextResponse } from "next/server";
import {
  createOAuthState,
  getAuthorizationUrl,
  saveOAuthState,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = createOAuthState();
    await saveOAuthState(state);

    return NextResponse.redirect(getAuthorizationUrl(state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão com o Olist/Tiny.";
    const url = new URL("/admin", process.env.NEXT_PUBLIC_SITE_URL || "https://www.jkfashionkids.com.br");
    url.searchParams.set("tinyError", message);
    return NextResponse.redirect(url);
  }
}
