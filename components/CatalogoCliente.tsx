"use client"

import { useMemo, useState } from "react"
import type { Genero, Produto } from "@/lib/produtos"
import CartaoProduto from "@/components/CartaoProduto"

type FiltroGenero = Genero | "todos"

const generosLabel: { valor: FiltroGenero; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "feminino", label: "Feminino" },
  { valor: "masculino", label: "Masculino" },
  { valor: "unissex", label: "Unissex" },
]

export default function CatalogoCliente({ produtos }: { produtos: Produto[] }) {
  const [genero, setGenero] = useState<FiltroGenero>("todos")
  const [tamanho, setTamanho] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string | null>(null)

  const tamanhosDisponiveis = useMemo(
    () => Array.from(new Set(produtos.flatMap((p) => p.tamanhos))).sort((a, b) => Number(a) - Number(b)),
    [produtos],
  )
  const categoriasDisponiveis = useMemo(
    () => Array.from(new Set(produtos.map((p) => p.categoria))).sort(),
    [produtos],
  )

  const filtrados = useMemo(
    () =>
      produtos.filter((p) => {
        if (genero !== "todos" && p.genero !== genero) return false
        if (tamanho && !p.tamanhos.includes(tamanho)) return false
        if (categoria && p.categoria !== categoria) return false
        return true
      }),
    [produtos, genero, tamanho, categoria],
  )

  const limpar = () => {
    setGenero("todos")
    setTamanho(null)
    setCategoria(null)
  }

  const temFiltro = genero !== "todos" || tamanho !== null || categoria !== null

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <div className="rounded-3xl border-2 border-ink/10 bg-white p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Filtros</h2>
            {temFiltro && (
              <button
                type="button"
                onClick={limpar}
                className="font-body text-xs font-semibold uppercase tracking-wide text-berry hover:underline"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Gênero */}
          <fieldset className="mt-6">
            <legend className="font-body text-xs font-bold uppercase tracking-[0.15em] text-sky">
              Categoria de gênero
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {generosLabel.map((g) => {
                const ativo = genero === g.valor
                return (
                  <button
                    key={g.valor}
                    type="button"
                    onClick={() => setGenero(g.valor)}
                    aria-pressed={ativo}
                    className={`rounded-full border-2 px-4 py-1.5 font-body text-sm font-semibold transition-colors ${
                      ativo ? "border-berry bg-berry text-cream" : "border-ink/15 text-ink hover:border-berry"
                    }`}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Tamanho */}
          <fieldset className="mt-6">
            <legend className="font-body text-xs font-bold uppercase tracking-[0.15em] text-sky">
              Tamanho (anos)
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {tamanhosDisponiveis.map((t) => {
                const ativo = tamanho === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTamanho(ativo ? null : t)}
                    aria-pressed={ativo}
                    className={`flex h-9 min-w-9 items-center justify-center rounded-full border-2 px-3 font-body text-sm font-bold transition-colors ${
                      ativo ? "border-berry bg-berry text-cream" : "border-ink/15 text-ink hover:border-berry"
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Categoria */}
          <fieldset className="mt-6">
            <legend className="font-body text-xs font-bold uppercase tracking-[0.15em] text-sky">
              Tipo de peça
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoriasDisponiveis.map((c) => {
                const ativo = categoria === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoria(ativo ? null : c)}
                    aria-pressed={ativo}
                    className={`rounded-full border-2 px-4 py-1.5 font-body text-sm font-semibold transition-colors ${
                      ativo ? "border-berry bg-berry text-cream" : "border-ink/15 text-ink hover:border-berry"
                    }`}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>
      </aside>

      <div className="flex-1">
        <p className="mb-6 font-body text-sm font-semibold text-ink/60">
          {filtrados.length} {filtrados.length === 1 ? "peça encontrada" : "peças encontradas"}
        </p>
        {filtrados.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((produto) => (
              <CartaoProduto key={produto.slug} produto={produto} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-ink/15 bg-white p-12 text-center">
            <p className="font-display text-lg font-semibold text-ink">Nenhuma peça encontrada</p>
            <p className="mt-2 font-body text-sm text-ink/60">
              Tente ajustar os filtros para ver mais roupinhas.
            </p>
            <button
              type="button"
              onClick={limpar}
              className="mt-5 rounded-full bg-berry px-6 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-cream transition-transform hover:scale-105"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
