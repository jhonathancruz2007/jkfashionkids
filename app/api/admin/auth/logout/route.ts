import { NextResponse } from "next/server"

export async function POST() {
  try {
    const response = NextResponse.json(
      { ok: true, message: "Logout do admin realizado com sucesso." },
      { status: 200 }
    )

    // Invalida o cookie administrativo
    response.cookies.set("admin_token", "", {
      httpOnly: true,
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao realizar logout." },
      { status: 500 }
    )
  }
}