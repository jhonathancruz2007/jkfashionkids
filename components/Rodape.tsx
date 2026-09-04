"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Heart, Sparkles } from "lucide-react"

const redes = [
  {
    nome: "Instagram",
    href: "https://instagram.com/jkfashion_kids?igsh=aHRvc2pzOXY2d2Zn",
    bgClass:
      "bg-[#f48fb1]/15 text-[#e91e63] border-[#f48fb1]/40 hover:bg-gradient-to-tr hover:from-amber-400 hover:via-[#f48fb1] hover:to-[#b39ddb] hover:text-white hover:border-transparent hover:shadow-lg hover:shadow-[#f48fb1]/30",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    nome: "Facebook",
    href: "https://facebook.com",
    bgClass:
      "bg-[#81d4fa]/15 text-[#0284c7] border-[#81d4fa]/40 hover:bg-[#1877f2] hover:text-white hover:border-[#1877f2] hover:shadow-lg hover:shadow-[#81d4fa]/30",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8.2V14h2.5v7h2.8z" />
      </svg>
    ),
  },
  {
    nome: "TikTok",
    href: "https://tiktok.com",
    bgClass:
      "bg-[#b39ddb]/15 text-[#673ab7] border-[#b39ddb]/40 hover:bg-slate-900 hover:text-white hover:border-slate-900 hover:shadow-lg hover:shadow-[#b39ddb]/30",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.5c-1.3 0-2.5-.4-3.5-1.1v5.9a5.2 5.2 0 1 1-5.2-5.2c.3 0 .6 0 .9.1v2.6a2.6 2.6 0 1 0 1.8 2.5V3h2.5z" />
      </svg>
    ),
  },
  {
    nome: "WhatsApp",
    href: "https://wa.me/551933010493?text=Olá!%20Gostaria%20de%20tirar%20dúvidas%20sobre%20os%20produtos.",
    bgClass:
      "bg-emerald-100/60 text-emerald-700 border-emerald-300 hover:bg-[#25d366] hover:text-white hover:border-[#25d366] hover:shadow-lg hover:shadow-emerald-300/40",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zm0 2a7 7 0 0 1 5.9 10.8l-.3.5.6 2.1-2.2-.6-.5.3A7 7 0 1 1 12 5zm-2.3 3.2c-.2 0-.5 0-.7.4-.2.4-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.7 2.7 4.2 3.6 2 .7 2.4.6 2.9.6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.2l-.6-.3-1.4-.7c-.2-.1-.4-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1-.6-.3-1.3-.5-2-1.4-.5-.6-.9-1.3-1-1.5-.1-.2 0-.4.1-.5l.4-.4c.1-.2.2-.3.3-.5v-.5c0-.2-.5-1.3-.7-1.8-.2-.4-.4-.4-.5-.4h-.5z" />
      </svg>
    ),
  },
]

export default function Rodape() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative bg-stone-100/90 backdrop-blur-md font-sans text-stone-700 border-t border-[#f48fb1]/30 shadow-[0_-12px_30px_-8px_rgba(0,0,0,0.04)] overflow-hidden w-full"
    >
      {/* Faixa Multicolorida do Topo */}
      <div className="h-2 w-full bg-gradient-to-r from-[#81d4fa] via-[#b39ddb] via-[#f48fb1] via-[#ff8a65] to-[#ffd54f]" />

      {/* Luzes Suaves de Fundo */}
      <div className="absolute top-0 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-[#f48fb1]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-[#81d4fa]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Conteúdo Principal do Rodapé com Alinhamento Geral */}
      <div className="relative z-10 mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-10 sm:pt-14 pb-8 sm:pb-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-8 sm:gap-10">
        
        {/* Marca & Descrição */}
        <div className="sm:col-span-2 md:col-span-5 space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#f48fb1]/30 shadow-2xs text-xs font-black text-[#e91e63]">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 fill-amber-500 animate-pulse" />
            Moda Infantil Divertida & Confortável
          </div>
          
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 
              className="text-2xl sm:text-3xl font-black tracking-tight text-stone-800 flex items-center select-none"
              style={{
                WebkitTextStroke: "1px #292524",
                paintOrder: "stroke fill",
              }}
            >
              <span className="text-[#81d4fa]">J</span>
              <span className="text-[#f48fb1]">K</span>
              <span className="w-1.5"></span>
              <span className="text-[#ff8a65]">F</span>
              <span className="text-[#ce93d8]">a</span>
              <span className="text-[#a5d6a7]">s</span>
              <span className="text-[#f06292]">h</span>
              <span className="text-[#4fc3f7]">i</span>
              <span className="text-[#ffd54f]">o</span>
              <span className="text-[#b39ddb]">n</span>
            </h2>

            <div className="inline-flex items-center gap-1 rounded-full border border-[#f48fb1]/40 bg-[#f48fb1]/15 px-2.5 py-0.5 shadow-2xs">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#e91e63]">
                Kids
              </span>
              <Sparkles className="h-3 w-3 text-amber-500 fill-amber-500 animate-pulse" />
            </div>
          </div>
          
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-medium max-w-sm">
            Roupinhas cheias de cor, energia e carinho para os pequenos aproveitarem cada momento com total conforto e liberdade!
          </p>
        </div>

        {/* Links de Navegação */}
        <div className="sm:col-span-1 md:col-span-3 space-y-3">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-stone-800 border-b-2 border-[#f48fb1] inline-block pb-1">
            Navegação
          </h3>
          <ul className="space-y-2 text-xs sm:text-sm font-semibold">
            <li>
              <Link 
                href="/" 
                className="inline-flex items-center gap-2 text-stone-600 hover:text-[#e91e63] transition-colors group"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#f48fb1] group-hover:scale-150 transition-transform" />
                Página Inicial
              </Link>
            </li>
            <li>
              <Link 
                href="/catalogo" 
                className="inline-flex items-center gap-2 text-stone-600 hover:text-[#0284c7] transition-colors group"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#81d4fa] group-hover:scale-150 transition-transform" />
                Catálogo de Produtos
              </Link>
            </li>
            <li>
              <Link 
                href="/catalogo?categoria=feminino" 
                className="inline-flex items-center gap-2 text-stone-600 hover:text-[#f48fb1] transition-colors group"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#f48fb1] group-hover:scale-150 transition-transform" />
                Feminino
              </Link>
            </li>
            <li>
              <Link 
                href="/catalogo?categoria=masculino" 
                className="inline-flex items-center gap-2 text-stone-600 hover:text-[#81d4fa] transition-colors group"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#81d4fa] group-hover:scale-150 transition-transform" />
                Masculino
              </Link>
            </li>
          </ul>
        </div>

        {/* Redes Sociais & Contato */}
        <div className="sm:col-span-1 md:col-span-4 space-y-3">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-stone-800 border-b-2 border-[#81d4fa] inline-block pb-1">
            Redes & Contato
          </h3>
          <p className="text-xs font-medium text-stone-600">
            Acompanhe nossas novidades diárias e lançamentos exclusivos:
          </p>
          <ul className="flex flex-wrap gap-2.5 sm:gap-3 pt-1">
            {redes.map((rede) => (
              <li key={rede.nome}>
                <a
                  href={rede.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={rede.nome}
                  className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border shadow-2xs transition-all duration-300 transform hover:-translate-y-1 active:scale-95 ${rede.bgClass}`}
                >
                  {rede.icon}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Barra de Direitos Autorais */}
      <div className="relative z-10 border-t border-stone-300/60 bg-stone-200/50 py-3.5 sm:py-4 text-center text-[11px] sm:text-xs font-bold text-stone-600 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 px-4 shadow-inner">
        <span>© {new Date().getFullYear()} JK Fashion Kids. Feito com</span>
        <Heart className="h-3.5 w-3.5 text-[#e91e63] fill-[#e91e63] animate-pulse shrink-0" />
        <span>para os pequenos.</span>
      </div>
    </motion.footer>
  )
}
