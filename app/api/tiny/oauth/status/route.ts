import { NextResponse } from "next/server";
import { getStoredToken } from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = await getStoredToken();

    return NextResponse.json({
      success: true,
      conectado: Boolean(token?.accessToken && token?.refreshToken),
      expiraEm: token?.expiresAt || null,
      clientConfigurado: Boolean(
        process.env.OLIST_V3_CLIENT_ID && process.env.OLIST_V3_CLIENT_SECRET
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        conectado: false,
        error: error instanceof Error ? error.message : "Erro ao verificar a conexão.",
      },
      { status: 500 }
    );
  }
}
