"use client"

import Link from "next/link"
import { ShoppingBag, Package, PlusCircle, ArrowUpRight } from "lucide-react"

export default function PaginaDashboardAdmin() {
  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Bem-vindo ao Painel Administrativo! 👋
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Gerencie suas peças de vestuário, acompanhe os pedidos e atualize os envios da loja.
        </p>
      </div>

      {/* CARDS DE RESUMO RÁPIDO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-semibold">Total de Roupas</span>
            <ShoppingBag className="h-5 w-5 text-berry" />
          </div>
          <div>
            <span className="text-3xl font-bold text-white">Catálogo</span>
            <p className="text-[11px] text-zinc-500 mt-1">Gerencie peças e estoque</p>
          </div>
          <Link
            href="/admin/produtos"
            className="inline-flex items-center gap-1 text-xs font-bold text-berry hover:underline pt-2"
          >
            Ver Roupas Cadastradas <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-semibold">Envios & Pedidos</span>
            <Package className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-3xl font-bold text-white">Pedidos</span>
            <p className="text-[11px] text-zinc-500 mt-1">Acompanhe vendas e entegar</p>
          </div>
          <Link
            href="/admin/pedidos"
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline pt-2"
          >
            Conferir Entregas <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center text-zinc-400">
            <span className="text-xs font-semibold">Ação Rápida</span>
            <PlusCircle className="h-5 w-5 text-berry" />
          </div>
          <p className="text-xs text-zinc-300">
            Adicione um novo produto ou coleção ao catálogo da loja em poucos cliques.
          </p>
          <Link
            href="/admin/produtos/novo"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-berry py-2.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
          >
            <PlusCircle className="h-4 w-4" /> Cadastrar Nova Roupa
          </Link>
        </div>
      </div>
    </div>
  )
}