import { NextResponse } from "next/server";
import { getStoredToken } from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = await getStoredToken();

    return NextResponse.json({
      connected: Boolean(token?.accessToken && token?.refreshToken),
      expiresAt: token?.expiresAt || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar o estado da conexão.",
      },
      { status: 500 }
    );
  }
}
