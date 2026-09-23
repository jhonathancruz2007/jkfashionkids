// PERFIL PAGE — versão revisada
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useFavoritos } from "@/lib/favoritos-context"
import {
  User,
  Heart,
  ShoppingBag,
  MapPin,
  Edit,
  LogOut,
  Loader2,
  Package,
  ArrowRight,
  Trash2,
  Clock,
  X,
  Truck,
  CreditCard,
  Tag,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  Clock3,
  ShoppingCart,
} from "lucide-react"

// Função auxiliar para identificar e calcular preço promocional vs preço original
function obterPrecosProduto(item: any, prodObj: any, prodExtra: any) {
  const p = prodExtra || prodObj || item || {}

  const parseNum = (val: any) => {
    if (val === null || val === undefined || val === "") return null
    const n = Number(val)
    return isNaN(n) ? null : n
  }

  const promoExplicit =
    parseNum(p.precoPromocional) ??
    parseNum(p.preco_promocional) ??
    parseNum(p.precoPor) ??
    parseNum(p.preco_por) ??
    parseNum(p.precoDesconto) ??
    parseNum(p.preco_desconto) ??
    parseNum(p.valorPromocional) ??
    parseNum(p.valor_promocional) ??
    parseNum(p.precoComDesconto) ??
    parseNum(p.salePrice) ??
    parseNum(p.discountPrice)

  const originalExplicit =
    parseNum(p.precoOriginal) ??
    parseNum(p.preco_original) ??
    parseNum(p.precoDe) ??
    parseNum(p.preco_de) ??
    parseNum(p.priceOriginal) ??
    parseNum(p.originalPrice) ??
    parseNum(p.regularPrice) ??
    parseNum(p.precoBase)

  const precoGenerico =
    parseNum(p.preco) ??
    parseNum(p.price) ??
    parseNum(p.valor) ??
    parseNum(item.preco) ??
    parseNum(item.price) ??
    0

  let precoFinal = precoGenerico
  let precoOriginal = 0

  if (promoExplicit !== null && promoExplicit > 0) {
    precoFinal = promoExplicit
    if (originalExplicit !== null && originalExplicit > promoExplicit) {
      precoOriginal = originalExplicit
    } else if (precoGenerico > promoExplicit) {
      precoOriginal = precoGenerico
    }
  } else if (
    originalExplicit !== null &&
    originalExplicit > precoGenerico &&
    precoGenerico > 0
  ) {
    precoFinal = precoGenerico
    precoOriginal = originalExplicit
  } else {
    const percDesconto =
      parseNum(p.desconto) ??
      parseNum(p.percentualDesconto) ??
      parseNum(p.porcentagemDesconto)

    if (
      percDesconto !== null &&
      percDesconto > 0 &&
      percDesconto < 100 &&
      precoGenerico > 0
    ) {
      precoOriginal = precoGenerico
      precoFinal = precoGenerico * (1 - percDesconto / 100)
    }
  }

  const temDesconto = precoOriginal > precoFinal && precoFinal > 0
  const percentualDesconto = temDesconto
    ? Math.round(((precoOriginal - precoFinal) / precoOriginal) * 100)
    : 0

  return { precoFinal, precoOriginal, temDesconto, percentualDesconto }
}

function obterDataPedido(pedido: any) {
  if (!pedido?.createdAt) return "Data não informada"

  const data = new Date(pedido.createdAt)
  if (Number.isNaN(data.getTime())) return "Data não informada"

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function obterItensPedido(pedido: any) {
  const itens =
    pedido?.itens ||
    pedido?.produtos ||
    pedido?.items ||
    []

  return Array.isArray(itens) ? itens : []
}

function obterClasseStatus(statusBruto: any) {
  const status = String(statusBruto || "").toLowerCase()

  if (
    status.includes("entreg") ||
    status.includes("conclu") ||
    status.includes("finaliz")
  ) {
    return {
      classe:
        "bg-emerald-50 border-emerald-200 text-emerald-700",
      icone: CheckCircle2,
    }
  }

  if (
    status.includes("cancel") ||
    status.includes("falh") ||
    status.includes("recus")
  ) {
    return {
      classe: "bg-red-50 border-red-200 text-red-700",
      icone: X,
    }
  }

  if (
    status.includes("envi") ||
    status.includes("transport")
  ) {
    return {
      classe: "bg-sky-50 border-sky-200 text-sky-700",
      icone: Truck,
    }
  }

  return {
    classe: "bg-amber-50 border-amber-200 text-amber-700",
    icone: Clock3,
  }
}

export default function PerfilPage() {
  const router = useRouter()
  const { favoritos: favoritosContexto, toggleFavorito } = useFavoritos()

  const [abaAtiva, setAbaAtiva] = useState<"dados" | "favoritos" | "pedidos">(
    "dados"
  )
  const [carregando, setCarregando] = useState(true)
  const [dados, setDados] = useState<{
    cliente: any
    pedidos: any[]
  }>({
    cliente: null,
    pedidos: [],
  })

  const [pedidoSelecionado, setPedidoSelecionado] = useState<any | null>(null)
  const [produtosMap, setProdutosMap] = useState<Record<string, any>>({})
  const [produtosExtras, setProdutosExtras] = useState<Record<string, any>>({})
  const [mensagemFavorito, setMensagemFavorito] = useState("")

  useEffect(() => {
    async function carregarDadosIniciais() {
      try {
        const resPerfil = await fetch("/api/cliente/perfil")
        if (resPerfil.status === 401) {
          router.push("/login")
          return
        }

        if (resPerfil.ok) {
          const json = await resPerfil.json()
          const clienteEncontrado =
            json.cliente || json.user || (json.email ? json : null)

          setDados({
            cliente: clienteEncontrado,
            pedidos: Array.isArray(json.pedidos) ? json.pedidos : [],
          })
        }

        const resProdutos = await fetch("/api/produtos")
        if (resProdutos.ok) {
          const jsonProd = await resProdutos.json()
          const listaProdutos = Array.isArray(jsonProd)
            ? jsonProd
            : jsonProd.produtos || jsonProd.produtosList || []

          const map: Record<string, any> = {}
          listaProdutos.forEach((p: any) => {
            const id = p.id || p._id || p.produtoId || p.codigo
            if (id !== undefined && id !== null) {
              map[String(id)] = p
            }
          })
          setProdutosMap(map)
        }
      } catch (e) {
        console.error("Erro ao carregar dados:", e)
      } finally {
        setCarregando(false)
      }
    }

    carregarDadosIniciais()
  }, [router])

  const listaFavoritos = favoritosContexto || []

  useEffect(() => {
    async function buscarProdutosFaltantes() {
      for (const item of listaFavoritos) {
        const rawId =
          item.produtoId ||
          item.produto?.id ||
          item.Produto?.id ||
          item.id

        const prodIdStr =
          rawId !== null && rawId !== undefined ? String(rawId) : null

        if (
          prodIdStr &&
          !produtosMap[prodIdStr] &&
          !produtosExtras[prodIdStr]
        ) {
          try {
            const res = await fetch(`/api/produtos/${prodIdStr}`)
            if (res.ok) {
              const json = await res.json()
              const prodData = json.produto || json.item || json
              setProdutosExtras((prev) => ({
                ...prev,
                [prodIdStr]: prodData,
              }))
            }
          } catch {
            // Silencioso
          }
        }
      }
    }

    if (listaFavoritos.length > 0) {
      buscarProdutosFaltantes()
    }
  }, [listaFavoritos, produtosMap, produtosExtras])

  const handleLogout = async () => {
    try {
      await fetch("/api/cliente/auth/logout", { method: "POST" })
      window.location.href = "/login"
    } catch (e) {
      console.error("Erro ao sair:", e)
    }
  }

  const handleRemoverFavorito = (produto: any) => {
    toggleFavorito(produto)
    setMensagemFavorito("Produto removido dos favoritos")
    window.setTimeout(() => setMensagemFavorito(""), 2200)
  }

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  const { cliente, pedidos } = dados
  const ultimoPedido = pedidos?.[0] || null

  let economiaTotalPromocao = 0

  return (
    <div className="min-h-screen bg-neutral-50 py-6 sm:py-8 font-sans text-neutral-800 relative">
      {mensagemFavorito && (
        <div className="fixed top-5 left-1/2 z-[60] -translate-x-1/2">
          <div className="rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-800 shadow-lg">
            {mensagemFavorito}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* CABEÇALHO DO PERFIL */}
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-neutral-200/80 bg-white p-4 sm:p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 border border-red-200 text-red-600 font-extrabold text-lg">
              {cliente?.nome ? (
                cliente.nome.charAt(0).toUpperCase()
              ) : (
                <User className="h-6 w-6" />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-600">
                Minha conta
              </p>
              <h1 className="truncate text-lg sm:text-xl font-extrabold text-neutral-900 tracking-tight">
                Olá, {cliente?.nome || "Cliente"} 👋
              </h1>
              <p className="truncate text-xs text-neutral-500">
                {cliente?.email || "Sem e-mail cadastrado"}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/perfil/editar"
              className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-all shadow-sm"
            >
              <Edit className="h-3.5 w-3.5 text-red-600" />
              Editar perfil
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-all shadow-sm cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>

        {/* NAVEGAÇÃO */}
        <div className="mb-5 border-b border-neutral-200">
          <div className="flex items-center gap-5 sm:gap-7 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setAbaAtiva("dados")}
              className={`relative flex shrink-0 items-center gap-2 pb-3 text-xs font-bold transition-all ${
                abaAtiva === "dados"
                  ? "text-red-600"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <User className="h-4 w-4" />
              Minha conta
              {abaAtiva === "dados" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-red-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("favoritos")}
              className={`relative flex shrink-0 items-center gap-2 pb-3 text-xs font-bold transition-all ${
                abaAtiva === "favoritos"
                  ? "text-red-600"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <Heart className="h-4 w-4" />
              Favoritos ({listaFavoritos.length})
              {abaAtiva === "favoritos" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-red-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("pedidos")}
              className={`relative flex shrink-0 items-center gap-2 pb-3 text-xs font-bold transition-all ${
                abaAtiva === "pedidos"
                  ? "text-red-600"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <ShoppingBag className="h-4 w-4" />
              Meus pedidos ({pedidos.length})
              {abaAtiva === "pedidos" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-red-600" />
              )}
            </button>
          </div>
        </div>

        {/* ATALHOS */}
        <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/catalogo"
            className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600">
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-neutral-900">
                  Continuar comprando
                </p>
                <p className="text-[11px] text-neutral-500">
                  Ver novas peças
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <button
            type="button"
            onClick={() => setAbaAtiva("favoritos")}
            className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md text-left"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600">
                <Heart className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-neutral-900">
                  Ver favoritos
                </p>
                <p className="text-[11px] text-neutral-500">
                  {listaFavoritos.length} {listaFavoritos.length === 1 ? "item salvo" : "itens salvos"}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("pedidos")}
            className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md text-left"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-neutral-900">
                  Acompanhar pedidos
                </p>
                <p className="text-[11px] text-neutral-500">
                  {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} realizados
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* ABA 1: MINHA CONTA */}
        {abaAtiva === "dados" && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {/* Informações pessoais */}
            <section className="rounded-3xl bg-white border border-neutral-200/80 p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-extrabold text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-2.5">
                  <User className="h-4 w-4 text-red-600" />
                  Informações pessoais
                </h2>
              </div>

              <div className="space-y-4">
                <div className="border-b border-neutral-100 pb-3">
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Nome completo
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.nome || "Não informado"}
                  </span>
                </div>

                <div className="border-b border-neutral-100 pb-3">
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    E-mail
                  </span>
                  <span className="break-all text-neutral-900 font-bold text-sm">
                    {cliente?.email || "Não informado"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Telefone / WhatsApp
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.telefone || cliente?.whatsapp || "Não informado"}
                  </span>
                </div>
              </div>
            </section>

            {/* Endereço */}
            <section className="rounded-3xl bg-white border border-neutral-200/80 p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="font-extrabold text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-red-600" />
                  Endereço de entrega
                </h2>

                <Link
                  href="/perfil/editar"
                  className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-red-600 hover:text-red-700"
                >
                  <Edit className="h-3 w-3" />
                  Editar
                </Link>
              </div>

              <div className="space-y-4">
                <div className="border-b border-neutral-100 pb-3">
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Rua / Logradouro
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.rua || cliente?.endereco || "Não informado"}
                    {cliente?.numero ? `, ${cliente.numero}` : ""}
                  </span>
                </div>

                {cliente?.complemento && (
                  <div className="border-b border-neutral-100 pb-3">
                    <span className="text-neutral-400 block font-medium text-xs mb-1">
                      Complemento
                    </span>
                    <span className="text-neutral-900 font-bold text-sm">
                      {cliente.complemento}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 pb-3">
                  <div>
                    <span className="text-neutral-400 block font-medium text-xs mb-1">
                      Bairro
                    </span>
                    <span className="text-neutral-900 font-bold text-sm">
                      {cliente?.bairro || "Não informado"}
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-400 block font-medium text-xs mb-1">
                      CEP
                    </span>
                    <span className="text-neutral-900 font-bold text-sm">
                      {cliente?.cep || "Não informado"}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Cidade / Estado
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.cidade
                      ? `${cliente.cidade}${cliente.estado ? ` - ${cliente.estado}` : ""}`
                      : "Não informado"}
                  </span>
                </div>
              </div>
            </section>

            {/* Último pedido / resumo */}
            <section className="rounded-3xl bg-white border border-neutral-200/80 p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-extrabold text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-2.5">
                  <Package className="h-4 w-4 text-red-600" />
                  Seu último pedido
                </h2>
              </div>

              {ultimoPedido ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-600">
                          Pedido
                        </p>
                        <p className="mt-0.5 text-base font-extrabold text-neutral-900">
                          #{ultimoPedido.id || ultimoPedido._id}
                        </p>
                      </div>

                      {(() => {
                        const statusInfo = obterClasseStatus(ultimoPedido.status)
                        const StatusIcon = statusInfo.icone

                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${statusInfo.classe}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {ultimoPedido.status || "Em processamento"}
                          </span>
                        )
                      })()}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="block text-neutral-400">Data</span>
                        <span className="font-bold text-neutral-800">
                          {obterDataPedido(ultimoPedido)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-neutral-400">Total</span>
                        <span className="font-extrabold text-red-600">
                          {Number(ultimoPedido.total || 0).toLocaleString(
                            "pt-BR",
                            {
                              style: "currency",
                              currency: "BRL",
                            }
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPedidoSelecionado(ultimoPedido)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-100 border border-neutral-200 px-4 py-3 text-xs font-extrabold text-neutral-700 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                  >
                    Ver pedido
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center">
                  <Package className="mx-auto h-8 w-8 text-neutral-300" />
                  <p className="mt-2 text-sm font-bold text-neutral-700">
                    Você ainda não fez nenhum pedido.
                  </p>
                  <Link
                    href="/catalogo"
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-all"
                  >
                    Ver catálogo
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ABA 2: FAVORITOS */}
        {abaAtiva === "favoritos" && (
          <div>
            {listaFavoritos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 sm:p-12 text-center space-y-3 shadow-sm">
                <Heart className="h-10 w-10 text-neutral-400 mx-auto" />
                <p className="text-sm font-bold text-neutral-700">
                  Você ainda não favoritou nenhuma roupa.
                </p>
                <Link
                  href="/catalogo"
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-all mt-2"
                >
                  Ver catálogo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {listaFavoritos.map((item: any, index: number) => {
                  const prodObj = item.produto || item.Produto || item

                  const rawId =
                    item.produtoId ||
                    prodObj.produtoId ||
                    prodObj.id ||
                    prodObj._id ||
                    item.id

                  const prodIdStr =
                    rawId !== null && rawId !== undefined
                      ? String(rawId)
                      : null

                  const prodExtra = prodIdStr
                    ? produtosExtras[prodIdStr]
                    : null

                  const prodMap = prodIdStr
                    ? produtosMap[prodIdStr]
                    : null

                  const produtoReal = prodMap || prodExtra || prodObj

                  const {
                    precoFinal,
                    precoOriginal,
                    temDesconto,
                    percentualDesconto,
                  } = obterPrecosProduto(item, prodObj, produtoReal)

                  const nome =
                    produtoReal.nome ||
                    produtoReal.title ||
                    produtoReal.titulo ||
                    produtoReal.name ||
                    prodObj.nome ||
                    prodObj.title ||
                    "Produto"

                  const imagem =
                    produtoReal.imagemUrl ||
                    produtoReal.imagem ||
                    produtoReal.imageUrl ||
                    produtoReal.foto ||
                    produtoReal.fotoUrl ||
                    produtoReal.img ||
                    prodObj.imagemUrl ||
                    prodObj.imagem ||
                    prodObj.imageUrl ||
                    prodObj.foto ||
                    ""

                  return (
                    <article
                      key={prodIdStr || index}
                      className="group relative rounded-2xl sm:rounded-3xl bg-white border border-neutral-200/80 p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between transition-all duration-300 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
                    >
                      {temDesconto && (
                        <div className="absolute top-4 left-4 z-10 flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[9px] font-black uppercase text-white shadow-sm">
                          <Tag className="h-2.5 w-2.5" />
                          -{percentualDesconto}%
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoverFavorito(produtoReal)}
                        title="Remover dos favoritos"
                        className="absolute top-3.5 right-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 backdrop-blur-md border border-neutral-200 shadow-sm text-red-600 transition-all hover:scale-105 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <Link
                        href={prodIdStr ? `/produtos/${prodIdStr}` : "#"}
                        className="block"
                      >
                        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl sm:rounded-2xl bg-neutral-100 mb-3">
                          {imagem ? (
                            <img
                              src={imagem}
                              alt={nome}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-neutral-400 font-semibold">
                              Sem imagem
                            </div>
                          )}
                        </div>

                        <h3 className="line-clamp-2 min-h-[2.5rem] text-xs sm:text-sm font-bold text-neutral-900 transition-colors group-hover:text-red-600">
                          {nome}
                        </h3>

                        <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
                          <p className="text-sm sm:text-base font-extrabold text-red-600">
                            {precoFinal.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </p>

                          {temDesconto && (
                            <p className="text-[10px] sm:text-xs font-medium text-neutral-400 line-through">
                              {precoOriginal.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </p>
                          )}
                        </div>
                      </Link>

                      <Link
                        href={prodIdStr ? `/produtos/${prodIdStr}` : "#"}
                        className="mt-3 block w-full rounded-xl bg-neutral-100 py-2.5 text-center text-[11px] sm:text-xs font-extrabold text-neutral-700 hover:bg-red-600 hover:text-white transition-all"
                      >
                        Ver produto
                      </Link>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ABA 3: PEDIDOS */}
        {abaAtiva === "pedidos" && (
          <div>
            {pedidos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 sm:p-12 text-center space-y-3 shadow-sm">
                <Package className="h-10 w-10 text-neutral-400 mx-auto" />
                <p className="text-sm font-bold text-neutral-700">
                  Você ainda não fez nenhum pedido.
                </p>
                <Link
                  href="/catalogo"
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-all mt-2"
                >
                  Ver catálogo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pedidos.map((pedido: any) => {
                  const statusInfo = obterClasseStatus(pedido.status)
                  const StatusIcon = statusInfo.icone
                  const itensPedido = obterItensPedido(pedido)

                  return (
                    <article
                      key={pedido.id || pedido._id}
                      className="rounded-3xl bg-white border border-neutral-200/80 p-5 sm:p-6 shadow-sm transition-all hover:border-red-200 hover:shadow-md"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-600">
                              Pedido
                            </p>
                            <h3 className="mt-0.5 text-base sm:text-lg font-extrabold text-neutral-900">
                              #{pedido.id || pedido._id}
                            </h3>

                            <p className="mt-1 text-xs text-neutral-500">
                              {obterDataPedido(pedido)} • {itensPedido.length}{" "}
                              {itensPedido.length === 1 ? "item" : "itens"}
                            </p>
                          </div>

                          <span
                            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold ${statusInfo.classe}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {pedido.status || "Em processamento"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
                          <div>
                            <span className="block text-[11px] text-neutral-400">
                              Total do pedido
                            </span>
                            <span className="text-lg font-extrabold text-red-600">
                              {Number(pedido.total || 0).toLocaleString(
                                "pt-BR",
                                {
                                  style: "currency",
                                  currency: "BRL",
                                }
                              )}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setPedidoSelecionado(pedido)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-100 border border-neutral-200 px-4 py-2.5 text-xs font-extrabold text-neutral-700 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                          >
                            Detalhes
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE DETALHES DO PEDIDO */}
      {pedidoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-3 sm:p-4">
          <div className="relative w-full max-w-xl rounded-3xl bg-white border border-neutral-200 p-5 sm:p-6 shadow-2xl space-y-5 text-neutral-800 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <span className="text-[11px] uppercase font-extrabold text-red-600 tracking-wider">
                  Detalhes do pedido
                </span>
                <h3 className="text-lg font-extrabold text-neutral-900">
                  #{pedidoSelecionado.id || pedidoSelecionado._id}
                </h3>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {obterDataPedido(pedidoSelecionado)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPedidoSelecionado(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-white hover:bg-red-600 hover:border-red-600 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status, Data e Pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs">
              <div>
                <span className="text-[11px] text-neutral-400 block font-medium">
                  Status atual
                </span>

                {(() => {
                  const statusInfo = obterClasseStatus(pedidoSelecionado.status)
                  const StatusIcon = statusInfo.icone

                  return (
                    <span
                      className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${statusInfo.classe}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {pedidoSelecionado.status || "Em processamento"}
                    </span>
                  )
                })()}
              </div>

              <div>
                <span className="text-[11px] text-neutral-400 block font-medium">
                  Data da compra
                </span>
                <span className="font-bold text-neutral-700 block mt-1">
                  {pedidoSelecionado.createdAt
                    ? new Date(pedidoSelecionado.createdAt).toLocaleDateString(
                        "pt-BR",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )
                    : "Recente"}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-neutral-400 block font-medium">
                  Forma de pagamento
                </span>
                <span className="font-bold text-neutral-700 flex items-center gap-1 mt-1 capitalize">
                  <CreditCard className="h-3.5 w-3.5 text-neutral-500" />
                  {pedidoSelecionado.formaPagamento ||
                    pedidoSelecionado.metodoPagamento ||
                    "Cartão/Pix"}
                </span>
              </div>
            </div>

            {/* Rastreamento */}
            {(pedidoSelecionado.codigoRastreio ||
              pedidoSelecionado.codigo_rastreio) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">
                    Código de rastreio
                  </span>
                  <span className="text-xs font-extrabold text-emerald-950 font-mono">
                    {pedidoSelecionado.codigoRastreio ||
                      pedidoSelecionado.codigo_rastreio}
                  </span>
                </div>

                <a
                  href={
                    pedidoSelecionado.urlRastreio ||
                    `https://rastreamento.correios.com.br/app/index.php?codigo=${
                      pedidoSelecionado.codigoRastreio ||
                      pedidoSelecionado.codigo_rastreio
                    }`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-sm"
                >
                  <Truck className="h-3.5 w-3.5" />
                  Rastrear envio
                </a>
              </div>
            )}

            {/* Produtos */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <Package className="h-4 w-4 text-red-600" />
                Produtos do pedido
              </h4>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {obterItensPedido(pedidoSelecionado).length === 0 ? (
                  <p className="text-xs text-neutral-500 italic bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                    Detalhes dos itens integrados no valor total do pedido.
                  </p>
                ) : (
                  obterItensPedido(pedidoSelecionado).map(
                    (item: any, idx: number) => {
                      const prodIdRef =
                        item.produtoId ||
                        item.produto_id ||
                        item.produto?.id ||
                        item.id

                      const produtoCatalogo = prodIdRef
                        ? produtosMap[String(prodIdRef)]
                        : null

                      const nomeItem =
                        item.nome ||
                        item.titulo ||
                        item.produto?.nome ||
                        produtoCatalogo?.nome ||
                        produtoCatalogo?.title ||
                        `Item #${idx + 1}`

                      const imagemItem =
                        item.imagem ||
                        item.imagemUrl ||
                        item.produto?.imagemUrl ||
                        item.produto?.imagem ||
                        produtoCatalogo?.imagemUrl ||
                        produtoCatalogo?.imagem ||
                        ""

                      const tamanho =
                        item.tamanho ||
                        item.size ||
                        item.variacao?.tamanho ||
                        null

                      const cor =
                        item.cor ||
                        item.color ||
                        item.variacao?.cor ||
                        null

                      const sku =
                        item.sku ||
                        item.codigo ||
                        produtoCatalogo?.sku ||
                        null

                      const qtdItem = Number(
                        item.quantidade || item.qtd || 1
                      )

                      const {
                        precoFinal: precoPagoUnit,
                        precoOriginal: precoOrigUnit,
                        temDesconto: foiPromo,
                      } = obterPrecosProduto(
                        item,
                        item.produto,
                        produtoCatalogo
                      )

                      const precoUnitarioPago = Number(
                        item.preco ||
                          item.valor ||
                          item.precoUnitario ||
                          item.valorUnitario ||
                          item.price ||
                          precoPagoUnit
                      )

                      const precoUnitarioOriginal = Number(
                        item.precoOriginal ||
                          item.preco_original ||
                          item.precoSemDesconto ||
                          precoOrigUnit
                      )

                      const ehPromocao =
                        foiPromo ||
                        (precoUnitarioOriginal > precoUnitarioPago &&
                          precoUnitarioPago > 0)

                      if (
                        ehPromocao &&
                        precoUnitarioOriginal > precoUnitarioPago
                      ) {
                        economiaTotalPromocao +=
                          (precoUnitarioOriginal - precoUnitarioPago) * qtdItem
                      }

                      return (
                        <div
                          key={idx}
                          className="bg-neutral-50 border border-neutral-200 p-3 rounded-2xl text-xs flex gap-3 items-center"
                        >
                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-200 border border-neutral-300 flex items-center justify-center">
                            {imagemItem ? (
                              <img
                                src={imagemItem}
                                alt={nomeItem}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-neutral-400" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-neutral-900 truncate block">
                                {nomeItem}
                              </span>

                              {ehPromocao && (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-black text-emerald-700">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Oferta
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-neutral-500 flex-wrap">
                              {tamanho && (
                                <span className="bg-white border border-neutral-200 px-1.5 py-0.5 rounded-md font-semibold text-neutral-700">
                                  Tam: {tamanho}
                                </span>
                              )}

                              {cor && (
                                <span className="bg-white border border-neutral-200 px-1.5 py-0.5 rounded-md font-semibold text-neutral-700">
                                  Cor: {cor}
                                </span>
                              )}

                              {sku && (
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  SKU: {sku}
                                </span>
                              )}
                            </div>

                            <span className="text-neutral-500 text-[11px] block">
                              Qtd: {qtdItem} x{" "}
                              {precoUnitarioPago.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <span className="font-extrabold text-red-600 block text-sm">
                              {(
                                precoUnitarioPago * qtdItem
                              ).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>

                            {ehPromocao &&
                              precoUnitarioOriginal > precoUnitarioPago && (
                                <span className="text-[10px] font-medium text-neutral-400 line-through block">
                                  {(
                                    precoUnitarioOriginal * qtdItem
                                  ).toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </span>
                              )}
                          </div>
                        </div>
                      )
                    }
                  )
                )}
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-600" />
                Local de envio
              </h4>

              <div className="bg-neutral-50 border border-neutral-200 p-3.5 rounded-2xl text-xs text-neutral-600 space-y-0.5">
                <p className="font-bold text-neutral-900">
                  {pedidoSelecionado.endereco?.rua ||
                    pedidoSelecionado.rua ||
                    cliente?.rua ||
                    "Endereço cadastrado no perfil"}
                  {pedidoSelecionado.endereco?.numero ||
                  pedidoSelecionado.numero
                    ? `, ${
                        pedidoSelecionado.endereco?.numero ||
                        pedidoSelecionado.numero
                      }`
                    : ""}
                  {pedidoSelecionado.endereco?.complemento ||
                  pedidoSelecionado.complemento
                    ? ` (${
                        pedidoSelecionado.endereco?.complemento ||
                        pedidoSelecionado.complemento
                      })`
                    : ""}
                </p>

                <p className="text-neutral-500 text-[11px]">
                  {pedidoSelecionado.endereco?.bairro ||
                    pedidoSelecionado.bairro ||
                    cliente?.bairro ||
                    ""}{" "}
                  -{" "}
                  {pedidoSelecionado.endereco?.cidade ||
                    pedidoSelecionado.cidade ||
                    cliente?.cidade ||
                    ""}
                  /
                  {pedidoSelecionado.endereco?.estado ||
                    pedidoSelecionado.estado ||
                    cliente?.estado ||
                    ""}
                </p>

                <p className="text-neutral-500 text-[11px]">
                  CEP:{" "}
                  {pedidoSelecionado.endereco?.cep ||
                    pedidoSelecionado.cep ||
                    cliente?.cep ||
                    "Não informado"}
                </p>
              </div>
            </div>

            {/* Resumo financeiro */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-neutral-500 border-b border-neutral-200 pb-2">
                <span className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-neutral-400" />
                  Frete pago:
                </span>

                <span className="font-bold text-neutral-900">
                  {(() => {
                    const rawFrete =
                      pedidoSelecionado.frete ??
                      pedidoSelecionado.valorFrete ??
                      pedidoSelecionado.taxaEntrega ??
                      pedidoSelecionado.shipping ??
                      pedidoSelecionado.valor_frete ??
                      pedidoSelecionado.taxa_entrega ??
                      pedidoSelecionado.freteValor ??
                      0

                    const parseVal = (val: any) => {
                      if (typeof val === "number") return val
                      if (!val) return 0

                      const str = String(val).trim()
                      const clean = str.replace(/[^\d.,]/g, "")

                      if (!clean) return 0

                      if (clean.includes(",") && clean.includes(".")) {
                        return (
                          parseFloat(
                            clean.replace(/\./g, "").replace(",", ".")
                          ) || 0
                        )
                      }

                      if (clean.includes(",")) {
                        return parseFloat(clean.replace(",", ".")) || 0
                      }

                      return parseFloat(clean) || 0
                    }

                    let valorFreteNum = parseVal(rawFrete)

                    if (valorFreteNum <= 0) {
                      const totalPedido = Number(
                        pedidoSelecionado.total || 0
                      )
                      const itens = obterItensPedido(pedidoSelecionado)

                      const somaItens = itens.reduce(
                        (acc: number, item: any) => {
                          const qtd = Number(
                            item.quantidade || item.qtd || 1
                          )
                          const preco = Number(
                            item.preco ||
                              item.valor ||
                              item.precoUnitario ||
                              item.valorUnitario ||
                              item.price ||
                              0
                          )

                          return acc + preco * qtd
                        },
                        0
                      )

                      const diferenca = totalPedido - somaItens

                      if (diferenca > 0.01) {
                        valorFreteNum = Number(diferenca.toFixed(2))
                      }
                    }

                    return valorFreteNum > 0
                      ? valorFreteNum.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "Grátis"
                  })()}
                </span>
              </div>

              {economiaTotalPromocao > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 font-bold border-b border-neutral-200 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Economia em oferta:
                  </span>
                  <span>
                    -
                    {economiaTotalPromocao.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm font-extrabold pt-1">
                <span className="text-neutral-900 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-red-600" />
                  Valor total:
                </span>

                <span className="text-red-600 text-base">
                  {Number(pedidoSelecionado.total || 0).toLocaleString(
                    "pt-BR",
                    {
                      style: "currency",
                      currency: "BRL",
                    }
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPedidoSelecionado(null)}
              className="w-full rounded-2xl bg-red-600 py-3 text-xs font-extrabold text-white shadow-md hover:bg-red-700 transition-all"
            >
              Fechar detalhes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
