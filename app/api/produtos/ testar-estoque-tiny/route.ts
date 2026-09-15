import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    ok: true,
    mensagem: "ROTA DE TESTE DO ESTOQUE FUNCIONANDO",
    versao: "2026-09-15-ESTOQUE-TESTE-01",
  })
}
