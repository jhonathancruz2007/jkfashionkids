"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Heart, ShoppingBag, Bell, Loader2, ArrowRight, X, CheckCircle2, Mail, Phone, AlertCircle } from "lucide-react"
import { useFavoritos } from "@/lib/favoritos-context"
import { useCarrinho } from "@/lib/carrinho-context"

export interface Produto {
  id?: string
  _id?: string
  nome?: any
  preco?: number | string
  precoPromocional?: number | string
  precoDesconto?: number | string
  precoComDesconto?: number | string
  precoOriginal?: number | string
  precoAntigo?: number | string
  desconto?: number | string
  porcentagemDesconto?: number | string
  categoria?: any
  tipo?: any
  tamanho?: any
  tamanhos?: any
  estoque?: any
  estoquePorTamanho?: any
  tamanhosEstoque?: any
  estoqueTamanhos?: any
  quantidade?: any
  qtd?: any
  genero?: any
  sexo?: any
  imagemUrl?: string
  imagem?: string
  imagens?: string[]
  fotos?: string[]
  localCard?: string
  ativo?: boolean
}

function extrairTexto(val: any): string {
  if (!val) return ""
  if (typeof val === "string") return val.trim()
  if (typeof val === "number") return String(val)
  if (typeof val === "object" && val !== null) {
    const possiveisValores = [val.nome, val.name, val.titulo, val.title, val.label, val.descricao, val.text]
    for (const item of possiveisValores) {
      if (item !== undefined && item !== null) {
        const resultado = extrairTexto(item)
        if (resultado) return resultado
      }
    }
  }
  return ""
}

function extrairListaTextos(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) {
    return val.map((item) => extrairTexto(item)).filter(Boolean)
  }
  const texto = extrairTexto(val)
  return texto ? [texto] : []
}

function getEstoqueTamanhosObj(produto: Produto) {
  let bruto = produto.estoquePorTamanho ?? produto.tamanhosEstoque ?? produto.estoqueTamanhos
  if (typeof bruto === "string") {
    try {
      bruto = JSON.parse(bruto)
    } catch {
      return {}
    }
  }
  if (Array.isArray(bruto)) {
    const obj: Record<string, number> = {}
    bruto.forEach((item) => {
      if (item && typeof item === "object") {
        const tam = item.tamanho || item.tam || item.name || item.label
        const qtd = item.quantidade ?? item.qtd ?? item.estoque ?? item.stock ?? item.qnt ?? 0
        if (tam) obj[String(tam).trim().toUpperCase()] = Number(qtd) || 0
      }
    })
    return obj
  }
  if (bruto && typeof bruto === "object") {
    const obj: Record<string, number> = {}
    Object.entries(bruto).forEach(([k, v]) => {
      if (k) {
        if (v && typeof v === "object") {
          const subQtd = (v as any).quantidade ?? (v as any).qtd ?? (v as any).estoque ?? (v as any).stock ?? 0
          obj[String(k).trim().toUpperCase()] = Number(subQtd) || 0
        } else {
          obj[String(k).trim().toUpperCase()] = Number(v) || 0
        }
      }
    })
    return obj
  }
  return {}
}

function isTamanhoEsgotadoCard(produto: Produto, tam: string) {
  if (!tam) return false
  const tamClean = String(tam).trim().toUpperCase()
  const estoqueTamanhosObj = getEstoqueTamanhosObj(produto)
  const chaves = Object.keys(estoqueTamanhosObj)

  if (chaves.length > 0) {
    if (tamClean in estoqueTamanhosObj) {
      return Number(estoqueTamanhosObj[tamClean]) <= 0
    }
    return true
  }

  const estoqueGeral = Number(produto.estoque ?? produto.quantidade ?? produto.qtd ?? 1)
  return estoqueGeral <= 0
}

const temasFixosPorLocal: Record<
  string,
  { topBar: string; border: string; hoverShadow: string; priceText: string; btnBg: string; toastBorder: string }
> = {
  HOME_PROMOCOES: {
    topBar: "bg-gradient-to-r from-red-500 to-rose-600",
    border: "border-red-200 hover:border-red-400",
    hoverShadow: "hover:shadow-xl hover:shadow-red-500/10",
    priceText: "text-red-600",
    btnBg: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
    toastBorder: "border-red-500",
  },
  HOME_DESTAQUE: {
    topBar: "bg-gradient-to-r from-violet-500 to-purple-600",
    border: "border-violet-200 hover:border-violet-400",
    hoverShadow: "hover:shadow-xl hover:shadow-violet-500/10",
    priceText: "text-violet-600",
    btnBg: "bg-violet-600 hover:bg-violet-700 text-white shadow-sm",
    toastBorder: "border-violet-500",
  },
  HOME_NOVIDADES: {
    topBar: "bg-gradient-to-r from-sky-400 to-cyan-600",
    border: "border-sky-200 hover:border-sky-400",
    hoverShadow: "hover:shadow-xl hover:shadow-sky-500/10",
    priceText: "text-sky-600",
    btnBg: "bg-sky-600 hover:bg-sky-700 text-white shadow-sm",
    toastBorder: "border-sky-500",
  },
  CATALOGO_APENAS: {
    topBar: "bg-gradient-to-r from-neutral-400 to-neutral-600",
    border: "border-neutral-200 hover:border-neutral-400",
    hoverShadow: "hover:shadow-xl hover:shadow-neutral-500/10",
    priceText: "text-neutral-900",
    btnBg: "bg-neutral-900 hover:bg-neutral-800 text-white shadow-sm",
    toastBorder: "border-neutral-800",
  },
}

function obterTemaFixo(produto: Produto) {
  const local = produto.localCard || "CATALOGO_APENAS"

  const precoOriginalNum = Number(produto.precoOriginal || produto.precoAntigo || produto.preco || 0)
  const precoPromocionalNum = Number(
    produto.precoPromocional ?? produto.precoDesconto ?? produto.precoComDesconto ?? 0
  )
  const temDesconto = precoPromocionalNum > 0 && precoPromocionalNum < precoOriginalNum

  if (local === "HOME_PROMOCOES" || temDesconto) {
    return temasFixosPorLocal.HOME_PROMOCOES
  }

  return temasFixosPorLocal[local] || temasFixosPorLocal.CATALOGO_APENAS
}

interface CardProdutoProps {
  produto: Produto
  isAdmin?: boolean
  onAlterarExibicaoAdmin?: (id: string, local: string) => void
  apenasDetalhes?: boolean
}

export function CardProduto({ produto, isAdmin, onAlterarExibicaoAdmin }: CardProdutoProps) {
  const favoritosCtx = (useFavoritos?.() || {}) as any
  const carrinhoCtx = (useCarrinho?.() || {}) as any

  const { toggleFavorito, isFavorito, verificarFavorito } = favoritosCtx
  const { recarregarCarrinho } = carrinhoCtx

  const idProduto = String(produto.id || produto._id || "").trim()

  const checarFavorito = isFavorito || verificarFavorito
  const estaFavoritadoNoContexto = typeof checarFavorito === "function" ? checarFavorito(idProduto) : false

  const [favoritoLocal, setFavoritoLocal] = useState<boolean>(estaFavoritadoNoContexto)
  const [carregandoFav, setCarregandoFav] = useState(false)

  useEffect(() => {
    setFavoritoLocal(estaFavoritadoNoContexto)
  }, [estaFavoritadoNoContexto])

  const tema = obterTemaFixo(produto)

  const tamanhosProduto = useMemo(
    () => extrairListaTextos(produto.tamanhos || produto.tamanho),
    [produto.tamanhos, produto.tamanho]
  )

  const [tamanhoSelecionado, setTamanhoSelecionado] = useState(tamanhosProduto[0] || "")
  const [adicionando, setAdicionando] = useState(false)
  const [notificacao, setNotificacao] = useState<{ texto: string; tipo: "sucesso" | "alerta" | "erro" } | null>(null)

  useEffect(() => {
    if (tamanhosProduto.length > 0) {
      setTamanhoSelecionado(tamanhosProduto[0])
    } else {
      setTamanhoSelecionado("")
    }
  }, [idProduto, tamanhosProduto])

  const [modalAvisoAberto, setModalAvisoAberto] = useState(false)
  const [tipoContatoAviso, setTipoContatoAviso] = useState<"email" | "whatsapp">("whatsapp")
  const [contatoAviso, setContatoAviso] = useState("")
  const [emailPerfil, setEmailPerfil] = useState("")
  const [wppPerfil, setWppPerfil] = useState("")
  const [enviandoAviso, setEnviandoAviso] = useState(false)
  const [sucessoAviso, setSucessoAviso] = useState(false)
  const [carregandoPerfil, setCarregandoPerfil] = useState(false)

  const emEstoque = !isTamanhoEsgotadoCard(produto, tamanhoSelecionado)

  const precoOriginalNum = Number(produto.precoOriginal || produto.precoAntigo || produto.preco || 0)
  const precoPromocionalNum = Number(
    produto.precoPromocional ?? produto.precoDesconto ?? produto.precoComDesconto ?? 0
  )

  const temDesconto = precoPromocionalNum > 0 && precoPromocionalNum < precoOriginalNum
  const precoFinal = temDesconto ? precoPromocionalNum : precoOriginalNum

  let percentualDesconto = Number(produto.desconto || produto.porcentagemDesconto || 0)
  if (!percentualDesconto && temDesconto && precoOriginalNum > 0) {
    percentualDesconto = Math.round(((precoOriginalNum - precoPromocionalNum) / precoOriginalNum) * 100)
  }

  // Lógica para extrair a primeira e a segunda imagem
  const listaImagens = useMemo(() => {
    if (Array.isArray(produto.imagens) && produto.imagens.length > 0) return produto.imagens
    if (Array.isArray(produto.fotos) && produto.fotos.length > 0) return produto.fotos
    if (produto.imagemUrl) return [produto.imagemUrl]
    if (produto.imagem) return [produto.imagem]
    return []
  }, [produto])

  const imagemPrincipal = listaImagens[0] || null
  const imagemSecundaria = listaImagens[1] || null

  const nomeProduto = extrairTexto(produto.nome) || "Produto"

  const exibirNotificacao = (texto: string, tipo: "sucesso" | "alerta" | "erro" = "alerta") => {
    setNotificacao({ texto, tipo })
    setTimeout(() => {
      setNotificacao(null)
    }, 4000)
  }

  const handleFavoritar = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!idProduto || carregandoFav) return

    setCarregandoFav(true)
    const proximoEstado = !favoritoLocal

    setFavoritoLocal(proximoEstado)

    try {
      const res = await fetch("/api/cliente/favoritos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: idProduto, id: idProduto }),
      })

      // 🔴 Não logado: envia direto para a tela de login
      if (res.status === 401) {
        window.location.href = "/login"
        return
      }

      if (!res.ok) {
        setFavoritoLocal(!proximoEstado)
        exibirNotificacao("Não foi possível favoritar o produto.", "erro")
        return
      }

      const produtoFormatado = {
        ...produto,
        id: idProduto,
        _id: idProduto,
        produtoId: idProduto,
      }

      if (typeof toggleFavorito === "function") {
        await toggleFavorito(produtoFormatado)
      }
    } catch (err) {
      console.error("Erro ao alternar favorito:", err)
      setFavoritoLocal(!proximoEstado)
      exibirNotificacao("Erro de conexão ao atualizar favoritos.", "erro")
    } finally {
      setCarregandoFav(false)
    }
  }

  const selecionarTamanho = (tam: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTamanhoSelecionado(tam)
  }

  const handleAdicionarAoCarrinho = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (adicionando || !idProduto) return

    try {
      setAdicionando(true)
      const tamanhoLimpo = extrairTexto(tamanhoSelecionado) || "Único"

      const res = await fetch("/api/cliente/carrinho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: idProduto,
          tamanho: tamanhoLimpo,
          quantidade: 1,
        }),
      })

      if (res.status === 401) {
        window.location.href = "/login"
        return
      }

      const data = await res.json().catch(() => ({}))

      if (data.sucesso === false || data.ok === false || !res.ok) {
        exibirNotificacao("Não há estoque disponível para adicionar este item.", "alerta")
        return
      }

      const msgSucesso = `Peça (Tam. ${tamanhoLimpo}) adicionada com sucesso ao seu carrinho!`
      exibirNotificacao(msgSucesso, "sucesso")

      if (typeof recarregarCarrinho === "function") {
        await recarregarCarrinho()
      } else {
        window.dispatchEvent(new Event("atualizarCarrinhoGlobal"))
      }
    } catch (err: any) {
      console.error("Erro ao adicionar ao carrinho:", err)
      exibirNotificacao("Não há estoque disponível para adicionar este item.", "erro")
    } finally {
      setAdicionando(false)
    }
  }

  const abrirModalAviso = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModalAvisoAberto(true)
    setSucessoAviso(false)
    setTipoContatoAviso("whatsapp")
    setContatoAviso("")
    setCarregandoPerfil(true)

    try {
      const res = await fetch("/api/cliente/perfil")
      if (res.status === 401) {
        window.location.href = "/login"
        return
      }
      if (res.ok) {
        const data = await res.json()
        const usuario = data.cliente || data.user || data
        const emailUsuario = usuario?.email || data.email || ""
        const wppUsuario =
          usuario?.whatsapp ||
          usuario?.telefone ||
          usuario?.phone ||
          usuario?.celular ||
          data.whatsapp ||
          data.telefone ||
          ""

        setEmailPerfil(emailUsuario)
        setWppPerfil(wppUsuario)
        setContatoAviso(wppUsuario)
      }
    } catch (err) {
      console.error("Erro ao buscar perfil do usuário:", err)
    } finally {
      setCarregandoPerfil(false)
    }
  }

  const enviarAvisoEstoque = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contatoAviso.trim() || !idProduto) return

    try {
      setEnviandoAviso(true)
      await fetch("/api/cliente/aviso-estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: idProduto,
          tamanho: tamanhoSelecionado,
          tipo: tipoContatoAviso,
          contato: contatoAviso,
        }),
      })

      setSucessoAviso(true)
      setTimeout(() => {
        setModalAvisoAberto(false)
        setSucessoAviso(false)
      }, 3500)
    } catch (err) {
      console.error("Erro ao cadastrar aviso:", err)
      setSucessoAviso(true)
      setTimeout(() => setModalAvisoAberto(false), 3000)
    } finally {
      setEnviandoAviso(false)
    }
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl bg-white border-2 p-4 shadow-sm flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 ${tema.border} ${tema.hoverShadow}`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1.5 w-full ${tema.topBar}`} />

      <div className="flex flex-col h-full pt-1">
        <div className="relative block overflow-hidden rounded-2xl bg-neutral-100 aspect-square min-h-[200px]">
          {temDesconto && percentualDesconto > 0 && (
            <div className="absolute top-3 left-3 z-10 bg-red-600 text-white text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full shadow-md animate-pulse">
              -{percentualDesconto}%
            </div>
          )}

          <Link href={`/produtos/${idProduto}`} className="block w-full h-full relative overflow-hidden">
            {imagemPrincipal ? (
              <>
                <img
                  src={imagemPrincipal}
                  alt={nomeProduto}
                  className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
                    imagemSecundaria ? "group-hover:opacity-0" : ""
                  }`}
                />
                {imagemSecundaria && (
                  <img
                    src={imagemSecundaria}
                    alt={`${nomeProduto} - Imagem 2`}
                    className="absolute inset-0 w-full h-full object-cover opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
                  />
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs font-semibold">
                Sem imagem
              </div>
            )}
          </Link>

          {notificacao && (
            <div
              className={`absolute inset-x-2 top-2 z-40 p-3 rounded-2xl backdrop-blur-md shadow-2xl border transition-all duration-300 animate-in fade-in zoom-in-95 slide-in-from-top-3 ${
                notificacao.tipo === "sucesso"
                  ? "bg-emerald-950/85 text-white border-emerald-500/40 shadow-emerald-900/20"
                  : notificacao.tipo === "alerta"
                  ? "bg-amber-950/85 text-white border-amber-500/40 shadow-amber-900/20"
                  : "bg-rose-950/85 text-white border-rose-500/40 shadow-rose-900/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl backdrop-blur-sm ${
                    notificacao.tipo === "sucesso"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : notificacao.tipo === "alerta"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-rose-500/20 text-rose-300"
                  }`}
                >
                  {notificacao.tipo === "sucesso" && <CheckCircle2 className="h-4 w-4" />}
                  {notificacao.tipo === "alerta" && <AlertCircle className="h-4 w-4" />}
                  {notificacao.tipo === "erro" && <X className="h-4 w-4" />}
                </div>

                <div className="flex-1 pr-1">
                  <span className="block text-[9px] font-black uppercase tracking-widest opacity-60">
                    Aviso
                  </span>
                  <p className="text-[11px] font-medium leading-snug tracking-tight">
                    {notificacao.texto}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setNotificacao(null)}
                  className="rounded-lg p-1 opacity-60 hover:opacity-100 hover:bg-white/10 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {modalAvisoAberto && (
            <div 
              className="absolute inset-0 bg-white/95 backdrop-blur-md z-30 p-3.5 flex flex-col justify-between rounded-2xl shadow-2xl border border-rose-200 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-neutral-900">
                  <Bell className="h-4 w-4 text-rose-600" /> Indisponível no momento
                </div>
                <button
                  type="button"
                  onClick={() => setModalAvisoAberto(false)}
                  className="p-1 rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {sucessoAviso ? (
                <div className="flex flex-col items-center justify-center text-center py-4 space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 animate-bounce" />
                  <p className="text-[11px] font-bold text-neutral-800">
                    Perfeito! Avisaremos você assim que o tamanho <span className="text-rose-600">{tamanhoSelecionado}</span> estiver disponível.
                  </p>
                </div>
              ) : (
                <form onSubmit={enviarAvisoEstoque} className="space-y-2.5 py-1">
                  <div className="text-[10px] text-neutral-600 font-medium leading-snug">
                    Não há estoque disponível para adicionar este item. Deseja ser avisado quando chegar?
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTipoContatoAviso("whatsapp")
                        setContatoAviso(wppPerfil)
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                        tipoContatoAviso === "whatsapp"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100"
                      }`}
                    >
                      <Phone className="h-3 w-3" /> WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoContatoAviso("email")
                        setContatoAviso(emailPerfil)
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                        tipoContatoAviso === "email"
                          ? "bg-neutral-900 text-white border-neutral-900 shadow-sm"
                          : "bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100"
                      }`}
                    >
                      <Mail className="h-3 w-3" /> E-mail
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={tipoContatoAviso === "email" ? "email" : "text"}
                      required
                      placeholder={
                        carregandoPerfil
                          ? "Buscando dados..."
                          : tipoContatoAviso === "whatsapp"
                          ? "Seu WhatsApp (com DDD)"
                          : "Seu e-mail"
                      }
                      value={contatoAviso}
                      onChange={(e) => setContatoAviso(e.target.value)}
                      className="w-full rounded-xl bg-neutral-50 border border-neutral-200 py-2 px-3 text-[11px] text-neutral-800 placeholder:text-neutral-400 focus:border-rose-600 focus:bg-white focus:outline-none transition-all pr-8"
                    />
                    {carregandoPerfil && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-rose-600" />
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={enviandoAviso || carregandoPerfil}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all disabled:opacity-70 active:scale-95"
                  >
                    {enviandoAviso && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {enviandoAviso ? "Enviando..." : "Quero ser avisado"}
                  </button>
                </form>
              )}

              <div className="text-[9px] text-neutral-400 text-center border-t border-neutral-100 pt-1">
                JK Fashion Kids • Alerta de Estoque
              </div>
            </div>
          )}

          {tamanhosProduto.length > 0 && !modalAvisoAberto && (
            <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-md p-3 translate-y-full group-hover:translate-y-0 transition-all duration-300 ease-in-out flex flex-col gap-2 z-20 border-t border-neutral-200/60 shadow-xl">
              <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 px-0.5">
                <span>Tamanho:</span>
                <span className="text-neutral-900 font-black">{tamanhoSelecionado}</span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {tamanhosProduto.map((tam) => {
                  const selecionado = tamanhoSelecionado === tam
                  return (
                    <button
                      key={tam}
                      type="button"
                      onClick={(e) => selecionarTamanho(tam, e)}
                      className={`h-8 min-w-[32px] px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center shrink-0 ${
                        selecionado
                          ? "bg-neutral-900 text-white border-neutral-900 scale-105 shadow-sm"
                          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50"
                      }`}
                    >
                      {tam}
                    </button>
                  )
                })}
              </div>

              {emEstoque ? (
                <button
                  type="button"
                  disabled={adicionando}
                  onClick={handleAdicionarAoCarrinho}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${tema.btnBg} disabled:opacity-70`}
                >
                  {adicionando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5" />
                  )}
                  {adicionando ? "Adicionando..." : "Adicionar ao carrinho"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={abrirModalAviso}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-900 text-white transition-all shadow-sm active:scale-95"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Avise-me quando chegar
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleFavoritar}
            disabled={carregandoFav}
            aria-label="Favoritar produto"
            className="absolute top-3 right-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-md border border-neutral-200 shadow-sm transition-all hover:scale-110 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {carregandoFav ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
            ) : (
              <Heart
                className={`h-4 w-4 transition-colors ${
                  favoritoLocal ? "fill-rose-600 text-rose-600" : "text-neutral-400 hover:text-rose-600"
                }`}
              />
            )}
          </button>
        </div>

        <div className="pt-3 px-1 flex-1 flex flex-col justify-between">
          <div>
            <Link href={`/produtos/${idProduto}`}>
              <h3 className="text-xs sm:text-sm font-bold text-neutral-800 line-clamp-2 transition-colors hover:text-rose-600 group-hover:text-rose-600 cursor-pointer">
                {nomeProduto}
              </h3>
            </Link>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
            <div className="flex flex-col">
              {temDesconto && (
                <span className="text-[10px] sm:text-xs font-semibold text-neutral-400 line-through">
                  {precoOriginalNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              )}
              <span className={`text-sm sm:text-base font-black ${temDesconto ? "text-red-600" : tema.priceText}`}>
                {precoFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>

            <Link
              href={`/produtos/${idProduto}`}
              className="text-xs font-bold text-neutral-500 hover:text-neutral-800 transition-colors inline-flex items-center gap-1 shrink-0"
            >
              Ver detalhes <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {isAdmin && onAlterarExibicaoAdmin && (
        <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between gap-1 text-[11px]">
          <span className="font-bold text-neutral-500">Exibição:</span>
          <select
            value={produto.localCard || "CATALOGO_APENAS"}
            onChange={(e) => onAlterarExibicaoAdmin(idProduto, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="rounded-xl bg-neutral-100 border border-neutral-200 py-1 px-2 text-[11px] font-bold text-neutral-700 focus:outline-none"
          >
            <option value="HOME_DESTAQUE">Destaque</option>
            <option value="HOME_NOVIDADES">Novidades</option>
            <option value="HOME_PROMOCOES">Promoções</option>
            <option value="CATALOGO_APENAS">Apenas Catálogo</option>
          </select>
        </div>
      )}
    </div>
  )
}
