"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Truck,
  HeartHandshake,
  ShoppingBag,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Heart,
  Gift,
  Clock,
  PackageOpen,
} from "lucide-react"
import Link from "next/link"
import { CardProduto, Produto } from "@/components/CartaoProduto"

// Faixas etárias para o bloco "Presente por idade"
const faixasIdade = [
  {
    id: "ate-1-ano",
    label: "até 1 ano",
    href: "/catalogo?idade=0-1",
    bgColor: "bg-[#81d4fa]/15 hover:bg-[#81d4fa]/25",
    textColor: "text-[#0284c7]",
    borderColor: "border-[#81d4fa]/40",
  },
  {
    id: "1-a-2-anos",
    label: "1 a 2 anos",
    href: "/catalogo?idade=1-2",
    bgColor: "bg-[#b39ddb]/15 hover:bg-[#b39ddb]/25",
    textColor: "text-[#673ab7]",
    borderColor: "border-[#b39ddb]/40",
  },
  {
    id: "3-a-5-anos",
    label: "3 a 5 anos",
    href: "/catalogo?idade=3-5",
    bgColor: "bg-[#ffd54f]/20 hover:bg-[#ffd54f]/35",
    textColor: "text-amber-900",
    borderColor: "border-[#ffd54f]/60",
  },
  {
    id: "6-a-8-anos",
    label: "6 a 8 anos",
    href: "/catalogo?idade=6-8",
    bgColor: "bg-[#ff8a65]/15 hover:bg-[#ff8a65]/25",
    textColor: "text-[#c2410c]",
    borderColor: "border-[#ff8a65]/40",
  },
  {
    id: "mais-9-anos",
    label: "+9 anos",
    href: "/catalogo?idade=9-plus",
    bgColor: "bg-[#f48fb1]/15 hover:bg-[#f48fb1]/25",
    textColor: "text-[#c2185b]",
    borderColor: "border-[#f48fb1]/40",
  },
]

// Componente de Contagem Regressiva até o fim do mês
function TimerFimDoMes() {
  const [tempoRestante, setTempoRestante] = useState({
    dias: 0,
    horas: 0,
    minutos: 0,
    segundos: 0,
  })

  useEffect(() => {
    function calcularTempo() {
      const agora = new Date()
      const ano = agora.getFullYear()
      const mes = agora.getMonth()
      const ultimoDia = new Date(ano, mes + 1, 0, 23, 59, 59)

      const diferenca = ultimoDia.getTime() - agora.getTime()

      if (diferenca > 0) {
        const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24))
        const horas = Math.floor((diferenca / (1000 * 60 * 60)) % 24)
        const minutos = Math.floor((diferenca / 1000 / 60) % 60)
        const segundos = Math.floor((diferenca / 1000) % 60)

        setTempoRestante({ dias, horas, minutos, segundos })
      } else {
        setTempoRestante({ dias: 0, horas: 0, minutos: 0, segundos: 0 })
      }
    }

    calcularTempo()
    const intervalo = setInterval(calcularTempo, 1000)
    return () => clearInterval(intervalo)
  }, [])

  return (
    <div
      aria-live="polite"
      aria-label={`Tempo restante da promoção: ${tempoRestante.dias} dias, ${tempoRestante.horas} horas, ${tempoRestante.minutos} minutos e ${tempoRestante.segundos} segundos`}
      className="flex items-center gap-2 bg-[#ffd54f]/15 border border-[#ffd54f]/40 px-3.5 py-2 rounded-2xl shadow-2xs"
    >
      <Clock className="h-4 w-4 text-amber-900 animate-pulse" aria-hidden="true" />
      <div className="text-xs sm:text-sm font-black text-amber-900 flex items-center gap-1">
        <span>Termina em:</span>
        <div className="flex items-center gap-1 font-mono">
          <span className="bg-white/90 px-1.5 py-0.5 rounded-md border border-[#ffd54f]/30">
            {String(tempoRestante.dias).padStart(2, "0")}d
          </span>
          <span aria-hidden="true">:</span>
          <span className="bg-white/90 px-1.5 py-0.5 rounded-md border border-[#ffd54f]/30">
            {String(tempoRestante.horas).padStart(2, "0")}h
          </span>
          <span aria-hidden="true">:</span>
          <span className="bg-white/90 px-1.5 py-0.5 rounded-md border border-[#ffd54f]/30">
            {String(tempoRestante.minutos).padStart(2, "0")}m
          </span>
          <span aria-hidden="true">:</span>
          <span className="bg-white/90 px-1.5 py-0.5 rounded-md border border-[#ffd54f]/30">
            {String(tempoRestante.segundos).padStart(2, "0")}s
          </span>
        </div>
      </div>
    </div>
  )
}

// Componente "Presente por Idade"
function PresentePorIdade({ faixas }: { faixas: typeof faixasIdade }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rolar = (direcao: "esquerda" | "direita") => {
    if (scrollRef.current) {
      const deslocamento = direcao === "esquerda" ? -180 : 180
      scrollRef.current.scrollBy({ left: deslocamento, behavior: "smooth" })
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="w-full max-w-[1920px] 3xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 pt-12 relative z-10"
      aria-label="Presente por idade"
    >
      <div className="bg-white/90 backdrop-blur-md rounded-3xl p-6 md:p-8 2xl:p-10 border border-[#b39ddb]/20 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-[#b39ddb]/15 text-[#673ab7] border border-[#b39ddb]/30 shadow-2xs">
              <Gift className="h-5 w-5 2xl:h-6 2xl:w-6" aria-hidden="true" />
            </div>
            <h2 className="text-xl sm:text-2xl 2xl:text-3xl font-black text-stone-800 tracking-tight">
              Presente por idade
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                type="button"
                onClick={() => rolar("esquerda")}
                className="p-2.5 rounded-2xl bg-white/90 text-stone-700 border border-[#b39ddb]/30 shadow-md backdrop-blur-md hover:bg-[#673ab7] hover:text-white transition-all active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
                aria-label="Rolar faixas etárias para a esquerda"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => rolar("direita")}
                className="p-2.5 rounded-2xl bg-white/90 text-stone-700 border border-[#b39ddb]/30 shadow-md backdrop-blur-md hover:bg-[#673ab7] hover:text-white transition-all active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
                aria-label="Rolar faixas etárias para a direita"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <Link
              href="/catalogo"
              className="text-xs sm:text-sm 2xl:text-base font-extrabold text-[#673ab7] hover:text-[#7e57c2] transition-colors underline underline-offset-4 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7] rounded-md"
            >
              ver todas
            </Link>
          </div>
        </div>

        <div className="relative">
          <div
            ref={scrollRef}
            className="flex gap-3 sm:gap-4 2xl:gap-6 overflow-x-auto pb-2 scroll-smooth scrollbar-none sm:grid sm:grid-cols-3 md:grid-cols-5 sm:overflow-visible w-full"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {faixas.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`
                  flex-shrink-0 sm:flex-shrink flex items-center justify-center
                  px-6 py-3.5 2xl:py-4 rounded-full font-black text-sm sm:text-base 2xl:text-lg
                  border shadow-2xs hover:shadow-xs transform hover:-translate-y-0.5 transition-all duration-200
                  text-center whitespace-nowrap min-w-[130px] sm:min-w-0 w-full
                  focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]
                  ${item.bgColor} ${item.textColor} ${item.borderColor}
                `}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  )
}

// Componente do Banner Hero Full-Width
function HeroFullWidth({ imagens }: { imagens: string[] }) {
  const [indexAtual, setIndexAtual] = useState(0)

  const anterior = () => {
    setIndexAtual((prev) => (prev === 0 ? imagens.length - 1 : prev - 1))
  }

  const proximo = () => {
    setIndexAtual((prev) => (prev === imagens.length - 1 ? 0 : prev + 1))
  }

  useEffect(() => {
    if (imagens.length <= 1) return
    const interval = setInterval(() => {
      setIndexAtual((prev) => (prev === imagens.length - 1 ? 0 : prev + 1))
    }, 5000)
    return () => clearInterval(interval)
  }, [imagens.length])

  return (
    <section className="relative w-full h-[540px] sm:h-[600px] lg:h-[650px] xl:h-[700px] 2xl:h-[750px] 3xl:h-[850px] overflow-hidden bg-stone-100 border-b border-[#b39ddb]/20" aria-label="Destaques principais">
      {imagens.map((img, index) => (
        <img
          key={img + index}
          src={img}
          alt={`Foto da Loja JK Fashion Kids ${index + 1} de ${imagens.length}`}
          aria-hidden={index !== indexAtual}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-out transform ${
            index === indexAtual
              ? "opacity-100 scale-100 z-0"
              : "opacity-0 scale-105 z-[-1]"
          }`}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-r from-stone-900/40 via-stone-900/10 to-transparent z-10" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/40 via-transparent to-white/20 z-10" aria-hidden="true" />

      <div className="relative z-20 w-full max-w-[1920px] 3xl:max-w-[2200px] mx-auto h-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 flex items-center">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-xl lg:max-w-2xl xl:max-w-3xl 2xl:max-w-4xl bg-white/85 backdrop-blur-md p-6 sm:p-10 lg:p-12 2xl:p-16 rounded-3xl border border-white/60 shadow-2xl text-left space-y-6"
        >
          <span className="inline-flex items-center gap-2 bg-[#b39ddb]/15 backdrop-blur-md border border-[#b39ddb]/30 text-[#673ab7] text-xs sm:text-sm 2xl:text-base font-black px-4 py-2 rounded-full tracking-wide shadow-2xs">
            <Sparkles className="h-4 w-4 2xl:h-5 2xl:w-5 text-amber-500 fill-amber-500" aria-hidden="true" /> Moda Infantil Divertida & Confortável
          </span>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl 2xl:text-7xl font-black tracking-tight leading-[1.12] text-stone-900">
            Vestindo a infância de{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#673ab7] via-[#0284c7] to-[#c2185b]">
              alegria e estilo!
            </span>
          </h1>

          <p className="text-stone-600 text-sm sm:text-base lg:text-lg 2xl:text-xl leading-relaxed font-medium">
            Explore nossos lookinhos cheios de vida, maciez e liberdade para os pequenos aproveitarem cada brincadeira com conforto.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/catalogo"
                className="w-full sm:w-auto bg-gradient-to-r from-[#673ab7] via-[#7e57c2] to-[#0284c7] hover:opacity-95 text-white font-bold px-7 py-3.5 2xl:px-9 2xl:py-4 rounded-2xl transition-all text-sm sm:text-base 2xl:text-lg flex items-center justify-center gap-3 shadow-xl shadow-[#673ab7]/30 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#673ab7]"
              >
                <ShoppingBag className="h-5 w-5 2xl:h-6 2xl:w-6 animate-pulse" aria-hidden="true" />
                Explorar Catálogo
                <ArrowRight className="h-5 w-5 2xl:h-6 2xl:w-6" aria-hidden="true" />
              </Link>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <a
                href="https://www.google.com/maps/place/Jk+Fashion+Kids/@-22.7107181,-47.6551293,17z/data=!3m1!4b1!4m6!3m5!1s0x94c6319a39c47125:0xca92646393e7dff6!8m2!3d-22.7107181!4d-47.6551293!16s%2Fg%2F11z9j96_v3?entry=ttu"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 2xl:px-8 2xl:py-4 rounded-2xl bg-white/95 hover:bg-white text-stone-800 text-sm sm:text-base 2xl:text-lg font-bold border border-stone-200 shadow-md backdrop-blur-md transition-all focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#673ab7]"
              >
                <MapPin className="h-4 w-4 2xl:h-5 2xl:w-5 text-[#673ab7]" aria-hidden="true" />
                Nossa Loja Física
              </a>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {imagens.length > 1 && (
        <>
          <button
            type="button"
            onClick={anterior}
            className="absolute left-4 2xl:left-8 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 2xl:h-14 2xl:w-14 items-center justify-center rounded-2xl bg-white/90 text-stone-800 border border-white/60 shadow-lg backdrop-blur-md hover:bg-[#673ab7] hover:text-white transition-all active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
            aria-label="Ver imagem anterior do banner"
          >
            <ChevronLeft className="h-6 w-6 2xl:h-7 2xl:w-7" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={proximo}
            className="absolute right-4 2xl:right-8 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 2xl:h-14 2xl:w-14 items-center justify-center rounded-2xl bg-white/90 text-stone-800 border border-white/60 shadow-lg backdrop-blur-md hover:bg-[#673ab7] hover:text-white transition-all active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
            aria-label="Ver próxima imagem do banner"
          >
            <ChevronRight className="h-6 w-6 2xl:h-7 2xl:w-7" aria-hidden="true" />
          </button>
        </>
      )}

      {imagens.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 bg-white/80 border border-white/40 backdrop-blur-md px-4 py-2 rounded-full shadow-md" role="tablist" aria-label="Navegação por imagens do banner">
          {imagens.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === indexAtual}
              onClick={() => setIndexAtual(idx)}
              className={`h-2.5 rounded-full transition-all focus:outline-hidden focus:ring-2 focus:ring-[#673ab7] ${
                idx === indexAtual ? "w-7 bg-[#673ab7] shadow-2xs" : "w-2.5 bg-stone-300 hover:bg-stone-400"
              }`}
              aria-label={`Ir para a imagem ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// Componente para o Carrossel Horizontal de Produtos
function CarrosselProdutos({
  produtos,
  ehAdmin,
  handleAlterarExibicaoAdmin,
  tituloSecao,
}: {
  produtos: Produto[]
  ehAdmin: boolean
  handleAlterarExibicaoAdmin: (id: string | number, local: string | boolean) => void
  tituloSecao?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rolar = (direcao: "esquerda" | "direita") => {
    if (scrollRef.current) {
      const deslocamento = direcao === "esquerda" ? -360 : 360
      scrollRef.current.scrollBy({ left: deslocamento, behavior: "smooth" })
    }
  }

  return (
    <div className="relative group/carrossel w-full">
      <button
        type="button"
        onClick={() => rolar("esquerda")}
        className="absolute -left-5 2xl:-left-7 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-12 w-12 2xl:h-14 2xl:w-14 items-center justify-center rounded-2xl bg-white/90 text-stone-800 border border-white/60 shadow-lg backdrop-blur-md hover:bg-[#673ab7] hover:text-white transition-all active:scale-95 opacity-90 md:opacity-0 group-hover/carrossel:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
        aria-label={`Rolar produtos de ${tituloSecao || "carrossel"} para a esquerda`}
      >
        <ChevronLeft className="h-6 w-6 2xl:h-7 2xl:w-7" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => rolar("direita")}
        className="absolute -right-5 2xl:-right-7 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-12 w-12 2xl:h-14 2xl:w-14 items-center justify-center rounded-2xl bg-white/90 text-stone-800 border border-white/60 shadow-lg backdrop-blur-md hover:bg-[#673ab7] hover:text-white transition-all active:scale-95 opacity-90 md:opacity-0 group-hover/carrossel:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
        aria-label={`Rolar produtos de ${tituloSecao || "carrossel"} para a direita`}
      >
        <ChevronRight className="h-6 w-6 2xl:h-7 2xl:w-7" aria-hidden="true" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-6 2xl:gap-8 overflow-x-auto scroll-smooth py-3 px-1 snap-x snap-mandatory w-full"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {produtos.map((produto) => (
          <div key={produto.id} className="w-[260px] sm:w-[280px] lg:w-[300px] xl:w-[320px] 2xl:w-[340px] 3xl:w-[360px] flex-none snap-start">
            <CardProduto
              produto={produto}
              admin={ehAdmin}
              onAlterarExibicao={handleAlterarExibicaoAdmin}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ehAdmin, setEhAdmin] = useState(false)

  const fotosLoja = [
    "/principal.jpg",
    "/loja-2.jpg",
    "/loja-3.jpg",
  ]

  useEffect(() => {
    async function carregarDados() {
      try {
        const resProdutos = await fetch("/api/produtos")
        if (resProdutos.ok) {
          const data = await resProdutos.json()
          setProdutos(data.produtos || data)
        }

        const resPerfil = await fetch("/api/cliente/perfil")
        if (resPerfil.ok) {
          const perfil = await resPerfil.json()
          const usuario = perfil.cliente || perfil.user || perfil
          if (usuario?.role === "ADMIN" || usuario?.role === "admin" || usuario?.ehAdmin) {
            setEhAdmin(true)
          }
        }
      } catch (e) {
        console.error("Erro ao carregar dados da Home:", e)
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [])

  const handleAlterarExibicaoAdmin = async (id: string | number, localOuVisivel: string | boolean) => {
    const novoLocal = typeof localOuVisivel === "boolean" 
      ? (localOuVisivel ? "HOME_DESTAQUE" : "CATALOGO_APENAS")
      : localOuVisivel

    setProdutos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, localCard: novoLocal } : p))
    )

    try {
      await fetch(`/api/admin/produtos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localCard: novoLocal }),
      })
    } catch (error) {
      console.error("Erro ao salvar localização do produto:", error)
    }
  }

  const produtosDestaque = produtos.filter(p => (p.ativo !== false) && p.localCard === "HOME_DESTAQUE")
  const produtosNovidades = produtos.filter(p => (p.ativo !== false) && p.localCard === "HOME_NOVIDADES")
  const produtosPromocoes = produtos.filter(p => (p.ativo !== false) && p.localCard === "HOME_PROMOCOES")

  const produtosSemLocalOuOutros = produtos.filter(
    p => !["HOME_DESTAQUE", "HOME_NOVIDADES", "HOME_PROMOCOES"].includes(p.localCard || "")
  )

  const temProdutosNaHome = 
    produtosDestaque.length > 0 || 
    produtosNovidades.length > 0 || 
    produtosPromocoes.length > 0

  return (
    <main className="min-h-screen bg-stone-50/70 text-stone-800 relative overflow-hidden font-sans w-full">
      <div className="absolute top-10 left-[-8%] w-[600px] 2xl:w-[800px] h-[600px] 2xl:h-[800px] bg-[#81d4fa]/20 rounded-full blur-[140px] pointer-events-none" aria-hidden="true" />
      <div className="absolute top-1/3 right-[-8%] w-[600px] 2xl:w-[800px] h-[600px] 2xl:h-[800px] bg-[#b39ddb]/20 rounded-full blur-[140px] pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-1/4 left-1/4 w-[500px] 2xl:w-[700px] h-[500px] 2xl:h-[700px] bg-[#f48fb1]/15 rounded-full blur-[140px] pointer-events-none" aria-hidden="true" />

      {/* Faixa Multicolorida Decorativa */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#81d4fa] via-[#b39ddb] via-[#f48fb1] to-[#ffd54f]" aria-hidden="true" />

      {/* 1. BANNER PRINCIPAL (HERO FULL-WIDTH) */}
      <HeroFullWidth imagens={fotosLoja} />

      {/* 2. BARRA DE BENEFÍCIOS */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full bg-white/90 border-b border-[#b39ddb]/20 py-10 2xl:py-14 relative z-10 shadow-2xs backdrop-blur-xs"
        aria-label="Vantagens de comprar conosco"
      >
        <div className="w-full max-w-[1920px] 3xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 grid grid-cols-1 sm:grid-cols-3 gap-6 2xl:gap-8 text-center">
          <div className="flex flex-col items-center gap-3 p-6 2xl:p-8 bg-gradient-to-b from-[#81d4fa]/10 to-white rounded-3xl border border-[#81d4fa]/20 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="p-3.5 2xl:p-4 rounded-2xl bg-[#81d4fa]/15 text-[#0284c7] shadow-2xs border border-[#81d4fa]/30">
              <Truck className="h-6 w-6 2xl:h-8 2xl:w-8" aria-hidden="true" />
            </div>
            <h3 className="font-extrabold text-base 2xl:text-lg text-stone-800">Entrega & Atendimento</h3>
            <p className="text-xs sm:text-sm text-stone-600 font-medium leading-relaxed">Compre online e receba suas roupinhas com toda a comodidade</p>
          </div>

          <div className="flex flex-col items-center gap-3 p-6 2xl:p-8 bg-gradient-to-b from-[#b39ddb]/10 to-white rounded-3xl border border-[#b39ddb]/20 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="p-3.5 2xl:p-4 rounded-2xl bg-[#b39ddb]/15 text-[#673ab7] shadow-2xs border border-[#b39ddb]/30">
              <HeartHandshake className="h-6 w-6 2xl:h-8 2xl:w-8" aria-hidden="true" />
            </div>
            <h3 className="font-extrabold text-base 2xl:text-lg text-stone-800">Qualidade Garantida</h3>
            <p className="text-xs sm:text-sm text-stone-600 font-medium leading-relaxed">Tecidos macios e resistentes para acompanhar toda energia dos pequenos</p>
          </div>

          <div className="flex flex-col items-center gap-3 p-6 2xl:p-8 bg-gradient-to-b from-[#f48fb1]/10 to-white rounded-3xl border border-[#f48fb1]/20 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="p-3.5 2xl:p-4 rounded-2xl bg-[#f48fb1]/15 text-[#c2185b] shadow-2xs border border-[#f48fb1]/30">
              <ShieldCheck className="h-6 w-6 2xl:h-8 2xl:w-8" aria-hidden="true" />
            </div>
            <h3 className="font-extrabold text-base 2xl:text-lg text-stone-800">Troca Fácil & Sem Descomplicação</h3>
            <p className="text-xs sm:text-sm text-stone-600 font-medium leading-relaxed">Suporte atencioso para você acertar sempre no caimento ideal</p>
          </div>
        </div>
      </motion.section>

      {/* 3. SEÇÃO PRESENTE POR IDADE */}
      <PresentePorIdade faixas={faixasIdade} />

      {/* 4. VITRINES EM CARROSSEL HORIZONTAL */}
      <section className="w-full max-w-[1920px] 3xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-12 2xl:py-16 relative z-10 space-y-16 2xl:space-y-20" aria-label="Vitrines de produtos">
        {carregando ? (
          <div className="flex h-48 items-center justify-center" aria-label="Carregando produtos">
            <Loader2 className="h-8 w-8 animate-spin text-[#673ab7]" aria-hidden="true" />
          </div>
        ) : !temProdutosNaHome && !ehAdmin ? (
          /* Estado Vazio Padronizado com o Catálogo */
          <div className="text-center py-20 bg-white/80 rounded-3xl border border-[#b39ddb]/20 p-8 shadow-xs max-w-xl 2xl:max-w-2xl mx-auto my-8 space-y-4">
            <div className="inline-flex p-4 rounded-3xl bg-[#b39ddb]/10 text-[#673ab7] mb-2 border border-[#b39ddb]/20 shadow-2xs">
              <PackageOpen className="h-10 w-10 2xl:h-12 2xl:w-12 stroke-[1.5]" aria-hidden="true" />
            </div>
            <h2 className="text-xl 2xl:text-2xl font-bold text-stone-800 tracking-tight">
              Nenhum produto em destaque no momento
            </h2>
            <p className="text-sm 2xl:text-base text-stone-600 max-w-md mx-auto leading-relaxed">
              Estamos preparando novidades incríveis para você. Enquanto isso, confira todas as nossas opções disponíveis no catálogo completo!
            </p>
            <div className="pt-2">
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-2 bg-[#673ab7] hover:bg-[#7e57c2] text-white font-bold px-6 py-3 2xl:px-8 2xl:py-4 rounded-2xl text-sm 2xl:text-base transition-all shadow-md active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]"
              >
                Ver Todo o Catálogo
                <ArrowRight className="h-4 w-4 2xl:h-5 2xl:w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* SEÇÃO 1: DESTAQUES DA SEMANA */}
            {produtosDestaque.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full"
              >
                <div className="flex items-center justify-between mb-6 2xl:mb-8">
                  <div>
                    <span className="text-xs 2xl:text-sm font-black uppercase tracking-wider text-[#673ab7] bg-[#b39ddb]/15 px-3.5 py-1.5 rounded-full border border-[#b39ddb]/30">
                      Os Queridinhos
                    </span>
                    <h2 className="text-3xl 2xl:text-4xl font-black text-stone-800 mt-2 tracking-tight">Destaques da Semana</h2>
                  </div>
                  <Link href="/catalogo" className="text-sm 2xl:text-base font-extrabold text-[#673ab7] hover:text-[#7e57c2] transition-colors flex items-center gap-1.5 bg-[#b39ddb]/10 px-4 py-2 2xl:px-5 2xl:py-2.5 rounded-2xl border border-[#b39ddb]/20 focus:outline-hidden focus:ring-2 focus:ring-[#673ab7]">
                    Ver tudo <ArrowRight className="h-4 w-4 2xl:h-5 2xl:w-5" aria-hidden="true" />
                  </Link>
                </div>

                <CarrosselProdutos
                  produtos={produtosDestaque}
                  ehAdmin={ehAdmin}
                  handleAlterarExibicaoAdmin={handleAlterarExibicaoAdmin}
                  tituloSecao="Destaques da Semana"
                />
              </motion.div>
            )}

            {/* SEÇÃO 2: NOVIDADES / LANÇAMENTOS */}
            {produtosNovidades.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full"
              >
                <div className="flex items-center justify-between mb-6 2xl:mb-8">
                  <div>
                    <span className="text-xs 2xl:text-sm font-black uppercase tracking-wider text-[#0284c7] bg-[#81d4fa]/15 px-3.5 py-1.5 rounded-full border border-[#81d4fa]/30">
                      Acabaram de Chegar
                    </span>
                    <h2 className="text-3xl 2xl:text-4xl font-black text-stone-800 mt-2 tracking-tight">Novidades & Lançamentos</h2>
                  </div>
                </div>

                <CarrosselProdutos
                  produtos={produtosNovidades}
                  ehAdmin={ehAdmin}
                  handleAlterarExibicaoAdmin={handleAlterarExibicaoAdmin}
                  tituloSecao="Novidades"
                />
              </motion.div>
            )}

            {/* SEÇÃO 3: PROMOÇÕES */}
            {produtosPromocoes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 2xl:mb-8">
                  <div>
                    <span className="text-xs 2xl:text-sm font-black uppercase tracking-wider text-amber-900 bg-[#ffd54f]/20 px-3.5 py-1.5 rounded-full border border-[#ffd54f]/40">
                      Ofertas Imperdíveis
                    </span>
                    <h2 className="text-3xl 2xl:text-4xl font-black text-stone-800 mt-2 tracking-tight">Promoções do Mês</h2>
                  </div>
                  
                  <TimerFimDoMes />
                </div>

                <CarrosselProdutos
                  produtos={produtosPromocoes}
                  ehAdmin={ehAdmin}
                  handleAlterarExibicaoAdmin={handleAlterarExibicaoAdmin}
                  tituloSecao="Promoções"
                />
              </motion.div>
            )}

            {/* VISÃO DO ADMIN */}
            {ehAdmin && produtosSemLocalOuOutros.length > 0 && (
              <div className="mt-16 p-6 2xl:p-8 bg-white/90 backdrop-blur-xs rounded-3xl border border-stone-200 shadow-2xs w-full">
                <div className="mb-6">
                  <span className="text-xs 2xl:text-sm font-black uppercase tracking-wider text-stone-700 bg-stone-100 px-3.5 py-1.5 rounded-full border border-stone-200">
                    Painel do Administrador
                  </span>
                  <h3 className="text-xl 2xl:text-2xl font-bold text-stone-800 mt-2">Produtos no Catálogo (Sem Destaque na Home)</h3>
                </div>

                <CarrosselProdutos
                  produtos={produtosSemLocalOuOutros}
                  ehAdmin={ehAdmin}
                  handleAlterarExibicaoAdmin={handleAlterarExibicaoAdmin}
                  tituloSecao="Catálogo Geral (Admin)"
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* 5. CALL TO ACTION */}
      <motion.section
        initial={{ opacity: 0, y: 35 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-[1920px] 3xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 pb-20 2xl:pb-28 text-center relative z-10"
        aria-label="Chamada para ação do catálogo"
      >
        <div className="bg-gradient-to-r from-[#81d4fa]/15 via-[#b39ddb]/15 to-[#f48fb1]/15 text-stone-800 rounded-3xl p-8 md:p-14 2xl:p-20 shadow-xl border border-[#b39ddb]/25 max-w-5xl 2xl:max-w-6xl mx-auto space-y-6 2xl:space-y-8 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-[#b39ddb]/20 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-[#f48fb1]/20 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
          
          <div className="inline-flex items-center gap-1.5 bg-white/90 px-4 py-1.5 rounded-full border border-[#b39ddb]/30 text-xs 2xl:text-sm font-extrabold text-[#673ab7] shadow-2xs">
            <Heart className="h-3.5 w-3.5 2xl:h-4 2xl:w-4 fill-[#673ab7] text-[#673ab7]" aria-hidden="true" /> Procurando algo em específico?
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-5xl 2xl:text-6xl font-black tracking-tight leading-tight text-stone-800">
            Encontre o tamanho e estilo perfeito para cada ocasião
          </h2>
          <p className="text-stone-600 text-sm sm:text-base lg:text-lg 2xl:text-xl max-w-2xl 2xl:max-w-3xl mx-auto leading-relaxed font-medium">
            Filtre por categoria, tamanho, idade ou faixa de preço direto no nosso catálogo completo!
          </p>
          <div className="pt-2">
            <Link 
              href="/catalogo" 
              className="inline-flex items-center gap-3 bg-gradient-to-r from-[#673ab7] via-[#7e57c2] to-[#0284c7] hover:opacity-95 text-white font-bold px-8 py-4 2xl:px-10 2xl:py-5 rounded-2xl transition-all text-sm sm:text-base 2xl:text-lg shadow-lg shadow-[#673ab7]/25 active:scale-95 transform hover:-translate-y-0.5 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#673ab7]"
            >
              Acessar Catálogo Completo <ArrowRight className="h-5 w-5 2xl:h-6 2xl:w-6" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </motion.section>
    </main>
  )
}
