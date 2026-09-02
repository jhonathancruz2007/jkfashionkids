"use client"

import { usePathname } from "next/navigation"
// Importe aqui seus componentes reais de Header e Footer da loja
// Exemplo:
// import Header from "@/components/Header"
// import Footer from "@/components/Footer"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Verifica se a rota atual começa com /admin
  const isAdminRoute = pathname?.startsWith("/admin")

  if (isAdminRoute) {
    // Se for admin, renderiza APENAS o conteúdo (sem Header e sem Footer)
    return <>{children}</>
  }

  return (
    <>
      {/* Insira aqui o seu Header atual da loja */}
      {/* <Header /> */}

      <main>{children}</main>

      {/* Insira aqui o seu Footer atual da loja */}
      {/* <Footer /> */}
    </>
  )
}