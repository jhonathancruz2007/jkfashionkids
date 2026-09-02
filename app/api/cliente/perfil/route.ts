import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jwtVerify } from "jose"
import { cookies } from "next/headers"

async function getClienteIdFromToken() {
  const cookieStore = await cookies()
  const token = cookieStore.get("cliente_token")?.value

  if (!token) return null

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "chave-secreta-fallback"
    )
    const { payload } = await jwtVerify(token, secret)
    return payload.id as string
  } catch (error) {
    console.error("Erro ao verificar token JWT no perfil:", error)
    return null
  }
}

// GET: Retorna dados do perfil do usuário logado + histórico de pedidos
export async function GET() {
  const clienteId = await getClienteIdFromToken()

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
      cep: true,
      rua: true,
      numero: true,
      bairro: true,
      cidade: true,
      estado: true,
      complemento: true,
      pedidos: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          itens: {
            include: {
              produto: true,
            },
          },
        },
      },
    },
  })

  if (!cliente) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  }

  const { pedidos, ...dadosCliente } = cliente

  return NextResponse.json({
    cliente: dadosCliente,
    pedidos: pedidos || [],
  })
}

// POST e PUT: Salva/Atualiza o cadastro do cliente
export async function POST(request: Request) {
  return salvarPerfil(request)
}

export async function PUT(request: Request) {
  return salvarPerfil(request)
}

async function salvarPerfil(request: Request) {
  const clienteId = await getClienteIdFromToken()

  if (!clienteId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { nome, telefone, cep, rua, numero, bairro, cidade, estado, complemento } = body

    if (!telefone || !cep || !rua || !numero || !bairro || !cidade || !estado) {
      return NextResponse.json(
        { error: "Preencha todos os campos obrigatórios." },
        { status: 400 }
      )
    }

    const clienteAtualizado = await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        nome: nome?.trim(),
        telefone: telefone?.trim(),
        cep: cep?.trim(),
        rua: rua?.trim(),
        numero: numero?.trim(),
        bairro: bairro?.trim(),
        cidade: cidade?.trim(),
        estado: estado?.trim().toUpperCase(),
        complemento: complemento?.trim() || null,
      },
    })

    return NextResponse.json({
      message: "Perfil atualizado com sucesso!",
      cliente: clienteAtualizado,
    })
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error)
    return NextResponse.json(
      { error: "Erro interno ao salvar dados." },
      { status: 500 }
    )
  }
}