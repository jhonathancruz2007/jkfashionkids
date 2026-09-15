import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    ok: true,
    mensagem: "ESTE É O CÓDIGO NOVO",
    versao: "2026-09-15-TESTE-01",
    timestamp: new Date().toISOString(),
  })
}
