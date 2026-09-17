import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  exchangeAuthorizationCode,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  const adminUrl = new URL(
    "/admin",
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.jkfashionkids.com.br"
  );

  try {
    if (providerError) {
      throw new Error(
        providerErrorDescription || `Olist/Tiny recusou a autorização: ${providerError}`
      );
    }

    if (!code || !state) {
      throw new Error("Olist/Tiny não retornou o código de autorização ou o estado da conexão.");
    }

    const stateOk = await consumeOAuthState(state);
    if (!stateOk) {
      throw new Error("A autorização expirou ou já foi utilizada. Inicie a conexão novamente.");
    }

    await exchangeAuthorizationCode(code);

    adminUrl.searchParams.set("tiny", "conectado");
    return NextResponse.redirect(adminUrl);
  } catch (error) {
    adminUrl.searchParams.set(
      "tinyError",
      error instanceof Error ? error.message : "Falha ao concluir a autorização do Olist/Tiny."
    );
    return NextResponse.redirect(adminUrl);
  }
}
