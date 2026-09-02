import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { SignJWT } from "jose"
import { loginSchema, registerSchema } from "@/lib/validations"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const isCadastro = body?.acao === "cadastro"

    // 1. Isolamento dos campos
    const dadosParaValidar = isCadastro
      ? { nome: body.nome, email: body.email, senha: body.senha }
      : { email: body.email, senha: body.senha }

    // 2. Validação segura
    const validation = isCadastro
      ? registerSchema.safeParse(dadosParaValidar)
      : loginSchema.safeParse(dadosParaValidar)

    if (!validation.success) {
      const primeiroErro = 
        validation.error.issues?.[0]?.message || 
        "Dados inválidos. Verifique os campos informados."

      return NextResponse.json({ error: primeiroErro }, { status: 400 })
    }

    const { email, senha } = validation.data
    const emailFormatado = email.trim().toLowerCase()

    // 3. Consulta no Banco
    let cliente = await prisma.cliente.findFirst({
      where: {
        email: {
          equals: emailFormatado,
          mode: "insensitive",
        },
      },
    })

    if (isCadastro) {
      if (cliente) {
        return NextResponse.json(
          { error: "E-mail já cadastrado na plataforma." },
          { status: 400 }
        )
      }

      const nome = "nome" in validation.data ? validation.data.nome : "Cliente"
      const senhaHash = await bcrypt.hash(senha, 10)

      cliente = await prisma.cliente.create({
        data: {
          email: emailFormatado,
          nome,
          senha: senhaHash,
        },
      })
    } else {
      if (!cliente || !(await bcrypt.compare(senha, cliente.senha))) {
        return NextResponse.json(
          { error: "E-mail ou senha incorretos." },
          { status: 401 }
        )
      }
    }

    const cadastroIncompleto = !cliente.cpf || !cliente.telefone

    // 4. Token JWT e Cookie
    const jwtSecretKey = process.env.JWT_SECRET || "chave-secreta-fallback"
    const secret = new TextEncoder().encode(jwtSecretKey)

    const token = await new SignJWT({
      id: cliente.id,
      email: cliente.email,
      role: (cliente as any).role || "CLIENTE",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(secret)

    const response = NextResponse.json({
      message: "Autenticação realizada com sucesso!",
      primeiroAcesso: isCadastro,
      cadastroIncompleto,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        role: (cliente as any).role || "CLIENTE",
      },
    })

    response.cookies.set("cliente_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
      path: "/",
    })

    return response
  } catch (error: any) {
    console.error("=== ERRO DETALHADO NO CADASTRO/LOGIN ===", error)
    return NextResponse.json(
      { error: "Erro interno no servidor ao realizar autenticação." },
      { status: 500 }
    )
  }
}