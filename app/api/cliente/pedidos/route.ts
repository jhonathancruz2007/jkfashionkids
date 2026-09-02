import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const clienteToken = cookieStore.get('cliente_token')?.value

    if (!clienteToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    let emailCliente = ''
    try {
      const payloadBase64 = clienteToken.split('.')[1]
      if (payloadBase64) {
        const decodedPayload = JSON.parse(
          Buffer.from(payloadBase64, 'base64').toString('utf-8')
        )
        emailCliente = decodedPayload.email || decodedPayload.sub || ''
      }
    } catch (err) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    if (!emailCliente) {
      return NextResponse.json({ error: 'Cliente não identificado' }, { status: 401 })
    }

    // Busca os pedidos do cliente no banco de dados com os itens e produtos relacionados
    const pedidos = await db.pedido.findMany({
      where: {
        cliente: {
          email: emailCliente,
        },
      },
      include: {
        itens: {
          include: {
            produto: true,
          },
        },
      },
      orderBy: {
        id: 'desc', // Ou 'createdAt' se o seu schema possuir a data de criação
      },
    })

    return NextResponse.json({ sucesso: true, pedidos })
  } catch (error: any) {
    console.error('Erro ao buscar pedidos:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}