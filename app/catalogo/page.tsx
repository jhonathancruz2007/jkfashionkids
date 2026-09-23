"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { CardProduto, Produto } from "@/components/CartaoProduto"
import {
  ShoppingBag,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  ChevronDown,
  Gift,
  Check,
} from "lucide-react"

const ITENS_POR_PAGINA = 24

const FAIXAS_IDADE = [
  {
    id: "todos",
    label: "Todas",
    query: "todos",
    activeColor: "bg-slate-900 border-slate-900 text-white shadow-slate-200",
  },
  {
    id: "0-1",
    label: "até 1 ano",
    query: "0-1",
    aliases: ["ate-1-ano", "0-1", "0 a 1", "bebe", "bebê"],
    activeColor: "bg-sky-500 border-sky-500 text-white shadow-sky-200",
  },
  {
    id: "1-2",
    label: "1 a 2 anos",
    query: "1-2",
    aliases: ["1-a-2-anos", "1-2", "1 a 2"],
    activeColor: "bg-emerald-500 border-emerald-500 text-white shadow-emerald-200",
  },
  {
    id: "3-5",
    label: "3 a 5 anos",
    query: "3-5",
    aliases: ["3-a-5-anos", "3-5", "3 a 5"],
    activeColor: "bg-amber-500 border-amber-500 text-white shadow-amber-200",
  },
  {
    id: "6-8",
    label: "6 a 8 anos",
    query: "6-8",
    aliases: ["6-a-8-anos", "6-8", "6 a 8"],
    activeColor: "bg-pink-500 border-pink-500 text-white shadow-pink-200",
  },
  {
    id: "9-plus",
    label: "+9 anos",
    query: "9-plus",
    aliases: ["mais-9-anos", "9-plus", "9+", "9 anos"],
    activeColor: "bg-purple-500 border-purple-500 text-white shadow-purple-200",
  },
]

const TAMANHOS_VALIDOS = [
  "RN", "PP", "P", "M", "G", "GG",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16",
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
  if (MAPA_PADRAO_SLUGS[chaveUpper]) return MAPA_PADRAO_SLUGS[chaveUpper]
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

function extrairCategoriasDoProduto(
  prod: any,
  mapaIdParaNome: Record<string, string> = {}
): string[] {
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
    prod.slugCategoria,
  ]

  campos.forEach(tentarAdicionar)
  return Array.from(categorias)
}

function gerarPaginas(total: number, atual: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const paginas: (number | "...")[] = [1]

  if (atual > 4) paginas.push("...")

  const inicio = Math.max(2, atual - 1)
  const fim = Math.min(total - 1, atual + 1)

  for (let n = inicio; n <= fim; n++) paginas.push(n)

  if (atual < total - 3) paginas.push("...")
  paginas.push(total)

  return paginas
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
    const generoParam = searchParams.get("genero")

    // Categoria e gênero são tratados separadamente, mas continuamos aceitando
    // links antigos que usavam categoria=feminino/masculino.
    if (categoriaParam) {
      const valorCategoria = categoriaParam.toLowerCase()
      if (valorCategoria === "feminino" || valorCategoria === "masculino") {
        setCategoriaSelecionada("todos")
      } else {
        setCategoriaSelecionada(padronizarNomeCategoria(categoriaParam))
      }
    } else {
      setCategoriaSelecionada("todos")
    }

    if (generoParam) {
      const valorGenero = generoParam.toLowerCase()
      setGeneroSelecionado(
        valorGenero === "feminino" || valorGenero === "masculino"
          ? valorGenero
          : "todos"
      )
    } else if (categoriaParam) {
      const valorCategoria = categoriaParam.toLowerCase()
      setGeneroSelecionado(
        valorCategoria === "feminino" || valorCategoria === "masculino"
          ? valorCategoria
          : "todos"
      )
    } else {
      setGeneroSelecionado("todos")
    }

    const tamanhoParam = searchParams.get("tamanho")
    setTamanhoSelecionado(
      tamanhoParam ? tamanhoParam.toUpperCase() : "todos"
    )

    const idadeParam = searchParams.get("idade")
    setIdadeSelecionada(idadeParam || "todos")
  }, [searchParams])

  useEffect(() => {
    async function carregarDados() {
      try {
        const mapaTemp: Record<string, string> = {}
        const nomesDaApi: string[] = []

        const resCat =
          (await fetch("/api/categorias").catch(() => null)) ||
          (await fetch("/api/admin/categorias").catch(() => null))

        if (resCat && resCat.ok) {
          const dataCat = await resCat.json()
          const lista = Array.isArray(dataCat)
            ? dataCat
            : dataCat.categorias || dataCat.data || []

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
          const listaProd = Array.isArray(dataProd)
            ? dataProd
            : dataProd.produtos || dataProd.data || []
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
  }, [
    busca,
    categoriaSelecionada,
    tamanhoSelecionado,
    generoSelecionado,
    idadeSelecionada,
    ordenacao,
  ])

  const atualizarParametro = (chave: string, valor: string, valoresPadrao = ["todos", ""]) => {
    const params = new URLSearchParams(searchParams.toString())

    if (!valor || valoresPadrao.includes(valor)) params.delete(chave)
    else params.set(chave, valor)

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const alterarFiltroIdade = (novaIdade: string) => {
    setIdadeSelecionada(novaIdade)
    atualizarParametro("idade", novaIdade)
  }

  const alterarFiltroGenero = (novoGenero: string) => {
    setGeneroSelecionado(novoGenero)

    const params = new URLSearchParams(searchParams.toString())
    params.delete("categoria")

    if (novoGenero && novoGenero !== "todos") {
      params.set("genero", novoGenero)
    } else {
      params.delete("genero")
    }

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const alterarFiltroCategoria = (novaCategoria: string) => {
    setCategoriaSelecionada(novaCategoria)

    const params = new URLSearchParams(searchParams.toString())
    params.delete("genero")

    if (novaCategoria && novaCategoria !== "todos") {
      params.set("categoria", novaCategoria)
    } else {
      params.delete("categoria")
    }

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const alterarFiltroTamanho = (novoTamanho: string) => {
    setTamanhoSelecionado(novoTamanho)
    atualizarParametro("tamanho", novoTamanho.toUpperCase())
  }

  const categoriasDisponiveis = useMemo(() => {
    const categoriasDosProdutos = produtos.flatMap((p) =>
      extrairCategoriasDoProduto(p, mapaIdParaNome)
    )
    const todasExistentes = [...categoriasDosProdutos, ...listaCategoriasApi]

    const unicas = Array.from(new Set(todasExistentes))
      .filter((c) => c && !ehUUID(c))
      .map((c) => padronizarNomeCategoria(c))

    return Array.from(new Set(unicas)).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    )
  }, [produtos, mapaIdParaNome, listaCategoriasApi])

  const tamanhosDisponiveis = useMemo(() => {
    const extraidos = Array.from(
      new Set(
        produtos.flatMap((p) =>
          extrairListaTextos((p as any).tamanhos || (p as any).tamanho)
        )
      )
    )

    return extraidos
      .map((t) => t.trim().toUpperCase())
      .filter((t) => TAMANHOS_VALIDOS.includes(t))
      .sort(
        (a, b) =>
          TAMANHOS_VALIDOS.indexOf(a) - TAMANHOS_VALIDOS.indexOf(b)
      )
  }, [produtos])

  const produtosFiltrados = useMemo(() => {
    return produtos
      .filter((produto) => {
        const nomeNorm = normalizarTexto(extrairTexto(produto.nome))
        const descNorm = normalizarTexto(extrairTexto((produto as any).descricao))
        const buscaNorm = normalizarTexto(busca)
        const matchBusca =
          !buscaNorm ||
          nomeNorm.includes(buscaNorm) ||
          descNorm.includes(buscaNorm)

        let matchCategoria = true
        if (categoriaSelecionada && categoriaSelecionada !== "todos") {
          const catSelecionadaNorm = normalizarTexto(categoriaSelecionada)
          const catsProduto = extrairCategoriasDoProduto(
            produto,
            mapaIdParaNome
          )

          matchCategoria = catsProduto.some((catProd) => {
            const catProdNorm = normalizarTexto(catProd)
            if (catProdNorm === catSelecionadaNorm) return true

            const palavrasSel = catSelecionadaNorm
              .split(/\s+/)
              .filter((p) => p.length > 2)
            const palavrasProd = catProdNorm
              .split(/\s+/)
              .filter((p) => p.length > 2)

            return palavrasSel.some((p) => palavrasProd.includes(p))
          })
        }

        const listaTamanhosProd = extrairListaTextos(
          (produto as any).tamanhos || (produto as any).tamanho
        ).map((t) => t.toUpperCase())

        const matchTamanho =
          tamanhoSelecionado === "todos" ||
          listaTamanhosProd.includes(tamanhoSelecionado.toUpperCase())

        const generoProd = normalizarTexto(
          extrairTexto((produto as any).genero || (produto as any).sexo)
        )
        const textoCompleto = `${generoProd} ${nomeNorm}`
        let matchGenero = true

        if (generoSelecionado && generoSelecionado !== "todos") {
          if (generoSelecionado === "masculino") {
            matchGenero =
              textoCompleto.includes("masculino") ||
              textoCompleto.includes("menino")
          } else if (generoSelecionado === "feminino") {
            matchGenero =
              textoCompleto.includes("feminino") ||
              textoCompleto.includes("menina")
          }
        }

        let matchIdade = true
        if (idadeSelecionada && idadeSelecionada !== "todos") {
          const faixaProd = normalizarTexto(
            extrairTexto(
              (produto as any).faixaEtaria || (produto as any).idade
            )
          )
          const itemFaixa = FAIXAS_IDADE.find(
            (f) =>
              f.query === idadeSelecionada ||
              f.aliases?.includes(idadeSelecionada)
          )
          const aliasesBusca = itemFaixa
            ? [itemFaixa.query, ...(itemFaixa.aliases || [])]
            : [idadeSelecionada]

          matchIdade = aliasesBusca.some((alias) =>
            faixaProd.includes(normalizarTexto(alias))
          )
        }

        return (
          matchBusca &&
          matchCategoria &&
          matchTamanho &&
          matchGenero &&
          matchIdade
        )
      })
      .sort((a, b) => {
        const nomeA = extrairTexto(a.nome)
        const nomeB = extrairTexto(b.nome)
        const precoA = Number(
          (a as any).precoPromocional || (a as any).preco || 0
        )
        const precoB = Number(
          (b as any).precoPromocional || (b as any).preco || 0
        )

        if (ordenacao === "menor-preco") return precoA - precoB
        if (ordenacao === "maior-preco") return precoB - precoA
        if (ordenacao === "az") return nomeA.localeCompare(nomeB)
        if (ordenacao === "za") return nomeB.localeCompare(nomeA)
        return 0
      })
  }, [
    produtos,
    busca,
    categoriaSelecionada,
    tamanhoSelecionado,
    generoSelecionado,
    idadeSelecionada,
    ordenacao,
    mapaIdParaNome,
  ])

  const totalPaginas = Math.ceil(
    produtosFiltrados.length / ITENS_POR_PAGINA
  )

  const produtosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
    return produtosFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA)
  }, [produtosFiltrados, paginaAtual])

  const mudarPagina = (novaPagina: number) => {
    const paginaSegura = Math.max(1, Math.min(novaPagina, totalPaginas))
    setPaginaAtual(paginaSegura)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const limparFiltros = () => {
    setBusca("")
    setCategoriaSelecionada("todos")
    setTamanhoSelecionado("todos")
    setGeneroSelecionado("todos")
    setIdadeSelecionada("todos")
    setOrdenacao("relevancia")
    setCategoriasAberto(false)
    setTamanhosAberto(false)
    setFiltroMobileAberto(false)
    setPaginaAtual(1)
    router.push(pathname, { scroll: false })
  }

  const limparFiltroIndividual = (
    tipo: "categoria" | "tamanho" | "genero" | "idade"
  ) => {
    if (tipo === "categoria") alterarFiltroCategoria("todos")
    if (tipo === "tamanho") alterarFiltroTamanho("todos")
    if (tipo === "genero") alterarFiltroGenero("todos")
    if (tipo === "idade") alterarFiltroIdade("todos")
  }

  const temFiltrosAtivos =
    Boolean(busca) ||
    categoriaSelecionada !== "todos" ||
    tamanhoSelecionado !== "todos" ||
    generoSelecionado !== "todos" ||
    idadeSelecionada !== "todos" ||
    ordenacao !== "relevancia"

  const filtrosAtivos = [
    ...(busca
      ? [{ tipo: "busca" as const, label: `Busca: ${busca}` }]
      : []),
    ...(categoriaSelecionada !== "todos"
      ? [{ tipo: "categoria" as const, label: categoriaSelecionada }]
      : []),
    ...(tamanhoSelecionado !== "todos"
      ? [{ tipo: "tamanho" as const, label: `Tam: ${tamanhoSelecionado}` }]
      : []),
    ...(generoSelecionado !== "todos"
      ? [{ tipo: "genero" as const, label: generoSelecionado === "feminino" ? "Feminino" : "Masculino" }]
      : []),
    ...(idadeSelecionada !== "todos"
      ? [
          {
            tipo: "idade" as const,
            label:
              FAIXAS_IDADE.find((f) => f.query === idadeSelecionada)?.label ||
              idadeSelecionada,
          },
        ]
      : []),
  ]

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 font-sans text-slate-800">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-8 xl:px-12">
        {/* CABEÇALHO */}
        <div className="mb-5 sm:mb-6 border-b border-slate-200 pb-5 sm:pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                Catálogo
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500">
                Encontre a peça perfeita para cada momento.
              </p>
            </div>

            {/* Busca sempre visível */}
            <div className="w-full lg:max-w-xl">
              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                Buscar produto
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Digite o nome da peça..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-slate-800 focus:outline-none transition-all"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Limpar busca"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Barra de controle mobile */}
          <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setFiltroMobileAberto(true)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-all active:scale-[0.98]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </button>

            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-xs font-bold text-slate-700 shadow-sm focus:border-slate-800 focus:outline-none"
              aria-label="Ordenar produtos"
            >
              <option value="relevancia">Ordenar: Relevância</option>
              <option value="menor-preco">Menor preço</option>
              <option value="maior-preco">Maior preço</option>
              <option value="az">A-Z</option>
              <option value="za">Z-A</option>
            </select>
          </div>
        </div>

        {/* ENCONTRE POR IDADE */}
        <div className="mb-6 sm:mb-7 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800">
              <Gift className="h-4 w-4 shrink-0 text-amber-500" />
              <span>Encontre por idade:</span>
            </div>

            {idadeSelecionada !== "todos" && (
              <button
                type="button"
                onClick={() => alterarFiltroIdade("todos")}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
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
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold whitespace-nowrap transition-all ${
                    estaAtivo
                      ? `${item.activeColor} scale-105 shadow-sm`
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* RESUMO DOS RESULTADOS */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-slate-900">
              {produtosFiltrados.length} {produtosFiltrados.length === 1 ? "produto encontrado" : "produtos encontrados"}
            </p>

            {filtrosAtivos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {filtrosAtivos.map((filtro) => (
                  <span
                    key={`${filtro.tipo}-${filtro.label}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm"
                  >
                    {filtro.label}
                    {filtro.tipo === "busca" ? (
                      <button
                        type="button"
                        onClick={() => setBusca("")}
                        className="text-slate-400 hover:text-slate-900"
                        aria-label="Remover busca"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => limparFiltroIndividual(filtro.tipo)}
                        className="text-slate-400 hover:text-slate-900"
                        aria-label={`Remover filtro ${filtro.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ordenação desktop */}
          <div className="hidden lg:flex items-center gap-2">
            <label htmlFor="ordenacao-desktop" className="text-xs font-bold text-slate-500">
              Ordenar por:
            </label>
            <select
              id="ordenacao-desktop"
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm focus:border-slate-800 focus:outline-none"
            >
              <option value="relevancia">Relevância</option>
              <option value="menor-preco">Menor preço</option>
              <option value="maior-preco">Maior preço</option>
              <option value="az">Ordem alfabética (A-Z)</option>
              <option value="za">Ordem alfabética (Z-A)</option>
            </select>
          </div>
        </div>

        {/* LAYOUT */}
        <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {/* SIDEBAR / DRAWER */}
          <aside
            className={
              filtroMobileAberto
                ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white p-5"
                : "hidden lg:block lg:col-span-1"
            }
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 lg:hidden">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <SlidersHorizontal className="h-4 w-4" /> Filtros
                </h2>
                <button
                  type="button"
                  onClick={() => setFiltroMobileAberto(false)}
                  className="rounded-xl bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                  aria-label="Fechar filtros"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-3xl bg-white pt-5 lg:border lg:border-slate-200 lg:p-6 lg:shadow-sm lg:pt-6">
                <div className="hidden items-center justify-between lg:flex">
                  <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                    Filtros
                  </h3>
                  {temFiltrosAtivos && (
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpar
                    </button>
                  )}
                </div>

                <div className="space-y-6">
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
                            className={`flex items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-[11px] sm:text-xs font-bold transition-all ${
                              ativo
                                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            {ativo && <Check className="h-3 w-3 shrink-0 text-pink-400" />}
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
                          setCategoriasAberto((aberto) => !aberto)
                          setTamanhosAberto(false)
                        }}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-all"
                      >
                        <span className="truncate capitalize">
                          {categoriaSelecionada === "todos"
                            ? "Todas as categorias"
                            : categoriaSelecionada}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                            categoriasAberto ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {categoriasAberto && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                              alterarFiltroCategoria("todos")
                              setCategoriasAberto(false)
                            }}
                            className={`w-full rounded-xl px-3 py-2 text-left text-xs transition-all ${
                              categoriaSelecionada === "todos"
                                ? "bg-slate-900 font-bold text-white"
                                : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            Todas as categorias
                          </button>

                          {categoriasDisponiveis.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                alterarFiltroCategoria(cat)
                                setCategoriasAberto(false)
                              }}
                              className={`w-full rounded-xl px-3 py-2 text-left text-xs capitalize transition-all ${
                                categoriaSelecionada === cat
                                  ? "bg-slate-900 font-bold text-white"
                                  : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                            {tamanhoSelecionado}
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setTamanhosAberto((aberto) => !aberto)
                            setCategoriasAberto(false)
                          }}
                          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 transition-all"
                        >
                          <span className="truncate">
                            {tamanhoSelecionado === "todos"
                              ? "Todos"
                              : tamanhoSelecionado}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                              tamanhosAberto ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {tamanhosAberto && (
                          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-60 space-y-2.5 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl">
                            <button
                              type="button"
                              onClick={() => {
                                alterarFiltroTamanho("todos")
                                setTamanhosAberto(false)
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                tamanhoSelecionado === "todos"
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              <span>Todos</span>
                              {tamanhoSelecionado === "todos" && (
                                <Check className="h-3.5 w-3.5 text-amber-400" />
                              )}
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
                                      alterarFiltroTamanho(tam)
                                      setTamanhosAberto(false)
                                    }}
                                    className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-bold transition-all ${
                                      ativo
                                        ? "bg-slate-900 text-white"
                                        : "border border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                    }`}
                                  >
                                    {ativo && (
                                      <Check className="h-3 w-3 shrink-0 text-amber-400" />
                                    )}
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

                  {/* Idade também disponível nos filtros */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Idade</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FAIXAS_IDADE.filter((item) => item.query !== "todos").map((item) => {
                        const ativo = idadeSelecionada === item.query
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => alterarFiltroIdade(ativo ? "todos" : item.query)}
                            className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition-all ${
                              ativo
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {filtroMobileAberto && (
                <div className="mt-auto flex gap-2 border-t border-slate-100 pt-4 lg:hidden">
                  <button
                    type="button"
                    onClick={limparFiltros}
                    className="w-1/3 rounded-2xl bg-slate-100 py-3 text-xs font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroMobileAberto(false)}
                    className="w-2/3 rounded-2xl bg-slate-900 py-3 text-xs font-bold text-white shadow-md"
                  >
                    Ver ({produtosFiltrados.length})
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* PRODUTOS */}
          <main className="lg:col-span-3 xl:col-span-4 2xl:col-span-5">
            {produtosFiltrados.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 text-center shadow-sm">
                <ShoppingBag className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-800">
                  Nenhum produto encontrado.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Tente buscar por outro termo ou limpar os filtros aplicados.
                </p>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {produtosPaginados.map((produto) => (
                    <CardProduto
                      key={String((produto as any).id || (produto as any)._id)}
                      produto={produto}
                    />
                  ))}
                </div>

                {totalPaginas > 1 && (
                  <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => mudarPagina(paginaAtual - 1)}
                      disabled={paginaAtual === 1}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="hidden sm:inline">Anterior</span>
                      <span className="sm:hidden">‹</span>
                    </button>

                    <div className="hidden items-center gap-1 sm:flex">
                      {gerarPaginas(totalPaginas, paginaAtual).map((num, index) =>
                        num === "..." ? (
                          <span
                            key={`ellipsis-${index}`}
                            className="px-1 text-xs font-bold text-slate-400"
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={num}
                            type="button"
                            onClick={() => mudarPagina(num)}
                            className={`h-9 min-w-9 rounded-xl px-2 text-xs font-bold transition-all ${
                              paginaAtual === num
                                ? "bg-slate-900 text-white shadow-sm"
                                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {num}
                          </button>
                        )
                      )}
                    </div>

                    <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:hidden">
                      Página {paginaAtual} de {totalPaginas}
                    </span>

                    <button
                      type="button"
                      onClick={() => mudarPagina(paginaAtual + 1)}
                      disabled={paginaAtual === totalPaginas}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="hidden sm:inline">Próxima</span>
                      <span className="sm:hidden">›</span>
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
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      }
    >
      <CatalogoConteudo />
    </Suspense>
  )
}
