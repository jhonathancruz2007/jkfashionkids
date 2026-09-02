import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function POST() {
  try {
    const cookieStore = await cookies()
    
    // Remove o cookie correto de autenticação do cliente
    cookieStore.set({
      name: "cliente_token",
      value: "",
      maxAge: 0,
      path: "/",
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    return NextResponse.json({ error: "Erro ao realizar logout" }, { status: 500 })
  }
}