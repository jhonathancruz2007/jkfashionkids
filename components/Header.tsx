 "use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ShoppingCart,
  User,
  Sparkles,
  Cloud,
  Star,
  Menu,
  X,
  ArrowRight,
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
      setScrolled(window.scrollY > 24)
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })

    async function buscarUsuarioLogado() {
      try {
        const res = await fetch("/api/cliente/perfil")

        if (res.ok) {
          const data = await res.json()
          const cliente = data.cliente || data.user || data

          const nomeBruto =
            cliente.nome ||
            cliente.name ||
            cliente.email ||
            ""

          if (nomeBruto) {
            const primeiroNome = nomeBruto.includes("@")
              ? nomeBruto.split("@")[0]
              : nomeBruto.trim().split(" ")[0]

            const nomeFormatado =
              primeiroNome.charAt(0).toUpperCase() +
              primeiroNome.slice(1)

            setNomeExibicao(nomeFormatado)
            return
          }
        }
      } catch (e) {
        console.error(
          "Erro ao buscar dados do cliente no Header:",
          e
        )
      }

      setNomeExibicao(null)
    }

    buscarUsuarioLogado()

    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full overflow-hidden border-b transition-all duration-500 ${
          scrolled
            ? "border-stone-200/80 bg-white/90 shadow-[0_10px_35px_rgba(0,0,0,0.08)] backdrop-blur-2xl"
            : "border-stone-200/60 bg-white/75 backdrop-blur-xl"
        }`}
      >
        {/* FUNDO ANIMADO */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className={`absolute -top-24 left-1/2 h-52 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#81d4fa]/20 via-[#f48fb1]/25 to-[#b39ddb]/20 blur-3xl transition-all duration-700 ${
              scrolled ? "opacity-40" : "opacity-80"
            }`}
          />

          <div className="header-float absolute -left-16 top-2 h-28 w-28 rounded-full bg-[#81d4fa]/10 blur-2xl" />

          <div className="header-float-delayed absolute -right-14 top-0 h-36 w-36 rounded-full bg-[#f48fb1]/12 blur-3xl" />

          <div className="header-twinkle absolute left-[17%] top-4 text-[#ffd54f]/70">
            <Sparkles className="h-4 w-4 fill-[#ffd54f]/40" />
          </div>

          <div className="header-twinkle-delayed absolute left-[37%] top-5 text-[#81d4fa]/70">
            <Star className="h-3.5 w-3.5 fill-[#81d4fa]/30" />
          </div>

          <div className="header-twinkle absolute right-[26%] top-4 text-[#b39ddb]/70">
            <Sparkles className="h-4 w-4 fill-[#b39ddb]/30" />
          </div>

          <div className="header-twinkle-delayed absolute right-[9%] top-7 text-[#f48fb1]/70">
            <Star className="h-3.5 w-3.5 fill-[#f48fb1]/30" />
          </div>

          <div className="header-float absolute left-2 top-1 hidden text-[#9c27b0]/20 sm:block">
            <Cloud className="h-10 w-10 fill-[#ba68c8]/15 stroke-[#ab47bc]/25" />
          </div>

          <div className="header-float-delayed absolute right-14 -top-1 hidden text-[#e91e63]/20 md:block">
            <Cloud className="h-14 w-14 fill-[#f48fb1]/15 stroke-[#ec407a]/25" />
          </div>
        </div>

        {/* CONTEÚDO PRINCIPAL */}
        <div
          className={`relative z-10 flex w-full items-center justify-between gap-4 px-4 transition-all duration-500 sm:px-6 lg:px-10 2xl:px-16 ${
            scrolled
              ? "py-2.5 sm:py-3"
              : "py-3.5 sm:py-4.5"
          }`}
        >
          {/* LOGO / MENU MOBILE */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMenuAberto((prev) => !prev)}
              className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white/70 text-stone-700 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-[#f48fb1]/50 hover:bg-[#f48fb1]/10 hover:text-[#d81b60] active:scale-90 lg:hidden"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuAberto}
            >
              {menuAberto ? (
                <X className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
              ) : (
                <Menu className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
              )}
            </button>

            <Link
              href="/"
              aria-label="Voltar ao início"
              title="Voltar ao início"
              className="group relative flex items-center gap-2 transition-transform duration-500 hover:scale-[1.025] active:scale-95"
            >
              <span className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#81d4fa]/0 via-[#f48fb1]/15 to-[#b39ddb]/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

              <span className="pointer-events-none absolute -left-2 -top-2 opacity-0 transition-all duration-500 group-hover:-translate-y-1 group-hover:opacity-100">
                <Sparkles
                  className="h-3.5 w-3.5 text-[#ffd54f]"
                  fill="currentColor"
                />
              </span>

              <span className="relative flex items-center">
                <span
                  className="header-logo flex items-center text-lg font-black tracking-tight sm:text-2xl 2xl:text-3xl"
                  style={{
                    WebkitTextStroke: "1px #292524",
                    paintOrder: "stroke fill",
                  }}
                >
                  <span className="text-[#81d4fa]">J</span>
                  <span className="text-[#f48fb1]">K</span>

                  <span className="w-1.5 sm:w-2" />

                  <span className="text-[#ff8a65]">F</span>
                  <span className="text-[#ce93d8]">a</span>
                  <span className="text-[#a5d6a7]">s</span>
                  <span className="text-[#f06292]">h</span>
                  <span className="text-[#4fc3f7]">i</span>
                  <span className="text-[#ffd54f]">o</span>
                  <span className="text-[#b39ddb]">n</span>
                </span>

                <span className="relative ml-1.5 flex items-center rounded-full border border-[#f48fb1]/40 bg-gradient-to-r from-[#fff0f6] to-[#f7efff] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-[#d81b60] shadow-sm transition-all duration-300 group-hover:-rotate-2 group-hover:scale-105 sm:ml-2 sm:px-2.5 sm:py-1 sm:text-[9px]">
                  Kids
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#81d4fa]" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full bg-[#f48fb1]" />
                </span>
              </span>
            </Link>
          </div>

          {/* NAVEGAÇÃO DESKTOP */}
          <nav className="hidden items-center gap-1 rounded-full border border-stone-200/70 bg-white/55 p-1 shadow-sm backdrop-blur-md lg:flex">
            <Link
              href="/catalogo"
              className="header-nav-link group"
            >
              <span>Catálogo</span>
              <span className="header-nav-dot bg-[#ff8a65]" />
            </Link>

            <Link
              href="/catalogo?categoria=feminino"
              className="header-nav-link group"
            >
              <span>Feminino</span>
              <span className="header-nav-dot bg-[#f48fb1]" />
            </Link>

            <Link
              href="/catalogo?categoria=masculino"
              className="header-nav-link group"
            >
              <span>Masculino</span>
              <span className="header-nav-dot bg-[#81d4fa]" />
            </Link>
          </nav>

          {/* AÇÕES */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {montado ? (
              <Link
                href={nomeExibicao ? "/perfil" : "/login"}
                className={`header-action group ${
                  scrolled
                    ? "bg-stone-50/90"
                    : "bg-white/65"
                }`}
              >
                <User className="h-4 w-4 text-[#b39ddb] transition-all duration-300 group-hover:rotate-6 group-hover:scale-110 group-hover:text-[#f48fb1] sm:h-[18px] sm:w-[18px]" />

                <span className="hidden md:inline">
                  {nomeExibicao
                    ? `Olá, ${nomeExibicao}`
                    : "Entrar"}
                </span>
              </Link>
            ) : (
              <div className="h-10 w-10 animate-pulse rounded-full bg-stone-100 sm:w-28" />
            )}

            <button
              type="button"
              onClick={abrirCarrinho}
              className="header-icon-button group"
              aria-label="Abrir carrinho"
            >
              <ShoppingCart className="h-[19px] w-[19px] transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 sm:h-5 sm:w-5" />

              {totalItens > 0 && (
                <span className="absolute -right-0.5 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#67b588] to-[#418d62] px-1 text-[9px] font-black text-white shadow-md ring-2 ring-white sm:text-[10px]">
                  {totalItens}
                </span>
              )}
            </button>

            <a
              href="https://wa.me/551933010493?text=Olá!%20Gostaria%20de%20tirar%20dúvidas%20sobre%20os%20produtos."
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contato via WhatsApp"
              className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50/80 text-emerald-600 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-500 hover:text-white hover:shadow-[0_8px_20px_rgba(16,185,129,0.25)] active:scale-90 sm:h-10 sm:w-10"
            >
              <svg
                className="h-4.5 w-4.5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 sm:h-5 sm:w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>

              <span className="pointer-events-none absolute inset-0 rounded-full border border-emerald-300 opacity-0 transition-all duration-500 group-hover:scale-125 group-hover:opacity-0 group-hover:animate-ping" />
            </a>
          </div>
        </div>

        {/* MENU MOBILE */}
        <div
          className={`relative z-20 overflow-hidden lg:hidden ${
            menuAberto ? "block" : "hidden"
          }`}
        >
          <nav className="border-t border-stone-200/70 bg-white/90 px-4 py-3 shadow-[0_15px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:px-6">
            <div className="flex flex-col gap-1">
              <Link
                href="/catalogo"
                onClick={() => setMenuAberto(false)}
                className="mobile-nav-item"
              >
                <span>
                  <span className="mobile-nav-dot bg-[#ff8a65]" />
                  Catálogo Completo
                </span>

                <ArrowRight className="h-4 w-4 opacity-40 transition-transform duration-300" />
              </Link>

              <Link
                href="/catalogo?categoria=feminino"
                onClick={() => setMenuAberto(false)}
                className="mobile-nav-item"
              >
                <span>
                  <span className="mobile-nav-dot bg-[#f48fb1]" />
                  Coleção Feminina
                </span>

                <ArrowRight className="h-4 w-4 opacity-40 transition-transform duration-300" />
              </Link>

              <Link
                href="/catalogo?categoria=masculino"
                onClick={() => setMenuAberto(false)}
                className="mobile-nav-item"
              >
                <span>
                  <span className="mobile-nav-dot bg-[#81d4fa]" />
                  Coleção Masculina
                </span>

                <ArrowRight className="h-4 w-4 opacity-40 transition-transform duration-300" />
              </Link>
            </div>
          </nav>
        </div>

        {/* BARRA COLORIDA */}
        <div className="header-rainbow-bar h-[3px] w-full" />
      </header>

      <style jsx>{`
        .header-logo {
          animation: logoFloat 5s ease-in-out infinite;
        }

        .header-float {
          animation: floatSlow 7s ease-in-out infinite;
        }

        .header-float-delayed {
          animation: floatSlow 9s ease-in-out infinite reverse;
        }

        .header-twinkle {
          animation: twinkle 3s ease-in-out infinite;
        }

        .header-twinkle-delayed {
          animation: twinkle 4.5s ease-in-out infinite 0.8s;
        }

        .header-rainbow-bar {
          background: linear-gradient(
            90deg,
            #81d4fa,
            #f48fb1,
            #ff8a65,
            #ce93d8,
            #a5d6a7,
            #ffd54f,
            #b39ddb,
            #81d4fa
          );
          background-size: 300% 100%;
          animation: rainbowMove 8s linear infinite;
        }

        .header-nav-link {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.62rem 0.9rem;
          border-radius: 999px;
          color: #44403c;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition:
            transform 0.3s ease,
            color 0.3s ease,
            background-color 0.3s ease;
        }

        .header-nav-link:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.9);
          color: #1c1917;
        }

        .header-nav-dot {
          width: 0.34rem;
          height: 0.34rem;
          border-radius: 999px;
          opacity: 0;
          transform: scale(0.4);
          transition:
            opacity 0.3s ease,
            transform 0.3s ease;
        }

        .header-nav-link:hover .header-nav-dot {
          opacity: 1;
          transform: scale(1);
        }

        .header-action {
          display: flex;
          height: 2.5rem;
          align-items: center;
          gap: 0.45rem;
          border: 1px solid rgba(214, 211, 209, 0.8);
          border-radius: 999px;
          padding: 0 0.75rem;
          color: #292524;
          font-size: 0.68rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.04);
          backdrop-filter: blur(12px);
          transition:
            transform 0.3s ease,
            border-color 0.3s ease,
            box-shadow 0.3s ease,
            background-color 0.3s ease;
        }

        .header-action:hover {
          transform: translateY(-1px);
          border-color: rgba(179, 157, 219, 0.7);
          box-shadow: 0 8px 22px rgba(179, 157, 219, 0.16);
        }

        .header-icon-button {
          position: relative;
          display: flex;
          height: 2.5rem;
          width: 2.5rem;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(214, 211, 209, 0.8);
          background: rgba(255, 255, 255, 0.68);
          color: #292524;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.04);
          backdrop-filter: blur(12px);
          transition:
            transform 0.3s ease,
            color 0.3s ease,
            border-color 0.3s ease,
            background-color 0.3s ease,
            box-shadow 0.3s ease;
        }

        .header-icon-button:hover {
          transform: translateY(-1px);
          color: #0288d1;
          border-color: rgba(129, 212, 250, 0.8);
          background: rgba(239, 251, 255, 0.95);
          box-shadow: 0 8px 22px rgba(129, 212, 250, 0.18);
        }

        .mobile-nav-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 1rem;
          padding: 0.9rem 1rem;
          color: #292524;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          transition:
            transform 0.3s ease,
            background-color 0.3s ease,
            color 0.3s ease;
          animation: menuItemIn 0.35s ease both;
        }

        .mobile-nav-item:nth-child(2) {
          animation-delay: 0.05s;
        }

        .mobile-nav-item:nth-child(3) {
          animation-delay: 0.1s;
        }

        .mobile-nav-item:hover {
          transform: translateX(4px);
          background: rgba(248, 250, 252, 0.95);
          color: #111827;
        }

        .mobile-nav-item > span:first-child {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .mobile-nav-dot {
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 999px;
          box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.025);
        }

        @keyframes logoFloat {
          0%,
          100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-1.5px);
          }
        }

        @keyframes floatSlow {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }

          50% {
            transform: translate3d(10px, -6px, 0) rotate(3deg);
          }
        }

        @keyframes twinkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.85) rotate(0deg);
          }

          50% {
            opacity: 0.95;
            transform: scale(1.12) rotate(12deg);
          }
        }

        @keyframes rainbowMove {
          0% {
            background-position: 0% 50%;
          }

          100% {
            background-position: 300% 50%;
          }
        }

        @keyframes menuItemIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .header-logo,
          .header-float,
          .header-float-delayed,
          .header-twinkle,
          .header-twinkle-delayed,
          .header-rainbow-bar {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
