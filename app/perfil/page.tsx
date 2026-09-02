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
  } else if (originalExplicit !== null && originalExplicit > precoGenerico && precoGenerico > 0) {
    precoFinal = precoGenerico
    precoOriginal = originalExplicit
  } else {
    const percDesconto =
      parseNum(p.desconto) ??
      parseNum(p.percentualDesconto) ??
      parseNum(p.porcentagemDesconto)

    if (percDesconto !== null && percDesconto > 0 && percDesconto < 100 && precoGenerico > 0) {
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

export default function PerfilPage() {
  const router = useRouter()
  const { favoritos: favoritosContexto, toggleFavorito } = useFavoritos()

  const [abaAtiva, setAbaAtiva] = useState<"dados" | "favoritos" | "pedidos">("dados")
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
        const prodIdStr = rawId !== null && rawId !== undefined ? String(rawId) : null

        if (prodIdStr && !produtosMap[prodIdStr] && !produtosExtras[prodIdStr]) {
          try {
            const res = await fetch(`/api/produtos/${prodIdStr}`)
            if (res.ok) {
              const json = await res.json()
              const prodData = json.produto || json.item || json
              setProdutosExtras((prev) => ({ ...prev, [prodIdStr]: prodData }))
            }
          } catch (err) {
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

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  const { cliente, pedidos } = dados

  let economiaTotalPromocao = 0

  return (
    <div className="min-h-screen bg-neutral-50 py-10 font-sans text-neutral-800 relative">
      <div className="mx-auto max-w-5xl px-4">
        {/* Cabeçalho do Perfil */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-3xl bg-white border border-neutral-200/80 p-6 shadow-sm gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 border border-red-200 text-red-600 font-extrabold text-xl">
              {cliente?.nome ? (
                cliente.nome.charAt(0).toUpperCase()
              ) : (
                <User className="h-7 w-7" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-neutral-900 tracking-tight">
                {cliente?.nome || "Meu Perfil"}
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                {cliente?.email || "Sem e-mail cadastrado"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/perfil/editar"
              className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-all shadow-sm"
            >
              <Edit className="h-3.5 w-3.5 text-red-600" /> Editar Perfil
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-all shadow-sm"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>

        {/* Navegação por Abas */}
        <div className="flex items-center border-b border-neutral-200 mb-8 gap-8 overflow-x-auto">
          <button
            type="button"
            onClick={() => setAbaAtiva("dados")}
            className={`flex items-center gap-2 pb-3.5 text-xs font-bold transition-all relative whitespace-nowrap ${
              abaAtiva === "dados"
                ? "text-red-600"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <User className="h-4 w-4" /> Meus Dados & Endereço
            {abaAtiva === "dados" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("favoritos")}
            className={`flex items-center gap-2 pb-3.5 text-xs font-bold transition-all relative whitespace-nowrap ${
              abaAtiva === "favoritos"
                ? "text-red-600"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <Heart className="h-4 w-4" /> Roupas Favoritadas ({listaFavoritos.length})
            {abaAtiva === "favoritos" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("pedidos")}
            className={`flex items-center gap-2 pb-3.5 text-xs font-bold transition-all relative whitespace-nowrap ${
              abaAtiva === "pedidos"
                ? "text-red-600"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <ShoppingBag className="h-4 w-4" /> Meus Pedidos ({pedidos.length})
            {abaAtiva === "pedidos" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
            )}
          </button>
        </div>

        {/* ABA 1: MEUS DADOS & ENDEREÇO */}
        {abaAtiva === "dados" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-3xl bg-white border border-neutral-200/80 p-7 shadow-sm space-y-6 text-neutral-800">
              <h2 className="font-extrabold text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-2.5">
                <User className="h-4 w-4 text-red-600" /> Informações Pessoais
              </h2>
              <div className="space-y-4">
                <div className="border-b border-neutral-100 pb-3">
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Nome Completo:
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.nome || "Não informado"}
                  </span>
                </div>
                <div className="border-b border-neutral-100 pb-3">
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    E-mail:
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.email || "Não informado"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Telefone / WhatsApp:
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.telefone || cliente?.whatsapp || "Não informado"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white border border-neutral-200/80 p-7 shadow-sm space-y-6 text-neutral-800">
              <h2 className="font-extrabold text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-red-600" /> Endereço de Entrega
              </h2>
              <div className="space-y-4">
                <div className="border-b border-neutral-100 pb-3">
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Rua / Logradouro:
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.rua || cliente?.endereco || "Não informado"}
                    {cliente?.numero ? `, ${cliente.numero}` : ""}
                  </span>
                </div>
                {cliente?.complemento && (
                  <div className="border-b border-neutral-100 pb-3">
                    <span className="text-neutral-400 block font-medium text-xs mb-1">
                      Complemento:
                    </span>
                    <span className="text-neutral-900 font-bold text-sm">
                      {cliente.complemento}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 pb-3">
                  <div>
                    <span className="text-neutral-400 block font-medium text-xs mb-1">
                      Bairro:
                    </span>
                    <span className="text-neutral-900 font-bold text-sm">
                      {cliente?.bairro || "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block font-medium text-xs mb-1">
                      CEP:
                    </span>
                    <span className="text-neutral-900 font-bold text-sm">
                      {cliente?.cep || "Não informado"}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-neutral-400 block font-medium text-xs mb-1">
                    Cidade / Estado:
                  </span>
                  <span className="text-neutral-900 font-bold text-sm">
                    {cliente?.cidade
                      ? `${cliente.cidade}${cliente.estado ? ` - ${cliente.estado}` : ""}`
                      : "Não informado"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: FAVORITOS */}
        {abaAtiva === "favoritos" && (
          <div>
            {listaFavoritos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center space-y-3 shadow-sm">
                <Heart className="h-10 w-10 text-neutral-400 mx-auto" />
                <p className="text-sm font-bold text-neutral-700">
                  Você ainda não favoritou nenhuma roupa.
                </p>
                <Link
                  href="/catalogo"
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-all mt-2"
                >
                  Ver Catálogo <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {listaFavoritos.map((item: any, index: number) => {
                  const prodObj = item.produto || item.Produto || item

                  const rawId =
                    item.produtoId ||
                    prodObj.produtoId ||
                    prodObj.id ||
                    prodObj._id ||
                    item.id

                  const prodIdStr =
                    rawId !== null && rawId !== undefined ? String(rawId) : null

                  const prodExtra = prodIdStr ? produtosExtras[prodIdStr] : null
                  const prodMap = prodIdStr ? produtosMap[prodIdStr] : null
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
                    <div
                      key={prodIdStr || index}
                      className="group relative rounded-3xl bg-white border border-neutral-200/80 p-3.5 shadow-sm flex flex-col justify-between hover:border-red-600 hover:shadow-md transition-all duration-300"
                    >
                      {temDesconto && (
                        <div className="absolute top-6 left-6 z-10 flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm">
                          <Tag className="h-3 w-3" />
                          <span>-{percentualDesconto}% OFF</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleFavorito(produtoReal)}
                        title="Remover dos favoritos"
                        className="absolute top-6 right-6 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 backdrop-blur-md border border-neutral-200 shadow-sm transition-all hover:scale-105 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <Link
                        href={prodIdStr ? `/produtos/${prodIdStr}` : "#"}
                        className="block group"
                      >
                        <div className="relative w-full aspect-square overflow-hidden rounded-2xl mb-3 bg-neutral-100 flex items-center justify-center">
                          {imagem ? (
                            <img
                              src={imagem}
                              alt={nome}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <span className="text-xs text-neutral-400 font-semibold">
                              Sem imagem
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm font-bold text-neutral-900 line-clamp-1 group-hover:text-red-600 transition-colors">
                          {nome}
                        </h3>

                        <div className="flex items-baseline gap-2 mt-1">
                          <p className="text-sm font-extrabold text-red-600">
                            {precoFinal.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </p>
                          {temDesconto && (
                            <p className="text-xs font-medium text-neutral-400 line-through">
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
                        className="w-full text-center rounded-xl bg-neutral-100 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-red-600 hover:text-white transition-all block mt-3"
                      >
                        Ver produto →
                      </Link>
                    </div>
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
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center space-y-3 shadow-sm">
                <Package className="h-10 w-10 text-neutral-400 mx-auto" />
                <p className="text-sm font-bold text-neutral-700">
                  Você ainda não fez nenhum pedido.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pedidos.map((pedido: any) => (
                  <div
                    key={pedido.id || pedido._id}
                    className="rounded-3xl bg-white border border-neutral-200/80 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold text-neutral-900 uppercase tracking-wider">
                          Pedido #{pedido.id || pedido._id}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 border border-neutral-200 px-3 py-1 text-[11px] font-bold text-neutral-600">
                          <Clock className="h-3 w-3 text-red-600" />
                          {pedido.status || "Em processamento"}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">
                        Total:{" "}
                        <span className="font-bold text-neutral-900">
                          {Number(pedido.total || 0).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPedidoSelecionado(pedido)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-100 border border-neutral-200 px-5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all cursor-pointer"
                    >
                      Detalhes do Pedido <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE DETALHES DO PEDIDO EXPANDIDO */}
      {pedidoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-xl rounded-3xl bg-white border border-neutral-200 p-6 shadow-2xl space-y-6 text-neutral-800 max-h-[90vh] overflow-y-auto">
            
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <span className="text-xs uppercase font-extrabold text-red-600 tracking-wider">
                  Detalhes do Pedido
                </span>
                <h3 className="text-lg font-extrabold text-neutral-900">
                  #{pedidoSelecionado.id || pedidoSelecionado._id}
                </h3>
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
                <span className="text-[11px] text-neutral-400 block font-medium">Status Atual</span>
                <span className="font-bold text-red-600 flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3.5 w-3.5" /> {pedidoSelecionado.status || "Em processamento"}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 block font-medium">Data da Compra</span>
                <span className="font-bold text-neutral-700 block mt-0.5">
                  {pedidoSelecionado.createdAt 
                    ? new Date(pedidoSelecionado.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Recente"}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 block font-medium">Forma de Pagamento</span>
                <span className="font-bold text-neutral-700 flex items-center gap-1 mt-0.5 capitalize">
                  <CreditCard className="h-3.5 w-3.5 text-neutral-500" />
                  {pedidoSelecionado.formaPagamento || pedidoSelecionado.metodoPagamento || "Cartão/Pix"}
                </span>
              </div>
            </div>

            {/* Rastreamento de Envio */}
            {(pedidoSelecionado.codigoRastreio || pedidoSelecionado.codigo_rastreio) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">
                    Código de Rastreio
                  </span>
                  <span className="text-xs font-extrabold text-emerald-950 font-mono">
                    {pedidoSelecionado.codigoRastreio || pedidoSelecionado.codigo_rastreio}
                  </span>
                </div>
                <a
                  href={
                    pedidoSelecionado.urlRastreio ||
                    `https://rastreamento.correios.com.br/app/index.php?codigo=${pedidoSelecionado.codigoRastreio || pedidoSelecionado.codigo_rastreio}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-sm"
                >
                  <Truck className="h-3.5 w-3.5" /> Rastrear Envio
                </a>
              </div>
            )}

            {/* Produtos do Pedido Detalhados */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <Package className="h-4 w-4 text-red-600" /> Itens Comprados
              </h4>
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {(pedidoSelecionado.itens || pedidoSelecionado.produtos || pedidoSelecionado.items || []).length === 0 ? (
                  <p className="text-xs text-neutral-500 italic bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                    Detalhes dos itens integrados no valor total do pedido.
                  </p>
                ) : (
                  (pedidoSelecionado.itens || pedidoSelecionado.produtos || pedidoSelecionado.items).map((item: any, idx: number) => {
                    const prodIdRef = item.produtoId || item.produto_id || item.produto?.id || item.id
                    const produtoCatalogo = prodIdRef ? produtosMap[String(prodIdRef)] : null

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

                    const tamanho = item.tamanho || item.size || item.variacao?.tamanho || null
                    const cor = item.cor || item.color || item.variacao?.cor || null
                    const sku = item.sku || item.codigo || produtoCatalogo?.sku || null

                    const qtdItem = Number(item.quantidade || item.qtd || 1)

                    const { precoFinal: precoPagoUnit, precoOriginal: precoOrigUnit, temDesconto: foiPromo } =
                      obterPrecosProduto(item, item.produto, produtoCatalogo)

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

                    const ehPromocao = foiPromo || (precoUnitarioOriginal > precoUnitarioPago && precoUnitarioPago > 0)
                    
                    if (ehPromocao && precoUnitarioOriginal > precoUnitarioPago) {
                      economiaTotalPromocao += (precoUnitarioOriginal - precoUnitarioPago) * qtdItem
                    }

                    return (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200 p-3 rounded-2xl text-xs flex gap-3 items-center">
                        {/* Imagem do Produto */}
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-200 border border-neutral-300 flex items-center justify-center">
                          {imagemItem ? (
                            <img src={imagemItem} alt={nomeItem} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-6 w-6 text-neutral-400" />
                          )}
                        </div>

                        {/* Informações detalhadas */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-neutral-900 truncate block">{nomeItem}</span>
                            {ehPromocao && (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-black text-emerald-700">
                                <Sparkles className="h-2.5 w-2.5" /> Oferta
                              </span>
                            )}
                          </div>

                          {/* Variações (Tamanho / Cor / SKU) */}
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
                            Qtd: {qtdItem} x {precoUnitarioPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </div>

                        {/* Preços */}
                        <div className="text-right flex-shrink-0">
                          <span className="font-extrabold text-red-600 block text-sm">
                            {(precoUnitarioPago * qtdItem).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                          {ehPromocao && precoUnitarioOriginal > precoUnitarioPago && (
                            <span className="text-[10px] font-medium text-neutral-400 line-through block">
                              {(precoUnitarioOriginal * qtdItem).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Endereço de Entrega */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-600" /> Local de Envio
              </h4>
              <div className="bg-neutral-50 border border-neutral-200 p-3.5 rounded-2xl text-xs text-neutral-600 space-y-0.5">
                <p className="font-bold text-neutral-900">
                  {pedidoSelecionado.endereco?.rua || pedidoSelecionado.rua || cliente?.rua || "Endereço cadastrado no perfil"}
                  {pedidoSelecionado.endereco?.numero || pedidoSelecionado.numero ? `, ${pedidoSelecionado.endereco?.numero || pedidoSelecionado.numero}` : ""}
                  {pedidoSelecionado.endereco?.complemento || pedidoSelecionado.complemento ? ` (${pedidoSelecionado.endereco?.complemento || pedidoSelecionado.complemento})` : ""}
                </p>
                <p className="text-neutral-500 text-[11px]">
                  {pedidoSelecionado.endereco?.bairro || pedidoSelecionado.bairro || cliente?.bairro || ""} - {pedidoSelecionado.endereco?.cidade || pedidoSelecionado.cidade || cliente?.cidade || ""}/{pedidoSelecionado.endereco?.estado || pedidoSelecionado.estado || cliente?.estado || ""}
                </p>
                <p className="text-neutral-500 text-[11px]">
                  CEP: {pedidoSelecionado.endereco?.cep || pedidoSelecionado.cep || cliente?.cep || "Não informado"}
                </p>
              </div>
            </div>

            {/* Resumo Financeiro */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-neutral-500 border-b border-neutral-200 pb-2">
                <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-neutral-400" /> Frete Pago:</span>
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
                      0;

                    const parseVal = (val: any) => {
                      if (typeof val === "number") return val;
                      if (!val) return 0;
                      const str = String(val).trim();
                      const clean = str.replace(/[^\d.,]/g, "");
                      if (!clean) return 0;
                      if (clean.includes(",") && clean.includes(".")) {
                        return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
                      }
                      if (clean.includes(",")) {
                        return parseFloat(clean.replace(",", ".")) || 0;
                      }
                      return parseFloat(clean) || 0;
                    };

                    let valorFreteNum = parseVal(rawFrete);

                    if (valorFreteNum <= 0) {
                      const totalPedido = Number(pedidoSelecionado.total || 0);
                      const itens = pedidoSelecionado.itens || pedidoSelecionado.produtos || pedidoSelecionado.items || [];
                      
                      const somaItens = itens.reduce((acc: number, item: any) => {
                        const qtd = Number(item.quantidade || item.qtd || 1);
                        const preco = Number(item.preco || item.valor || item.precoUnitario || item.valorUnitario || item.price || 0);
                        return acc + (preco * qtd);
                      }, 0);

                      const diferenca = totalPedido - somaItens;
                      if (diferenca > 0.01) {
                        valorFreteNum = Number(diferenca.toFixed(2));
                      }
                    }

                    return valorFreteNum > 0
                      ? valorFreteNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "Grátis";
                  })()}
                </span>
              </div>

              {economiaTotalPromocao > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 font-bold border-b border-neutral-200 pb-2">
                  <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Economia em Oferta:</span>
                  <span>
                    -{economiaTotalPromocao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm font-extrabold pt-1">
                <span className="text-neutral-900 flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-red-600" /> Valor Total:</span>
                <span className="text-red-600 text-base">
                  {Number(pedidoSelecionado.total || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPedidoSelecionado(null)}
              className="w-full rounded-2xl bg-red-600 py-3 text-xs font-extrabold text-white shadow-md hover:bg-red-700 transition-all cursor-pointer"
            >
              Fechar Detalhes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}