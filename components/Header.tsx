"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ShoppingCart,
  User,
  Sparkles,
  Menu,
  X,
} from "lucide-react"
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
      setScrolled(window.scrollY > 25)
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })

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
      className={`sticky top-0 z-50 w-full bg-white transition-all duration-300 ${
        scrolled
          ? "shadow-[0_5px_22px_rgba(0,0,0,0.10)]"
          : "shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
      }`}
    >
      {/* Pequenos detalhes decorativos, sem poluir */}
      <div className="pointer-events-none absolute left-[9%] top-2 hidden sm:block">
        <Sparkles className="header-sparkle h-3.5 w-3.5 text-[#ffd54f]" fill="currentColor" />
      </div>

      <div className="pointer-events-none absolute right-[14%] top-3 hidden md:block">
        <Sparkles
          className="header-sparkle-delayed h-3 w-3 text-[#b39ddb]"
          fill="currentColor"
        />
      </div>

      {/* CONTEÚDO */}
      <div
        className={`relative mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6 lg:px-10 2xl:px-14 ${
          scrolled ? "py-2" : "py-3 sm:py-3.5"
        }`}
      >
        {/* ESQUERDA: MENU + LOGO */}
        <div className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => setMenuAberto((prev) => !prev)}
            className="mr-2 flex h-9 w-9 items-center justify-center rounded-full text-stone-700 transition-all hover:bg-[#fff0f6] hover:text-[#d81b60] active:scale-90 lg:hidden"
            aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuAberto}
          >
            {menuAberto ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <Link
            href="/"
            aria-label="Voltar ao início"
            className="logo-link group flex items-center"
          >
            <span
              className="logo-text flex items-center text-[22px] font-black leading-none tracking-tight sm:text-[27px] lg:text-[30px]"
              style={{
                WebkitTextStroke: "0.8px #292524",
                paintOrder: "stroke fill",
              }}
            >
              <span className="text-[#58bce8]">J</span>
              <span className="text-[#ef75a7]">K</span>
              <span className="ml-1 text-[#ef75a7]">F</span>
              <span className="text-[#a96cc4]">a</span>
              <span className="text-[#e8759c]">s</span>
              <span className="text-[#ef8a62]">h</span>
              <span className="text-[#53b9df]">i</span>
              <span className="text-[#f4c94f]">o</span>
              <span className="text-[#a884cf]">n</span>
            </span>

            <span className="kids-badge ml-2 rounded-full border border-[#f29abb] bg-[#fff1f7] px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.14em] text-[#d81b60] shadow-sm sm:px-2.5 sm:text-[9px]">
              Kids
            </span>
          </Link>
        </div>

        {/* NAVEGAÇÃO */}
        <nav className="hidden items-center gap-1 lg:flex">
          <Link href="/catalogo" className="nav-link nav-catalogo">
            <span>Catálogo</span>
          </Link>

          <Link
            href="/catalogo?categoria=feminino"
            className="nav-link nav-feminino"
          >
            <span>Feminino</span>
          </Link>

          <Link
            href="/catalogo?categoria=masculino"
            className="nav-link nav-masculino"
          >
            <span>Masculino</span>
          </Link>
        </nav>

        {/* AÇÕES */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {montado ? (
            <Link
              href={nomeExibicao ? "/perfil" : "/login"}
              className="login-button group"
            >
              <User className="h-4 w-4 text-[#a884cf] transition-transform duration-300 group-hover:scale-110" />

              <span className="hidden md:inline">
                {nomeExibicao ? `Olá, ${nomeExibicao}` : "Entrar"}
              </span>
            </Link>
          ) : (
            <div className="h-9 w-9 animate-pulse rounded-full bg-stone-100 sm:w-24" />
          )}

          <button
            type="button"
            onClick={abrirCarrinho}
            className="icon-button cart-button group"
            aria-label="Abrir carrinho"
          >
            <ShoppingCart className="h-[19px] w-[19px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />

            {totalItens > 0 && (
              <span className="cart-badge">
                {totalItens}
              </span>
            )}
          </button>

          <a
            href="https://wa.me/551933010493?text=Olá!%20Gostaria%20de%20tirar%20dúvidas%20sobre%20os%20produtos."
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contato via WhatsApp"
            className="icon-button whatsapp-button group"
          >
            <svg
              className="h-[19px] w-[19px] transition-transform duration-300 group-hover:scale-110"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
          </a>
        </div>
      </div>

      {/* MENU MOBILE */}
      <div
        className={`overflow-hidden border-t border-stone-100 bg-white lg:hidden ${
          menuAberto ? "block" : "hidden"
        }`}
      >
        <nav className="px-4 py-2.5 sm:px-6">
          <Link
            href="/catalogo"
            onClick={() => setMenuAberto(false)}
            className="mobile-link"
          >
            <span className="h-2 w-2 rounded-full bg-[#ff8a65]" />
            Catálogo Completo
          </Link>

          <Link
            href="/catalogo?categoria=feminino"
            onClick={() => setMenuAberto(false)}
            className="mobile-link"
          >
            <span className="h-2 w-2 rounded-full bg-[#f48fb1]" />
            Coleção Feminina
          </Link>

          <Link
            href="/catalogo?categoria=masculino"
            onClick={() => setMenuAberto(false)}
            className="mobile-link"
          >
            <span className="h-2 w-2 rounded-full bg-[#81d4fa]" />
            Coleção Masculina
          </Link>
        </nav>
      </div>

      {/* FAIXA COLORIDA */}
      <div className="rainbow-line" />

      <style jsx>{`
        .logo-link {
          transition: transform 0.35s ease;
        }

        .logo-link:hover {
          transform: translateY(-1px);
        }

        .logo-text {
          transition:
            filter 0.35s ease,
            transform 0.35s ease;
        }

        .logo-link:hover .logo-text {
          filter: brightness(1.04);
          transform: scale(1.02);
        }

        .kids-badge {
          transition:
            transform 0.3s ease,
            background-color 0.3s ease,
            box-shadow 0.3s ease;
        }

        .logo-link:hover .kids-badge {
          transform: rotate(-3deg) scale(1.05);
          background-color: #ffe3ef;
          box-shadow: 0 4px 12px rgba(216, 27, 96, 0.12);
        }

        .nav-link {
          position: relative;
          display: flex;
          align-items: center;
          height: 42px;
          padding: 0 18px;
          color: #44403c;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          transition:
            color 0.25s ease,
            transform 0.25s ease;
        }

        .nav-link::after {
          content: "";
          position: absolute;
          left: 16px;
          right: 16px;
          bottom: 5px;
          height: 2px;
          border-radius: 999px;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 0.3s ease;
        }

        .nav-link:hover {
          transform: translateY(-1px);
        }

        .nav-link:hover::after {
          transform: scaleX(1);
        }

        .nav-catalogo:hover {
          color: #ef7048;
        }

        .nav-catalogo::after {
          background: #ff8a65;
        }

        .nav-feminino:hover {
          color: #d81b60;
        }

        .nav-feminino::after {
          background: #f48fb1;
        }

        .nav-masculino:hover {
          color: #0288d1;
        }

        .nav-masculino::after {
          background: #81d4fa;
        }

        .login-button {
          display: flex;
          height: 38px;
          align-items: center;
          gap: 7px;
          border: 1px solid #e7e3e0;
          border-radius: 999px;
          background: #fff;
          padding: 0 12px;
          color: #44403c;
          font-size: 11px;
          font-weight: 800;
          transition:
            transform 0.25s ease,
            border-color 0.25s ease,
            box-shadow 0.25s ease,
            background-color 0.25s ease;
        }

        .login-button:hover {
          transform: translateY(-1px);
          border-color: #d9c7eb;
          background: #fdfaff;
          box-shadow: 0 5px 16px rgba(168, 132, 207, 0.13);
        }

        .icon-button {
          position: relative;
          display: flex;
          height: 38px;
          width: 38px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid #e7e3e0;
          background: #fff;
          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
        }

        .cart-button {
          color: #292524;
        }

        .cart-button:hover {
          transform: translateY(-2px);
          border-color: #a9ddf2;
          color: #0288d1;
          box-shadow: 0 6px 17px rgba(88, 188, 232, 0.16);
        }

        .whatsapp-button {
          color: #149c64;
          border-color: #b9e7d0;
          background: #f4fff9;
        }

        .whatsapp-button:hover {
          transform: translateY(-2px);
          border-color: #67c99b;
          background: #19a96b;
          color: white;
          box-shadow: 0 6px 17px rgba(25, 169, 107, 0.2);
        }

        .cart-badge {
          position: absolute;
          right: -4px;
          top: -5px;
          display: flex;
          min-width: 17px;
          height: 17px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #67b588;
          padding: 0 4px;
          color: white;
          font-size: 9px;
          font-weight: 900;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
          animation: badgePop 0.35s ease;
        }

        .mobile-link {
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #f1efed;
          padding: 13px 5px;
          color: #44403c;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          transition:
            padding-left 0.25s ease,
            color 0.25s ease;
        }

        .mobile-link:hover {
          padding-left: 10px;
          color: #d81b60;
        }

        .rainbow-line {
          height: 3px;
          width: 100%;
          background: linear-gradient(
            90deg,
            #81d4fa 0%,
            #f48fb1 20%,
            #ff8a65 40%,
            #ce93d8 60%,
            #a5d6a7 80%,
            #ffd54f 100%
          );
          background-size: 180% 100%;
          animation: rainbowSlide 10s linear infinite;
        }

        .header-sparkle {
          animation: sparkle 3.5s ease-in-out infinite;
        }

        .header-sparkle-delayed {
          animation: sparkle 4s ease-in-out infinite 1.2s;
        }

        @keyframes sparkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.85) rotate(0deg);
          }

          50% {
            opacity: 0.9;
            transform: scale(1.1) rotate(12deg);
          }
        }

        @keyframes rainbowSlide {
          from {
            background-position: 0% 50%;
          }

          to {
            background-position: 180% 50%;
          }
        }

        @keyframes badgePop {
          0% {
            transform: scale(0.6);
          }

          70% {
            transform: scale(1.12);
          }

          100% {
            transform: scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .header-sparkle,
          .header-sparkle-delayed,
          .rainbow-line {
            animation: none !important;
          }
        }

        @media (max-width: 640px) {
          .login-button {
            height: 36px;
            width: 36px;
            justify-content: center;
            padding: 0;
          }

          .icon-button {
            height: 36px;
            width: 36px;
          }
        }
      `}</style>
    </header>
  )
}
