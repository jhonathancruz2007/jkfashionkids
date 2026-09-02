import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_padrao_substituir_em_producao"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 }
      )
    }

    // 1. Busca o usuário no banco
    const usuario = await prisma.cliente.findUnique({
      where: { email },
    })

    if (!usuario) {
      return NextResponse.json(
        { error: "Credenciais inválidas." },
        { status: 401 }
      )
    }

    // 2. Verifica se a conta possui permissão de ADMIN (tolerante a maiúsculas/minúsculas)
    if (!usuario.role || usuario.role.toUpperCase() !== "ADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Esta conta não é administrativa." },
        { status: 403 }
      )
    }

    // 3. Valida a senha (suporta hash bcrypt ou texto plano caso editado direto no banco)
    let senhaValida = false
    try {
      if (usuario.senha && (usuario.senha.startsWith("$2a$") || usuario.senha.startsWith("$2b$"))) {
        senhaValida = await bcrypt.compare(password, usuario.senha)
      } else {
        senhaValida = password === usuario.senha
      }
    } catch {
      senhaValida = password === usuario.senha
    }

    if (!senhaValida) {
      return NextResponse.json(
        { error: "Credenciais inválidas." },
        { status: 401 }
      )
    }

    // 4. Gera o token JWT para o ADMIN
    const token = jwt.sign(
      { sub: usuario.id, email: usuario.email, role: usuario.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    )

    // 5. Grava o cookie `admin_token`
    const response = NextResponse.json({
      sucesso: true,
      mensagem: "Login administrativo realizado com sucesso!",
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
      },
    })

    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 dia
    })

    return response
  } catch (erro) {
    console.error("Erro no login do admin:", erro)
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    )
  }
}