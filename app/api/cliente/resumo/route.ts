import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jwtVerify } from "jose"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("cliente_token")?.value

  if (!token) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "chave-secreta-fallback"
    )
    const { payload } = await jwtVerify(token, secret)
    const clienteId = payload.id as string | undefined

    if (!clienteId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        role: true,
      },
    })

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    return NextResponse.json(
      { cliente },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    )
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
}
