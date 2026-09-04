"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ShoppingCart, User, Sparkles, Cloud, Star, Menu, X } from "lucide-react"
import { useCarrinho } from "@/lib/carrinho-context"

export default function Header() {
  const { totalItens, abrirCarrinho } = useCarrinho()
  const [nomeExibicao, setNomeExibicao] = useState<string | null>(null)
  const [montado, setMontado] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => {
    setMontado(true)

    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true)
      } else {
        setScrolled(false)
      }
    }

    window.addEventListener("scroll", handleScroll)

    async function buscarUsuarioLogado() {
      try {
        const res = await fetch("/api/cliente/perfil")

        if (res.ok) {
          const data = await res.json()
          const cliente = data.cliente || data.user || data
          const nomeBruto = cliente.nome || cliente.name || cliente.email || ""

          if (nomeBruto) {
            const primeiroNome = nomeBruto.includes("@")
              ? nomeBruto.split("@")[0]
              : nomeBruto.trim().split(" ")[0]

            const nomeFormatado =
              primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1)

            setNomeExibicao(nomeFormatado)
            return
          }
        }
      } catch (e) {
        console.error("Erro ao buscar dados do cliente no Header:", e)
      }

      setNomeExibicao(null)
    }

    buscarUsuarioLogado()

    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  return (
    <header
      className={`sticky top-0 z-30 transition-all duration-300 ease-in-out relative font-bold w-full ${
        scrolled
          ? "border-b border-stone-200 bg-white/95 backdrop-blur-md shadow-xs"
          : "border-b border-stone-200/50 bg-white/80 backdrop-blur-sm shadow-none"
      }`}
    >
      {/* 1. EFEITOS LÚDICOS DE FUNDO */}
      <div className="absolute top-0.5 left-2 text-[#9c27b0]/35 pointer-events-none select-none hidden sm:block">
        <Cloud className="h-9 w-9 md:h-11 md:w-11 fill-[#ba68c8]/30 stroke-[#ab47bc]/40 stroke-[1.5]" />
      </div>
      <div className="absolute -top-1 right-12 text-[#e91e63]/30 pointer-events-none select-none hidden md:block">
        <Cloud className="h-14 w-14 fill-[#f48fb1]/35 stroke-[#ec407a]/40 stroke-[1.5]" />
      </div>

      <div className="absolute top-1.5 left-[10%] sm:left-[18%] text-amber-400 animate-pulse pointer-events-none drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]">
        <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 fill-amber-300" />
      </div>
      <div className="absolute top-3 left-[32%] text-[#0288d1] animate-bounce pointer-events-none duration-700 hidden sm:block">
        <Star className="h-4 w-4 fill-[#03a9f4] stroke-[#0288d1]" />
      </div>
      <div className="absolute bottom-2 left-[42%] text-[#ec407a] animate-pulse pointer-events-none hidden md:block">
        <Sparkles className="h-4 w-4 fill-[#f48fb1]" />
      </div>
      <div className="absolute top-2 right-[20%] sm:right-[28%] text-[#ab47bc] animate-pulse pointer-events-none drop-shadow-[0_0_6px_rgba(171,71,188,0.7)]">
        <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 fill-[#ce93d8]" />
      </div>

      <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[280px] sm:w-[450px] h-[70px] bg-gradient-to-r from-[#03a9f4]/30 via-[#f48fb1]/40 to-[#ba68c8]/30 rounded-full blur-2xl pointer-events-none" />

      {/* 2. CONTEÚDO PRINCIPAL DO HEADER (Alinhado em max-w-[1700px]) */}
      <div
        className={`mx-auto flex w-full max-w-[1700px] items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-12 transition-all duration-300 relative z-10 ${
          scrolled ? "py-2.5" : "py-3.5 sm:py-5"
        }`}
      >
        {/* Lado Esquerdo: Menu Mobile + Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuAberto(!menuAberto)}
            className="lg:hidden p-1.5 text-stone-700 hover:text-[#f48fb1] rounded-lg transition-colors focus:outline-none"
            aria-label="Toggle menu"
          >
            {menuAberto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          <Link href="/" className="group inline-flex items-center gap-1.5 sm:gap-2.5 transition-all">
            <span 
              className="text-lg sm:text-2xl font-black tracking-tight transition-all group-hover:brightness-110 flex items-center select-none"
              style={{
                WebkitTextStroke: "1px #292524",
                paintOrder: "stroke fill",
              }}
            >
              <span className="text-[#81d4fa]">J</span>
              <span className="text-[#f48fb1]">K</span>
              <span className="w-1"></span>
              <span className="text-[#ff8a65]">F</span>
              <span className="text-[#ce93d8]">a</span>
              <span className="text-[#a5d6a7]">s</span>
              <span className="text-[#f06292]">h</span>
              <span className="text-[#4fc3f7]">i</span>
              <span className="text-[#ffd54f]">o</span>
              <span className="text-[#b39ddb]">n</span>
            </span>
            
            <span className="relative flex items-center justify-center rounded-full border border-[#f48fb1]/50 bg-[#f48fb1]/20 px-2 sm:px-3 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#d81b60] shadow-xs transition-all duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-[#f48fb1] group-hover:text-white">
              Kids
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#b39ddb] animate-ping opacity-75" />
            </span>
          </Link>
        </div>

        {/* Links de Navegação Desktop */}
        <nav className="hidden lg:flex items-center gap-8 font-body text-sm font-black text-stone-800">
          <Link
            href="/catalogo"
            className="relative py-1 uppercase tracking-wider text-xs font-extrabold transition-all duration-300 hover:text-[#ff8a65] hover:scale-105 active:scale-95 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#ff8a65] after:transition-all hover:after:w-full"
          >
            Catálogo
          </Link>
          <Link
            href="/catalogo?categoria=feminino"
            className="relative py-1 uppercase tracking-wider text-xs font-extrabold transition-all duration-300 hover:text-[#f48fb1] hover:scale-105 active:scale-95 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#f48fb1] after:transition-all hover:after:w-full"
          >
            Feminino
          </Link>
          <Link
            href="/catalogo?categoria=masculino"
            className="relative py-1 uppercase tracking-wider text-xs font-extrabold transition-all duration-300 hover:text-[#81d4fa] hover:scale-105 active:scale-95 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#81d4fa] after:transition-all hover:after:w-full"
          >
            Masculino
          </Link>
        </nav>

        {/* Ações e Atalhos */}
        <div className="flex items-center gap-1.5 sm:gap-3 font-body text-sm font-bold">
          {montado ? (
            <Link
              href={nomeExibicao ? "/perfil" : "/login"}
              className={`group flex h-9 sm:h-10 items-center gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-4 text-[11px] sm:text-xs font-extrabold uppercase tracking-wider transition-all duration-300 hover:border-[#b39ddb] hover:bg-[#b39ddb]/10 hover:text-[#f48fb1] hover:scale-105 active:scale-95 shadow-2xs ${
                scrolled
                  ? "border-stone-300 bg-stone-50 text-stone-800"
                  : "border-stone-300 bg-white/90 text-stone-800 hover:bg-white"
              }`}
            >
              <User className="h-4 w-4 text-[#b39ddb] shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 group-hover:text-[#f48fb1]" aria-hidden="true" />
              <span className="hidden md:inline font-extrabold">
                {nomeExibicao ? `Olá, ${nomeExibicao}` : "Entrar"}
              </span>
            </Link>
          ) : (
            <div className="h-9 w-20 sm:h-10 sm:w-28 rounded-full bg-stone-100 animate-pulse" />
          )}

          {/* Carrinho */}
          <button
            type="button"
            onClick={abrirCarrinho}
            className="group relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center text-stone-800 hover:text-[#81d4fa] transition-all duration-300 active:scale-95"
            aria-label="Abrir carrinho"
          >
            <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.5] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-12" aria-hidden="true" />
            {totalItens > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 sm:h-5 sm:min-w-5 animate-pulse items-center justify-center rounded-full bg-[#67b588] px-1 font-body text-[10px] sm:text-[11px] font-black text-white shadow-xs">
                {totalItens}
              </span>
            )}
          </button>

          {/* WhatsApp */}
          <a
            href="https://wa.me/551933010493?text=Olá!%20Gostaria%20de%20tirar%20dúvidas%20sobre%20os%20produtos."
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contato via WhatsApp"
            className="animate-pulse flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-teal-300 bg-teal-50 text-teal-600 shadow-xs transition-transform duration-300 hover:scale-110 hover:-rotate-6 hover:bg-teal-500 hover:text-white"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* 3. MENU MOBILE RETRÁTIL */}
      {menuAberto && (
        <nav className="lg:hidden bg-white/95 backdrop-blur-md border-b border-stone-200 px-6 py-4 flex flex-col gap-3 font-body text-xs font-black uppercase text-stone-800 shadow-lg animate-in slide-in-from-top duration-200">
          <Link
            href="/catalogo"
            onClick={() => setMenuAberto(false)}
            className="py-2 border-b border-stone-100 hover:text-[#ff8a65] transition-colors"
          >
            Catálogo Completo
          </Link>
          <Link
            href="/catalogo?categoria=feminino"
            onClick={() => setMenuAberto(false)}
            className="py-2 border-b border-stone-100 hover:text-[#f48fb1] transition-colors"
          >
            Coleção Feminina
          </Link>
          <Link
            href="/catalogo?categoria=masculino"
            onClick={() => setMenuAberto(false)}
            className="py-2 hover:text-[#81d4fa] transition-colors"
          >
            Coleção Masculina
          </Link>
        </nav>
      )}

      {/* Borda Arco-íris inferior */}
      <div className="h-1 w-full bg-gradient-to-r from-[#81d4fa] via-[#f48fb1] via-[#ff8a65] via-[#ce93d8] via-[#a5d6a7] via-[#ffd54f] to-[#b39ddb]" />
    </header>
  )
}
