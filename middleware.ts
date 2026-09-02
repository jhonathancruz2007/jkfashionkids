import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

async function validarToken(token: string | undefined) {
  if (!token) return null

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch (error) {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const tokenCliente = request.cookies.get("cliente_token")?.value
  const tokenAdmin = request.cookies.get("admin_token")?.value
  const pathname = request.nextUrl.pathname

  // Valida a assinatura e expiração dos tokens
  const payloadCliente = await validarToken(tokenCliente)
  const payloadAdmin = await validarToken(tokenAdmin)

  // 1. ROTAS ADMINISTRATIVAS
  if (pathname.startsWith("/admin/dashboard")) {
    if (!payloadAdmin || payloadAdmin.role !== "ADMIN") {
      const urlLoginAdmin = new URL("/admin/login", request.url)
      return NextResponse.redirect(urlLoginAdmin)
    }
  }

  if (pathname === "/admin/login" && payloadAdmin?.role === "ADMIN") {
    const urlDashboard = new URL("/admin/dashboard", request.url)
    return NextResponse.redirect(urlDashboard)
  }

  // 2. ROTAS DE CLIENTE
  if (pathname.startsWith("/perfil") && !payloadCliente) {
    const urlLogin = new URL("/login", request.url)
    return NextResponse.redirect(urlLogin)
  }

  if (pathname.startsWith("/login") && payloadCliente) {
    const redirectParam = request.nextUrl.searchParams.get("redirect")
    const destino = redirectParam || "/catalogo"
    const urlDestino = new URL(destino, request.url)

    return NextResponse.redirect(urlDestino)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/perfil/:path*",
    "/login",
    "/admin/:path*",
  ],
}