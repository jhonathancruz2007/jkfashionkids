import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  getOAuthStateCookieName,
} from "@/lib/olist-v3";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminUrl() {
  return new URL(
    "/admin",
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.jkfashionkids.com.br"
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  const adminUrl = getAdminUrl();

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
    adminUrl.searchParams.set("tiny", "conectado");

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
  } catch (error) {
    adminUrl.searchParams.set(
      "tinyError",
      error instanceof Error
        ? error.message
        : "Falha ao concluir a autorização do Olist/Tiny."
    );

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
}
