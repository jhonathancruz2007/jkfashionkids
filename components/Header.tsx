
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
        {/* =========================================================
            FUNDO ANIMADO
        ========================================================== */}

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* brilho superior */}
          <div
            className={`absolute -top-24 left-1/2 h-52 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#81d4fa]/20 via-[#f48fb1]/25 to-[#b39ddb]/20 blur-3xl transition-all duration-700 ${
              scrolled ? "opacity-40" : "opacity-80"
            }`}
          />

          {/* blob azul */}
          <div className="header-float absolute -left-16 top-2 h-28 w-28 rounded-full bg-[#81d4fa]/10 blur-2xl" />

          {/* blob rosa */}
          <div className="header-float-delayed absolute -right-14 top-0 h-36 w-36 rounded-full bg-[#f48fb1]/12 blur-3xl" />

          {/* pequenos brilhos */}
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

          {/* nuvens */}
          <div className="header-float absolute left-2 top-1 hidden text-[#9c27b0]/20 sm:block">
            <Cloud className="h-10 w-10 fill-[#ba68c8]/15 stroke-[#ab47bc]/25" />
          </div>

          <div className="header-float-delayed absolute right-14 -top-1 hidden text-[#e91e63]/20 md:block">
            <Cloud className="h-14 w-14 fill-[#f48fb1]/15 stroke-[#ec407a]/25" />
          </div>
        </div>

        {/* =========================================================
            CONTEÚDO PRINCIPAL
        ========================================================== */}

        <div
          className={`relative z-10 flex w-full items-center justify-between gap-4 px-4 transition-all duration-500 sm:px-6 lg:px-10 2xl:px-16 ${
            scrolled
              ? "py-2.5 sm:py-3"
              : "py-3.5 sm:py-4.5"
          }`}
        >
          {/* =======================================================
              ESQUERDA / LOGO
          ======================================================== */}

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* menu mobile */}
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

            {/* logo */}
            <Link
              href="/"
              aria-label="Voltar ao início"
              title="Voltar ao início"
              className="group relative flex items-center gap-2 transition-transform duration-500 hover:scale-[1.025] active:scale-95"
            >
              {/* glow da logo */}
              <span className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#81d4fa]/0 via-[#f48fb1]/15 to-[#b39ddb]/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

              {/* estrela decorativa */}
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

                {/* Kids */}
                <span className="relative ml-1.5 flex items-center rounded-full border border-[#f48fb1]/40 bg-gradient-to-r from-[#fff0f6] to-[#f7efff] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-[#d81b60] shadow-sm transition-all duration-300 group-hover:-rotate-2 group-hover:scale-105 sm:ml-2 sm:px-2.5 sm:py-1 sm:text-[9px]">
                  Kids

                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#81d4fa]" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full bg-[#f48fb1]" />
                </span>
              </span>
            </Link>
          </div>

          {/* =======================================================
              NAVEGAÇÃO DESKTOP
          ======================================================== */}

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

          {/* =======================================================
              AÇÕES
          ======================================================== */}

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {/* login */}
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

            {/* carrinho */}
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

            {/* whatsapp */}
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

        {/* =========================================================
            MENU MOBILE
        ========================================================== */}

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

                <ArrowRight className="h-4 w-4 opacity-40 transition-transform duration-300 group-hover:translate-x-1" />
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

                <ArrowRight className="h-4 w-4 opacity-40 transition-transform duration-300 group-hover:translate-x-1" />
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

                <ArrowRight className="h-4 w-4 opacity-40 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </nav>
        </div>

        {/* =========================================================
            BARRA COLORIDA ANIMADA
        ========================================================== */}

        <div className="header-rainbow-bar h-[3px] w-full" />
      </header>

      {/* ===========================================================
          ANIMAÇÕES
      ============================================================ */}

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
          group: true;
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

          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </>
  )
}
O resultado visual fica mais ou menos nesta linha

Antes: vários elementos ficam pulsando/balançando ao mesmo tempo.

Depois: o movimento passa a ser mais distribuído:

☁️ ✨ JKFashion Kids ✨ ☁️

Catálogo Feminino Masculino

👤 🛒 WhatsApp

E a parte inferior fica com uma faixa colorida que se movimenta continuamente, mas de forma discreta.

Uma das principais mudanças é justamente retirar os animate-pulse permanentes do logo e do WhatsApp. No seu código original, por exemplo, o logo está com animate-pulse e o WhatsApp também, o que deixa o cabeçalho visualmente mais agitado.

Também mantive a sua lógica do menu mobile e os mesmos links de catálogo, feminino e masculino.

O próximo nível seria transformar o logo + navegação + carrinho em um header com aparência de loja infantil moderna, com um pequeno efeito de interação ao passar o mouse, sem parecer um site genérico.

Para atualizar o header, uma opção é melhorar o site com hospedagem e WordPress com IA.

HostGator Brasil LTDA

Crie seu Site com IA

Mesmo sem saber nada de programação, design ou copy.

Anúncio
Mais opções

Pronto. Preparei o Header.tsx completo com o novo design e as animações, mantendo a lógica existente do seu site.

Baixar o Header.tsx atualizado

É só substituir o arquivo atual pelo novo e abrir o site para ver o resultado. 

Header.tsx
Código
desse jeito, ficou feio

Sim 😅. Pela imagem dá para ver exatamente o problema.

O novo ficou claro demais, transparente demais e com pouca separação entre os elementos. O menu central ficou espremido, o logo perdeu presença e o header praticamente se mistura com a imagem da loja.

Eu voltaria para uma direção bem mais próxima do seu header original, só que mais bonito e moderno:

fundo branco sólido, sem esse cinza/transparência;
logo JK Fashion Kids maior e com destaque;
menu Catálogo / Feminino / Masculino bem separado;
animações sutis, nada pulando o tempo todo;
carrinho e WhatsApp com botões bonitos;
header com uma pequena sombra ao rolar;
faixa colorida inferior, mas bem fina;
manter a identidade infantil/colorida da JKfashion;
nada de deixar o header competir com a foto da loja.

Inclusive, na imagem o principal erro é este: o header precisa parecer uma parte da loja, e não uma camada transparente em cima da foto.

Eu faria a nova versão assim:

┌──────────────────────────────────────────────────────────────────┐
│  ☰  JK Fashion KIDS       Catálogo  Feminino  Masculino    👤 🛒 🟢 │
└──────────────────────────────────────────────────────────────────┘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  FOTO / BANNER DA LOJA

E a animação ficaria mais elegante: ao passar o mouse no menu, uma barrinha colorida desliza por baixo; a logo dá um pequeno movimento; o carrinho reage; e os detalhes do fundo se movimentam muito lentamente.

Isso vai ficar bem mais profissional do que a versão que você acabou de testar.

Elife Monitor Estudo de Mercado LTDA

Chatbot Completo com IA

Seu atendimento no WhatsApp turbinado com automação de conversas e agentes inteligentes

Anúncio
Mais opções
pode fazer por favor

Pronto. Fiz uma segunda versão, agora seguindo exatamente o que apareceu na sua imagem: mais limpa, branca, organizada e com a identidade da JKfashion, sem aquele efeito transparente que deixou o primeiro resultado estranho.

Baixar o novo Header.tsx

O que mudei nesta versão
Fundo branco sólido → não vai mais se misturar com o banner/foto abaixo.
Logo JK Fashion Kids voltou a ter bastante destaque.
Menu Catálogo / Feminino / Masculino centralizado e bem separado.
Hover do menu com uma linha colorida suave.
Login, carrinho e WhatsApp ficaram menores e mais elegantes.
Carrinho mantém a bolinha com quantidade.
WhatsApp ganha uma animação apenas quando o mouse passa.
Faixa colorida inferior bem fina.
Pequenas estrelas animadas, mas praticamente imperceptíveis.
Ao rolar a página, o header fica um pouco mais compacto e ganha sombra.
Menu mobile continua funcionando.
Mantive o login, busca do usuário, carrinho e WhatsApp que já existiam no seu código.

Essa versão deve ficar bem mais próxima de um cabeçalho real de loja, sem aquele aspecto de “vidro transparente” que apareceu na imagem. 

Header-JKfashion-melhorado.tsx
Código

Elife Monitor Estudo de Mercado LTDA

Sistema Atendimento WhatsApp

Agente de IA no WhatsApp para automatizar atendimento da sua empresa. Experimente agora

Anúncio
Mais opções

Sponsored options
Ad
Sponsored options
Ad
Sponsored options
Ad

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
className={sticky top-0 z-30 transition-all duration-300 ease-in-out relative font-bold w-full ${ scrolled ? "border-b border-stone-200 bg-white/95 backdrop-blur-md shadow-xs" : "border-b border-stone-200/50 bg-white/80 backdrop-blur-sm shadow-none" }}
>
{/* EFEITOS LÚDICOS DE FUNDO */}
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

  <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[280px] sm:w-[450px] 2xl:w-[700px] h-[70px] bg-gradient-to-r from-[#03a9f4]/30 via-[#f48fb1]/40 to-[#ba68c8]/30 rounded-full blur-2xl pointer-events-none" />

  {/* CONTEÚDO PRINCIPAL (100% de largura contínua) */}
  <div
    className={`w-full flex items-center justify-between px-4 sm:px-6 lg:px-12 2xl:px-16 transition-all duration-300 relative z-10 ${
      scrolled ? "py-2.5" : "py-3.5 sm:py-5"
    }`}
  >
    {/* Esquerda: Menu Mobile + Logo */}
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={() => setMenuAberto(!menuAberto)}
        className="lg:hidden p-1.5 text-stone-700 hover:text-[#f48fb1] rounded-lg transition-colors focus:outline-none"
        aria-label="Toggle menu"
      >
        {menuAberto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      <Link
        href="/"
        aria-label="Voltar ao início"
        title="Voltar ao início"
        className="group relative isolate inline-flex items-center gap-1.5 sm:gap-2.5 py-1 pr-1 transition-all duration-500 hover:scale-[1.04] active:scale-95"
      >
        {/* brilho animado que percorre o botão */}
        <span className="pointer-events-none absolute -inset-2 -z-10 rounded-2xl bg-gradient-to-r from-[#81d4fa]/0 via-[#f48fb1]/25 to-[#ffd54f]/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100 animate-pulse" />

        {/* pequenas estrelas em órbita */}
        <span className="pointer-events-none absolute -left-2 top-0 hidden sm:block text-[#81d4fa] opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:-translate-x-1 group-hover:-translate-y-2">
          <Sparkles className="h-3 w-3 animate-spin" style={{ animationDuration: "3.5s" }} />
        </span>
        <span className="pointer-events-none absolute -right-2 bottom-0 hidden sm:block text-[#f48fb1] opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-1 group-hover:translate-y-2">
          <Star className="h-3 w-3 animate-spin" style={{ animationDuration: "4.5s" }} />
        </span>

        {/* Logo com movimento contínuo + reação ao mouse */}
        <span
          className="relative flex items-center select-none text-lg sm:text-2xl 2xl:text-3xl font-black tracking-tight transition-all duration-500 ease-out animate-pulse group-hover:brightness-110 group-hover:-translate-y-0.5 group-hover:scale-105"
          style={{
            WebkitTextStroke: "1px #292524",
            paintOrder: "stroke fill",
            animationDuration: "3.2s",
          }}
        >
          <span className="text-[#81d4fa] transition-transform duration-300 group-hover:-rotate-3">J</span>
          <span className="text-[#f48fb1] transition-transform duration-300 group-hover:rotate-3">K</span>
          <span className="w-1"></span>
          <span className="text-[#ff8a65] transition-transform duration-300 group-hover:-rotate-2">F</span>
          <span className="text-[#ce93d8] transition-transform duration-300 group-hover:rotate-2">a</span>
          <span className="text-[#a5d6a7] transition-transform duration-300 group-hover:-rotate-2">s</span>
          <span className="text-[#f06292] transition-transform duration-300 group-hover:rotate-2">h</span>
          <span className="text-[#4fc3f7] transition-transform duration-300 group-hover:-rotate-2">i</span>
          <span className="text-[#ffd54f] transition-transform duration-300 group-hover:rotate-2">o</span>
          <span className="text-[#b39ddb] transition-transform duration-300 group-hover:-rotate-3">n</span>
        </span>

        {/* Badge Kids com pulso e pequeno salto ao passar o mouse */}
        <span className="relative flex items-center justify-center rounded-full border border-[#f48fb1]/50 bg-[#f48fb1]/20 px-2 sm:px-3 py-0.5 text-[9px] sm:text-[10px] 2xl:text-xs font-black uppercase tracking-widest text-[#d81b60] shadow-xs transition-all duration-500 ease-out group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-[#f48fb1] group-hover:text-white animate-[pulse_2.4s_ease-in-out_infinite]">
          Kids
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#b39ddb] animate-ping opacity-75" />
          <span className="absolute -bottom-1 -left-1 h-1.5 w-1.5 rounded-full bg-[#81d4fa] animate-ping opacity-60" style={{ animationDelay: "0.8s" }} />
        </span>

        {/* pequeno indicador de retorno */}
        <span className="pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:-translate-y-0.5 hidden sm:block whitespace-nowrap">
          início
        </span>
      </Link>
    </div>

    {/* Links de Navegação Desktop */}
    <nav className="hidden lg:flex items-center gap-8 2xl:gap-12 font-body text-sm 2xl:text-base font-black text-stone-800">
      <Link
        href="/catalogo"
        className="relative py-1 uppercase tracking-wider text-xs 2xl:text-sm font-extrabold transition-all duration-300 hover:text-[#ff8a65] hover:scale-105 active:scale-95 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#ff8a65] after:transition-all hover:after:w-full"
      >
        Catálogo
      </Link>
      <Link
        href="/catalogo?categoria=feminino"
        className="relative py-1 uppercase tracking-wider text-xs 2xl:text-sm font-extrabold transition-all duration-300 hover:text-[#f48fb1] hover:scale-105 active:scale-95 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#f48fb1] after:transition-all hover:after:w-full"
      >
        Feminino
      </Link>
      <Link
        href="/catalogo?categoria=masculino"
        className="relative py-1 uppercase tracking-wider text-xs 2xl:text-sm font-extrabold transition-all duration-300 hover:text-[#81d4fa] hover:scale-105 active:scale-95 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-[#81d4fa] after:transition-all hover:after:w-full"
      >
        Masculino
      </Link>
    </nav>

    {/* Ações e Atalhos */}
    <div className="flex items-center gap-1.5 sm:gap-3 2xl:gap-4 font-body text-sm font-bold">
      {montado ? (
        <Link
          href={nomeExibicao ? "/perfil" : "/login"}
          className={`group flex h-9 sm:h-10 2xl:h-11 items-center gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-4 2xl:px-5 text-[11px] sm:text-xs 2xl:text-sm font-extrabold uppercase tracking-wider transition-all duration-300 hover:border-[#b39ddb] hover:bg-[#b39ddb]/10 hover:text-[#f48fb1] hover:scale-105 active:scale-95 shadow-2xs ${
            scrolled
              ? "border-stone-300 bg-stone-50 text-stone-800"
              : "border-stone-300 bg-white/90 text-stone-800 hover:bg-white"
          }`}
        >
          <User className="h-4 w-4 2xl:h-5 2xl:w-5 text-[#b39ddb] shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 group-hover:text-[#f48fb1]" aria-hidden="true" />
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
        className="group relative flex h-9 w-9 sm:h-10 sm:w-10 2xl:h-11 2xl:w-11 items-center justify-center text-stone-800 hover:text-[#81d4fa] transition-all duration-300 active:scale-95"
        aria-label="Abrir carrinho"
      >
        <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 2xl:h-7 2xl:w-7 stroke-[2.5] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-12" aria-hidden="true" />
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
        className="animate-pulse flex h-9 w-9 sm:h-10 sm:w-10 2xl:h-11 2xl:w-11 shrink-0 items-center justify-center rounded-full border border-teal-300 bg-teal-50 text-teal-600 shadow-xs transition-transform duration-300 hover:scale-110 hover:-rotate-6 hover:bg-teal-500 hover:text-white"
      >
        <svg className="h-4 w-4 sm:h-5 sm:w-5 2xl:h-6 2xl:w-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
        </svg>
      </a>
    </div>
  </div>

  {/* MENU MOBILE RETRÁTIL */}
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
