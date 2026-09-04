"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { CardProduto, Produto } from "@/components/CartaoProduto"
import { ShoppingBag, Loader2, Search, SlidersHorizontal, X, RotateCcw, ChevronDown, Gift, Check } from "lucide-react"

const ITENS_POR_PAGINA = 24 // Aumentado ligeiramente para preencher melhor grades maiores

const FAIXAS_IDADE = [
  { id: "todos", label: "Todas", query: "todos", activeColor: "bg-slate-900 border-slate-900 text-white shadow-slate-200" },
  { id: "0-1", label: "até 1 ano", query: "0-1", aliases: ["ate-1-ano", "0-1", "0 a 1", "bebe", "bebê"], activeColor: "bg-sky-500 border-sky-500 text-white shadow-sky-200" },
  { id: "1-2", label: "1 a 2 anos", query: "1-2", aliases: ["1-a-2-anos", "1-2", "1 a 2"], activeColor: "bg-emerald-500 border-emerald-500 text-white shadow-emerald-200" },
  { id: "3-5", label: "3 a 5 anos", query: "3-5", aliases: ["3-a-5-anos", "3-5", "3 a 5"], activeColor: "bg-amber-500 border-amber-500 text-white shadow-amber-200" },
  { id: "6-8", label: "6 a 8 anos", query: "6-8", aliases: ["6-a-8-anos", "6-8", "6 a 8"], activeColor: "bg-pink-500 border-pink-500 text-white shadow-pink-200" },
  { id: "9-plus", label: "+9 anos", query: "9-plus", aliases: ["mais-9-anos", "9-plus", "9+", "9 anos"], activeColor: "bg-purple-500 border-purple-500 text-white shadow-purple-200" },
]

const TAMANHOS_VALIDOS = [
  "RN", "PP", "P", "M", "G", "GG",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"
]

const MAPA_PADRAO_SLUGS: Record<string, string> = {
  CONJUNTOS: "Conjuntos",
  CONJUNTO: "Conjuntos",
  VESTIDOS: "Vestidos",
  VESTIDO: "Vestidos",
  BLUSAS: "Blusas e Camisetas",
  CAMISETAS: "Blusas e Camisetas",
  BLUSAS_CAMISETAS: "Blusas e Camisetas",
  CALCAS_SHORTS: "Calças e Shorts",
  CALCAS: "Calças e Shorts",
  SHORTS: "Calças e Shorts",
  BERMUDAS: "Calças e Shorts",
  CALCADOS: "Calçados",
  ACESSORIOS: "Acessórios",
}

function normalizarTexto(str: string): string {
  if (!str) return ""
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function ehUUID(str: string): boolean {
  if (!str || typeof str !== "string") return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const mongoRegex = /^[0-9a-f]{24}$/i
  return uuidRegex.test(str.trim()) || mongoRegex.test(str.trim())
}

function padronizarNomeCategoria(valor: string): string {
  if (!valor) return ""
  const chaveUpper = valor.toUpperCase().replace(/\s+/g, "_")
  if (MAPA_PADRAO_SLUGS[chaveUpper]) {
    return MAPA_PADRAO_SLUGS[chaveUpper]
  }
  return valor
}

function extrairTexto(val: any): string {
  if (!val) return ""
  if (typeof val === "string") return val.trim()
  if (typeof val === "number") return String(val)
  if (typeof val === "object" && val !== null) {
    const possiveisValores = [val.nome, val.name, val.titulo, val.title, val.label, val.slug]
    for (const item of possiveisValores) {
      if (item && typeof item === "string") return item.trim()
    }
  }
  return ""
}

function extrairListaTextos(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) {
    return val.flatMap((item) => extrairListaTextos(item)).filter(Boolean)
  }
  if (typeof val === "string" && val.includes(",")) {
    return val.split(",").map((item) => item.trim()).filter(Boolean)
  }
  const texto = extrairTexto(val)
  return texto ? [texto] : []
}

function extrairCategoriasDoProduto(prod: any, mapaIdParaNome: Record<string, string> = {}): string[] {
  if (!prod || typeof prod !== "object") return []
  const categorias = new Set<string>()

  const tentarAdicionar = (valorBruto: any) => {
    if (!valorBruto) return

    if (typeof valorBruto === "object") {
      const nomeDoObj = extrairTexto(valorBruto)
      if (nomeDoObj && !ehUUID(nomeDoObj)) {
        categorias.add(padronizarNomeCategoria(nomeDoObj))
      }
      const idDoObj = String(valorBruto.id || valorBruto._id || "").trim()
      if (idDoObj && mapaIdParaNome[idDoObj]) {
        categorias.add(padronizarNomeCategoria(mapaIdParaNome[idDoObj]))
      }
      return
    }

    const strVal = String(valorBruto).trim()
    if (!strVal) return

    if (ehUUID(strVal)) {
      if (mapaIdParaNome[strVal]) {
        categorias.add(padronizarNomeCategoria(mapaIdParaNome[strVal]))
      }
      return
    }

    categorias.add(padronizarNomeCategoria(strVal))
  }

  const campos = [
    prod.categoria,
    prod.categorias,
    prod.categoriaId,
    prod.categoria_id,
    prod.categoriaNome,
    prod.category,
    prod.slugCategoria
  ]

  campos.forEach(tentarAdicionar)

  return Array.from(categorias)
}

function CatalogoConteudo() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [mapaIdParaNome, setMapaIdParaNome] = useState<Record<string, string>>({})
  const [listaCategoriasApi, setListaCategoriasApi] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState("relevancia")
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("todos")
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState("todos")
  const [generoSelecionado, setGeneroSelecionado] = useState("todos")
  const [idadeSelecionada, setIdadeSelecionada] = useState("todos")
  const [filtroMobileAberto, setFiltroMobileAberto] = useState(false)
  const [categoriasAberto, setCategoriasAberto] = useState(false)
  const [tamanhosAberto, setTamanhosAberto] = useState(false)

  const [paginaAtual, setPaginaAtual] = useState(1)

  useEffect(() => {
    const categoriaParam = searchParams.get("categoria")
    if (categoriaParam) {
      const valor = categoriaParam.toLowerCase()
      if (valor === "feminino" || valor === "masculino") {
        setGeneroSelecionado(valor)
      } else {
        setCategoriaSelecionada(padronizarNomeCategoria(categoriaParam))
      }
    }

    const idadeParam = searchParams.get("idade")
    if (idadeParam) setIdadeSelecionada(idadeParam)
  }, [searchParams])

  useEffect(() => {
    async function carregarDados() {
      try {
        const mapaTemp: Record<string, string> = {}
        const nomesDaApi: string[] = []

        const resCat = await fetch("/api/categorias").catch(() => null) || await fetch("/api/admin/categorias").catch(() => null)
        if (resCat && resCat.ok) {
          const dataCat = await resCat.json()
          const lista = Array.isArray(dataCat) ? dataCat : dataCat.categorias || dataCat.data || []
          
          lista.forEach((c: any) => {
            const id = String(c.id || c._id || "").trim()
            const nome = extrairTexto(c)
            if (nome && !ehUUID(nome)) {
              const nomePadrao = padronizarNomeCategoria(nome)
              nomesDaApi.push(nomePadrao)
              if (id) mapaTemp[id] = nomePadrao
            }
          })
        }

        setMapaIdParaNome(mapaTemp)
        setListaCategoriasApi(nomesDaApi)

        const resProd = await fetch("/api/produtos").catch(() => null)
        if (resProd && resProd.ok) {
          const dataProd = await resProd.json()
          const listaProd = Array.isArray(dataProd) ? dataProd : dataProd.produtos || dataProd.data || []
          setProdutos(listaProd)
        }
      } catch (e) {
        console.error("Erro ao carregar dados do catálogo:", e)
      } finally {
        setCarregando(false)
      }
    }
    carregarDados()
  }, [])

  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, categoriaSelecionada, tamanhoSelecionado, generoSelecionado, idadeSelecionada, ordenacao])

  const alterarFiltroIdade = (novaIdade: string) => {
    setIdadeSelecionada(novaIdade)
    const params = new URLSearchParams(searchParams.toString())
    if (novaIdade && novaIdade !== "todos") params.set("idade", novaIdade)
    else params.delete("idade")
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const alterarFiltroGenero = (novoGenero: string) => {
    setGeneroSelecionado(novoGenero)
    const params = new URLSearchParams(searchParams.toString())
    if (novoGenero && novoGenero !== "todos") params.set("categoria", novoGenero)
    else params.delete("categoria")
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const categoriasDisponiveis = useMemo(() => {
    const categoriasDosProdutos = produtos.flatMap((p) => extrairCategoriasDoProduto(p, mapaIdParaNome))
    const todasExistentes = [...categoriasDosProdutos, ...listaCategoriasApi]
    
    const unicas = Array.from(new Set(todasExistentes))
      .filter((c) => c && !ehUUID(c))
      .map((c) => padronizarNomeCategoria(c))

    return Array.from(new Set(unicas)).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
  }, [produtos, mapaIdParaNome, listaCategoriasApi])

  const tamanhosDisponiveis = useMemo(() => {
    const extraidos = Array.from(
      new Set(produtos.flatMap((p) => extrairListaTextos((p as any).tamanhos || (p as any).tamanho)))
    )

    return extraidos
      .map((t) => t.trim().toUpperCase())
      .filter((t) => TAMANHOS_VALIDOS.includes(t))
      .sort((a, b) => TAMANHOS_VALIDOS.indexOf(a) - TAMANHOS_VALIDOS.indexOf(b))
  }, [produtos])

  const produtosFiltrados = useMemo(() => {
    return produtos.filter((produto) => {
      const nomeNorm = normalizarTexto(extrairTexto(produto.nome))
      const descNorm = normalizarTexto(extrairTexto((produto as any).descricao))
      const buscaNorm = normalizarTexto(busca)
      const matchBusca = !buscaNorm || nomeNorm.includes(buscaNorm) || descNorm.includes(buscaNorm)

      let matchCategoria = true
      if (categoriaSelecionada && categoriaSelecionada !== "todos") {
        const catSelecionadaNorm = normalizarTexto(categoriaSelecionada)
        const catsProduto = extrairCategoriasDoProduto(produto, mapaIdParaNome)

        matchCategoria = catsProduto.some((catProd) => {
          const catProdNorm = normalizarTexto(catProd)
          if (catProdNorm === catSelecionadaNorm) return true
          
          const palavrasSel = catSelecionadaNorm.split(/\s+/).filter((p) => p.length > 2)
          const palavrasProd = catProdNorm.split(/\s+/).filter((p) => p.length > 2)
          return palavrasSel.some((p) => palavrasProd.includes(p))
        })
      }

      const listaTamanhosProd = extrairListaTextos((produto as any).tamanhos || (produto as any).tamanho).map((t) => t.toUpperCase())
      const matchTamanho = tamanhoSelecionado === "todos" || listaTamanhosProd.includes(tamanhoSelecionado.toUpperCase())

      const generoProd = normalizarTexto(extrairTexto((produto as any).genero || (produto as any).sexo))
      const textoCompleto = `${generoProd} ${nomeNorm}`
      let matchGenero = true

      if (generoSelecionado && generoSelecionado !== "todos") {
        if (generoSelecionado === "masculino") {
          matchGenero = textoCompleto.includes("masculino") || textoCompleto.includes("menino")
        } else if (generoSelecionado === "feminino") {
          matchGenero = textoCompleto.includes("feminino") || textoCompleto.includes("menina")
        }
      }

      let matchIdade = true
      if (idadeSelecionada && idadeSelecionada !== "todos") {
        const faixaProd = normalizarTexto(extrairTexto((produto as any).faixaEtaria || (produto as any).idade))
        const itemFaixa = FAIXAS_IDADE.find((f) => f.query === idadeSelecionada || f.aliases?.includes(idadeSelecionada))
        const aliasesBusca = itemFaixa ? [itemFaixa.query, ...(itemFaixa.aliases || [])] : [idadeSelecionada]

        matchIdade = aliasesBusca.some((alias) => faixaProd.includes(normalizarTexto(alias)))
      }

      return matchBusca && matchCategoria && matchTamanho && matchGenero && matchIdade
    }).sort((a, b) => {
      const nomeA = extrairTexto(a.nome)
      const nomeB = extrairTexto(b.nome)
      const precoA = Number(a.precoPromocional || a.preco || 0)
      const precoB = Number(b.precoPromocional || b.preco || 0)

      if (ordenacao === "menor-preco") return precoA - precoB
      if (ordenacao === "maior-preco") return precoB - precoA
      if (ordenacao === "az") return nomeA.localeCompare(nomeB)
      if (ordenacao === "za") return nomeB.localeCompare(nomeA)
      return 0
    })
  }, [produtos, busca, categoriaSelecionada, tamanhoSelecionado, generoSelecionado, idadeSelecionada, ordenacao, mapaIdParaNome])

  const totalPaginas = Math.ceil(produtosFiltrados.length / ITENS_POR_PAGINA)

  const produtosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
    const fim = inicio + ITENS_POR_PAGINA
    return produtosFiltrados.slice(inicio, fim)
  }, [produtosFiltrados, paginaAtual])

  const mudarPagina = (novaPagina: number) => {
    setPaginaAtual(novaPagina)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const limparFiltros = () => {
    setBusca("")
    setCategoriaSelecionada("todos")
    setTamanhoSelecionado("todos")
    setOrdenacao("relevancia")
    setCategoriasAberto(false)
    setTamanhosAberto(false)
    alterarFiltroGenero("todos")
    alterarFiltroIdade("todos")
    setPaginaAtual(1)
  }

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 font-sans text-slate-800">
      {/* Container expandido: max-w-[1800px] garante boa visualização em Monitores 2K e 4K */}
      <div className="mx-auto max-w-[1800px] px-4 sm:px-8 xl:px-12">
        
        {/* Cabeçalho */}
        <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-slate-200 pb-5 sm:pb-6">
          <div>
            <div className="inline-flex items-center gap-2">
              <span className="text-2xl sm:text-3xl font-black tracking-tight flex items-center select-none">
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
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-700 shadow-xs">
                Kids
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Moda infantil de alta qualidade com elegância e conforto.</p>
          </div>

          <button
            onClick={() => setFiltroMobileAberto(true)}
            className="lg:hidden w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-bold text-slate-700 shadow-xs transition-all active:scale-98 hover:bg-slate-100"
          >
            <SlidersHorizontal className="h-4 w-4 text-slate-700" />
            Filtros e Busca
          </button>
        </div>

        {/* Banner Presente Por Idade */}
        <div className="mb-6 sm:mb-8 bg-white backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs">
          <div className="flex flex-row items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-xs sm:text-sm">
              <Gift className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Presente por idade:</span>
            </div>

            {idadeSelecionada !== "todos" && (
              <button
                onClick={() => alterarFiltroIdade("todos")}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-xl border border-slate-300 transition-all"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none -mx-1 px-1">
            {FAIXAS_IDADE.map((item) => {
              const estaAtivo =
                (idadeSelecionada === "todos" && item.query === "todos") ||
                idadeSelecionada === item.query ||
                item.aliases?.includes(idadeSelecionada)

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => alterarFiltroIdade(item.query)}
                  className={`
                    px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full font-bold text-xs whitespace-nowrap transition-all border shrink-0
                    ${
                      estaAtivo
                        ? `${item.activeColor} scale-105 shadow-sm`
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                    }
                  `}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Layout Grid Adaptável: Sidebar fixada em largura conveniente, produtos ocupam todo o espaço restante */}
        <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 sm:gap-8">
          
          {/* Sidebar / Modal Drawer Mobile */}
          <aside
            className={`
              lg:block lg:col-span-1
              ${filtroMobileAberto ? "fixed inset-0 z-50 bg-white p-5 overflow-y-auto flex flex-col justify-between" : "hidden"}
            `}
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 lg:hidden">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Filtros
                </h2>
                <button
                  onClick={() => setFiltroMobileAberto(false)}
                  className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-3xl bg-white lg:border border-slate-200 lg:p-6 lg:shadow-xs space-y-6">
                <div className="hidden lg:flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                    Filtros
                  </h3>
                  {(busca || categoriaSelecionada !== "todos" || tamanhoSelecionado !== "todos" || generoSelecionado !== "todos" || idadeSelecionada !== "todos" || ordenacao !== "relevancia") && (
                    <button
                      onClick={limparFiltros}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:underline transition-all"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpar
                    </button>
                  )}
                </div>

                {/* Busca */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Buscar produto</label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Nome da peça..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-4 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Ordenação */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Ordenar por</label>
                  <select
                    value={ordenacao}
                    onChange={(e) => setOrdenacao(e.target.value)}
                    className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3.5 text-xs text-slate-800 font-semibold focus:border-slate-800 focus:bg-white focus:outline-none transition-all cursor-pointer"
                  >
                    <option value="relevancia">Relevância</option>
                    <option value="menor-preco">Menor Preço</option>
                    <option value="maior-preco">Maior Preço</option>
                    <option value="az">Ordem Alfabética (A-Z)</option>
                    <option value="za">Ordem Alfabética (Z-A)</option>
                  </select>
                </div>

                {/* Gênero */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Gênero</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: "Todos", value: "todos" },
                      { label: "Feminino", value: "feminino" },
                      { label: "Masculino", value: "masculino" },
                    ].map((gen) => {
                      const ativo = generoSelecionado === gen.value
                      return (
                        <button
                          key={gen.value}
                          type="button"
                          onClick={() => alterarFiltroGenero(gen.value)}
                          className={`py-2 px-1.5 rounded-2xl text-[11px] sm:text-xs font-bold border transition-all flex items-center justify-center gap-1 ${
                            ativo
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          {ativo && <Check className="h-3 w-3 text-pink-400 shrink-0" />}
                          <span className="truncate">{gen.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Categorias */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Categorias</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setCategoriasAberto(!categoriasAberto)
                        setTamanhosAberto(false)
                      }}
                      className="w-full flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      <span className="truncate capitalize">
                        {categoriaSelecionada === "todos" ? "Todas as categorias" : categoriaSelecionada}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 shrink-0 ${categoriasAberto ? "rotate-180" : ""}`} />
                    </button>

                    {categoriasAberto && (
                      <div className="absolute top-full left-0 right-0 mt-2 z-30 rounded-2xl bg-white border border-slate-200 p-2 shadow-lg space-y-1 max-h-56 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoriaSelecionada("todos")
                            setCategoriasAberto(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            categoriaSelecionada === "todos"
                              ? "bg-slate-900 text-white font-bold"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          Todas as categorias
                        </button>
                        {categoriasDisponiveis.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setCategoriaSelecionada(cat)
                              setCategoriasAberto(false)
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all capitalize ${
                              categoriaSelecionada === cat
                                ? "bg-slate-900 text-white font-bold"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tamanhos */}
                {tamanhosDisponiveis.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">Tamanho</label>
                      {tamanhoSelecionado !== "todos" && (
                        <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {tamanhoSelecionado}
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setTamanhosAberto(!tamanhosAberto)
                          setCategoriasAberto(false)
                        }}
                        className="w-full flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-all cursor-pointer shadow-xs"
                      >
                        <span className="truncate">
                          {tamanhoSelecionado === "todos" ? "Todos" : tamanhoSelecionado}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 shrink-0 ${tamanhosAberto ? "rotate-180" : ""}`} />
                      </button>

                      {tamanhosAberto && (
                        <div className="absolute top-full left-0 right-0 mt-2 z-30 rounded-2xl bg-white border border-slate-200 p-2.5 shadow-xl space-y-2 max-h-60 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setTamanhoSelecionado("todos")
                              setTamanhosAberto(false)
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                              tamanhoSelecionado === "todos"
                                ? "bg-slate-900 text-white"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            <span>Todos</span>
                            {tamanhoSelecionado === "todos" && <Check className="h-3.5 w-3.5 text-amber-400" />}
                          </button>

                          <div className="border-t border-slate-100" />

                          <div className="grid grid-cols-4 gap-1.5">
                            {tamanhosDisponiveis.map((tam) => {
                              const ativo = tamanhoSelecionado === tam
                              return (
                                <button
                                  key={tam}
                                  type="button"
                                  onClick={() => {
                                    setTamanhoSelecionado(tam)
                                    setTamanhosAberto(false)
                                  }}
                                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                                    ativo
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-100"
                                  }`}
                                >
                                  {ativo && <Check className="h-3 w-3 text-amber-400 shrink-0" />}
                                  {tam}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {filtroMobileAberto && (
              <div className="pt-4 border-t border-slate-100 mt-6 lg:hidden flex gap-2">
                <button
                  onClick={limparFiltros}
                  className="w-1/3 rounded-2xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-bold text-slate-700 transition-all"
                >
                  Limpar
                </button>
                <button
                  onClick={() => setFiltroMobileAberto(false)}
                  className="w-2/3 rounded-2xl bg-slate-900 hover:bg-slate-800 py-3 text-xs font-bold text-white shadow-md transition-transform active:scale-95"
                >
                  Ver ({produtosFiltrados.length})
                </button>
              </div>
            )}
          </aside>

          {/* Área Principal de Produtos (Adapta colunas conforme o tamanho da tela) */}
          <main className="lg:col-span-3 xl:col-span-4 2xl:col-span-5">
            {produtosFiltrados.length === 0 ? (
              <div className="rounded-3xl bg-white border border-slate-200 p-8 sm:p-12 text-center space-y-3 shadow-xs text-slate-700">
                <ShoppingBag className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-800">Nenhum produto encontrado com esses filtros.</p>
                <p className="text-xs text-slate-500">Tente buscar por outro termo ou limpar os filtros aplicados.</p>
                <button
                  onClick={limparFiltros}
                  className="mt-2 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-slate-800"
                >
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <>
                {/* As colunas do Grid aumentam progressivamente em monitores Full HD, QuadHD (2K) e 4K */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-6">
                  {produtosPaginados.map((produto) => (
                    <CardProduto
                      key={String((produto as any).id || (produto as any)._id)}
                      produto={produto}
                    />
                  ))}
                </div>

                {totalPaginas > 1 && (
                  <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => mudarPagina(paginaAtual - 1)}
                      disabled={paginaAtual === 1}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Anterior
                    </button>

                    <div className="flex flex-wrap items-center gap-1">
                      {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          onClick={() => mudarPagina(num)}
                          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-xs font-bold transition-all ${
                            paginaAtual === num
                              ? "bg-slate-900 text-white shadow-xs"
                              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => mudarPagina(paginaAtual + 1)}
                      disabled={paginaAtual === totalPaginas}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Próxima
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

export default function CatalogoPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    }>
      <CatalogoConteudo />
    </Suspense>
  )
}
