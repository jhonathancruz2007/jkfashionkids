import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Busca todos os produtos salvos no banco de dados local (Prisma)
    // Rápido, seguro e livre de bloqueios do Cloudflare
    const produtos = await prisma.produto.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(produtos, { status: 200 })
  } catch (erro) {
    console.error("Erro ao carregar produtos do banco:", erro)
    return NextResponse.json({ error: "Erro ao buscar produtos" }, { status: 500 })
  }
}