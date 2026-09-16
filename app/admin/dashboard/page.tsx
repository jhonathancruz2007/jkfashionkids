"use client"

import { useState, useEffect, useRef } from "react"
import { 
  LogOut, 
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  Settings, 
  Loader2, 
  Package, 
  UserCheck, 
  Plus, 
  Search,
  Key,
  ShieldCheck,
  Trash2,
  X,
  Image as ImageIcon,
  AlertTriangle,
  Eye,
  Pencil,
  MapPin,
  Camera,
  Upload,
  Tag,
  Baby,
  FolderPlus,
  CheckCircle,
  Menu,
  Star,
  RefreshCw,
  Palette
} from "lucide-react"

interface CategoriaItem {
  id?: string
  value: string
  label: string
}

interface TamanhoItem {
  id: string
  nome: string
}

interface CorItem {
  id: string
  nome: string
}

interface Produto {
  id: string
  nome: string
  descricao: string
  preco: number
  precoPromocional?: number | null
  imagemUrl: string
  imagens?: string[]
  estoque: number
  tamanhos: string[]
  cores?: string[]
  estoquePorTamanho?: Record<string, number>
  estoquePorCor?: Record<string, number | Record<string, number>>
  coresDetalhes?: Record<string, string>
  genero?: string
  localCard?: string
  categoria?: string | { value?: string; label?: string; id?: string; nome?: string }
  categoriaId?: string
  categoriaNome?: string
  faixaEtaria?: string
}

interface Cliente {
  id: string
  nome: string
  email: string
  role: "CLIENTE" | "ADMIN"
  createdAt: string
}

interface ItemPedido {
  id: string
  quantidade: number
  precoUnitario: number
  tamanho?: string
  cor?: string
  produto: {
    nome: string
    imagemUrl: string
  }
}

interface Pedido {
  id: string
  total: number
  status: "PENDENTE" | "PAGO" | "ENVIADO" | "ENTREGUE" | "CANCELADO" | string
  createdAt: string
  cliente: {
    nome: string
    email: string
  }
  itens: ItemPedido[]
}

interface ApiCategoria {
  id?: string
  value?: string
  label?: string
  nome?: string
}

interface ApiTamanho {
  id: string
  nome?: string
  value?: string
}

interface ApiCor {
  id: string
  nome?: string
  value?: string
}

const TAMANHOS_INICIAIS: string[] = [
  "RN", "P", "M", "G", "GG", "1", "2", "3", "4", "6", "8", "10", "12", "14", "16", "Unico", "Animais", "Normais"
]

const CORES_INICIAIS: string[] = [
  "Preto", "Branco", "Azul", "Rosa", "Vermelho", "Amarelo", "Verde", "Cinza", "Bege", "Marrom", "Roxo", "Laranja", "Estampado"
]

const CATEGORIAS_INICIAIS: CategoriaItem[] = [
  { value: "Conjuntos", label: "Conjuntos" },
  { value: "Vestidos", label: "Vestidos" },
  { value: "Blusas e Camisetas", label: "Blusas e Camisetas" },
  { value: "Calças e Shorts", label: "Calças e Shorts" },
  { value: "Calçados", label: "Calçados" },
  { value: "Acessórios", label: "Acessórios" },
]

const OPCOES_FAIXA_ETARIA = [
  { value: "todas", label: "Todas as idades" },
  { value: "0-1", label: "até 1 ano" },
  { value: "1-2", label: "1 a 2 anos" },
  { value: "3-5", label: "3 a 5 anos" },
  { value: "6-8", label: "6 a 8 anos" },
  { value: "9-plus", label: "+9 anos" },
]

const OPCOES_LOCAIS = [
  { value: "HOME_DESTAQUE", label: "Vitrine Destaques (Home)" },
  { value: "HOME_NOVIDADES", label: "Lançamentos / Novidades (Home)" },
  { value: "HOME_PROMOCOES", label: "Seção Promoções (Home)" },
  { value: "CATALOGO_GERAL", label: "Apenas no Catálogo Geral" },
]

// Normaliza textos com segurança para comparações de categoria.
function normalizar(texto: unknown = ""): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

const formatarMoeda = (valor: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0)
}

export default function PaginaDashboardAdmin() {
  const [abaAtiva, setAbaAtiva] = useState<"geral" | "produtos" | "pedidos" | "clientes" | "conta" | "config">("geral")
  const [saindo, setSaindo] = useState<boolean>(false)
  const [sidebarAberta, setSidebarAberta] = useState<boolean>(false)

  // ESTADO DINÂMICO DE CATEGORIAS
  const [categorias, setCategorias] = useState<CategoriaItem[]>(CATEGORIAS_INICIAIS)
  const [novaCategoriaLabel, setNovaCategoriaLabel] = useState<string>("")
  const [modalGerenciarCategorias, setModalGerenciarCategorias] = useState<boolean>(false)

  // ESTADO DINÂMICO DE TAMANHOS
  const [opcoesTamanhos, setOpcoesTamanhos] = useState<TamanhoItem[]>(
    TAMANHOS_INICIAIS.map((t, index) => ({ id: `temp-${index}`, nome: t }))
  )
  const [novoTamanho, setNovoTamanho] = useState<string>("")
  const [modalGerenciarTamanhos, setModalGerenciarTamanhos] = useState<boolean>(false)

  // ESTADO DINÂMICO DE CORES
  const [opcoesCores, setOpcoesCores] = useState<CorItem[]>(
    CORES_INICIAIS.map((c, index) => ({ id: `temp-cor-${index}`, nome: c }))
  )
  const [novaCor, setNovaCor] = useState<string>("")
  const [modalGerenciarCores, setModalGerenciarCores] = useState<boolean>(false)

  // INPUT MANUAL DE TAMANHO E COR NO MODAL DO PRODUTO
  const [tamanhoManualInput, setTamanhoManualInput] = useState<string>("")
  const [corManualInput, setCorManualInput] = useState<string>("")

  // ESTADOS DE PRODUTOS
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState<boolean>(false)
  const [buscaProduto, setBuscaProduto] = useState<string>("")
  const [modalProduto, setModalProduto] = useState<boolean>(false)
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null)
  const [salvandoProduto, setSalvandoProduto] = useState<boolean>(false)
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<Produto | null>(null)
  const [deletandoProduto, setDeletandoProduto] = useState<boolean>(false)

  // ESTADO DE SINCRONIZAÇÃO VIA API DO TINY ERP
  const [sincronizandoTiny, setSincronizandoTiny] = useState<boolean>(false)

  // Form Produto
  const [formNome, setFormNome] = useState<string>("")
  const [formDesc, setFormDesc] = useState<string>("")
  const [formPreco, setFormPreco] = useState<string>("")
  const [formPrecoPromocional, setFormPrecoPromocional] = useState<string>("")
  const [formEstoqueManual, setFormEstoqueManual] = useState<string>("0")
  
  // Múltiplas imagens
  const [formImagens, setFormImagens] = useState<string[]>([])
  const [novaUrlImagem, setNovaUrlImagem] = useState<string>("")

  const [formTamanhos, setFormTamanhos] = useState<string[]>([])
  const [formEstoquePorTamanho, setFormEstoquePorTamanho] = useState<Record<string, number>>({})
  
  const [formCores, setFormCores] = useState<string[]>([])
  const [formEstoquePorCor, setFormEstoquePorCor] = useState<Record<string, Record<string, number>>>({})
  const [formEstoquePorCorLegado, setFormEstoquePorCorLegado] = useState<Record<string, number>>({})
  const [matrizEstoqueAlterada, setMatrizEstoqueAlterada] = useState<boolean>(false)

  // Foto específica de cada cor do produto
  const [formImagensPorCor, setFormImagensPorCor] = useState<Record<string, string>>({})

  const [formGenero, setFormGenero] = useState<string>("masculino")
  const [formCategoria, setFormCategoria] = useState<string>("Conjuntos")
  const [formFaixaEtaria, setFormFaixaEtaria] = useState<string>("0-1") 
  const [formLocalCard, setFormLocalCard] = useState<string>("HOME_DESTAQUE")

  // Refs para inputs de arquivo e câmera
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // ESTADOS DE CLIENTES
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregandoClientes, setCarregandoClientes] = useState<boolean>(false)
  const [buscaCliente, setBuscaCliente] = useState<string>("")
  const [clienteParaExcluir, setClienteParaExcluir] = useState<Cliente | null>(null)
  const [deletandoCliente, setDeletandoCliente] = useState<boolean>(false)

  // ESTADOS DE PEDIDOS
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregandoPedidos, setCarregandoPedidos] = useState<boolean>(false)
  const [buscaPedido, setBuscaPedido] = useState<string>("")
  const [pedidoDetalhes, setPedidoDetalhes] = useState<Pedido | null>(null)
  const [atualizandoStatus, setAtualizandoStatus] = useState<string | null>(null)
  const [pedidoParaExcluir, setPedidoParaExcluir] = useState<Pedido | null>(null)
  const [deletandoPedido, setDeletandoPedido] = useState<boolean>(false)

  // ESTADOS MINHA CONTA & CONFIG
  const [nomeAdmin, setNomeAdmin] = useState<string>("Administrador")
  const [emailAdmin, setEmailAdmin] = useState<string>("admin@seusite.com")
  const [nomeLoja, setNomeLoja] = useState<string>("JKfashion Kids")

  // NOTIFICAÇÕES TOAST LOCAIS
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const exibirToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  // FUNÇÃO PARA SINCRONIZAR PRODUTOS/ESTOQUE DIRETO PELA API DO TINY
  const handleSincronizarTiny = async (
    tipo: "geral" | "estoque" | "novos_produtos" = "geral"
  ) => {
    if (sincronizandoTiny) return

    setSincronizandoTiny(true)

    try {
      console.log("=== INÍCIO DA SINCRONIZAÇÃO TINY ===")

      // ETAPA 1: baixa o catálogo apenas 1 vez.
      // O endpoint devolve os grupos e suas variações sem tentar processar
      // centenas de estoques dentro de uma única função serverless.
      const startRes = await fetch("/api/admin/produtos/sincronizar-tiny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", tipo }),
        cache: "no-store",
      })

      const startText = await startRes.text()
      let startData: any = {}

      try {
        startData = startText ? JSON.parse(startText) : {}
      } catch {
        throw new Error(
          `O servidor não retornou JSON válido ao iniciar a sincronização. HTTP ${startRes.status}`
        )
      }

      if (!startRes.ok || !startData.success) {
        throw new Error(
          startData.details ||
          startData.error ||
          `Erro HTTP ${startRes.status} ao iniciar a sincronização.`
        )
      }

      const grupos = Array.isArray(startData.groups) ? startData.groups : []

      console.log("Catálogo recebido:", startData.estatisticas)

      if (grupos.length === 0) {
        exibirToast("Nenhum produto encontrado no Tiny.", "error")
        return
      }

      let criados = 0
      let atualizados = 0
      let ignorados = 0
      let gruposProcessados = 0
      let totalVariacoesProcessadas = 0

      // O Tiny limita as chamadas concorrentes a 1/4 do limite do plano.
      // 5 é seguro até mesmo para o limite antigo de 20 chamadas/minuto.
      const batchSize = 5

      for (const group of grupos) {
        const variations = Array.isArray(group.variations)
          ? group.variations
          : []

        const stocks: Array<{ id: string; saldo: number }> = []
        let offset = 0

        while (offset < variations.length) {
          const stockRes = await fetch(
            "/api/admin/produtos/sincronizar-tiny",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "stock",
                tipo,
                variations,
                offset,
                batchSize,
              }),
              cache: "no-store",
            }
          )

          const stockText = await stockRes.text()
          let stockData: any = {}

          try {
            stockData = stockText ? JSON.parse(stockText) : {}
          } catch {
            throw new Error(
              `Resposta inválida ao consultar estoque. HTTP ${stockRes.status}`
            )
          }

          if (!stockRes.ok || !stockData.success) {
            throw new Error(
              stockData.details ||
              stockData.error ||
              `Erro HTTP ${stockRes.status} ao consultar estoque.`
            )
          }

          if (Array.isArray(stockData.stocks)) {
            stocks.push(...stockData.stocks)
          }

          offset = Number(stockData.nextOffset)
          totalVariacoesProcessadas += Array.isArray(stockData.stocks)
            ? stockData.stocks.length
            : 0

          const progresso =
            variations.length > 0
              ? Math.min(100, Math.round((offset / variations.length) * 100))
              : 100

          exibirToast(
            `Sincronizando ${group.nome}: ${progresso}% (${offset}/${variations.length})`
          )

          // Dá tempo para o limite por minuto do Tiny. Cada lote possui até 5
          // chamadas e o limite antigo é 20/min => cerca de 15 s por lote.
          const waitMs = Math.max(0, Number(stockData.waitMs) || 15300)
          if (offset < variations.length && waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs))
          }
        }

        // Produto simples pode não possuir variações na resposta de pesquisa.
        // Nesse caso, a própria lista ainda contém uma variação com o ID do produto.
        if (variations.length === 0) {
          exibirToast(`Finalizando ${group.nome}...`)
        }

        // ETAPA 3: grava somente este grupo. A operação é curta e não estoura
        // o tempo da função serverless.
        const finishRes = await fetch(
          "/api/admin/produtos/sincronizar-tiny",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "finish",
              tipo,
              group,
              stocks,
            }),
            cache: "no-store",
          }
        )

        const finishText = await finishRes.text()
        let finishData: any = {}

        try {
          finishData = finishText ? JSON.parse(finishText) : {}
        } catch {
          throw new Error(
            `Resposta inválida ao salvar ${group.nome}. HTTP ${finishRes.status}`
          )
        }

        if (!finishRes.ok || !finishData.success) {
          throw new Error(
            finishData.details ||
            finishData.error ||
            `Erro HTTP ${finishRes.status} ao salvar ${group.nome}.`
          )
        }

        if (finishData.status === "created") criados += 1
        else if (finishData.status === "updated") atualizados += 1
        else ignorados += 1

        gruposProcessados += 1

        exibirToast(
          `Produto ${gruposProcessados}/${grupos.length} sincronizado: ${group.nome}`
        )
      }

      await carregarProdutos()

      const resumo =
        `${criados} novos, ${atualizados} atualizados` +
        (ignorados > 0 ? `, ${ignorados} ignorados` : "")

      exibirToast(
        `Sincronização concluída: ${resumo}. ${totalVariacoesProcessadas} variações processadas.`
      )

      console.log("=== SINCRONIZAÇÃO TINY CONCLUÍDA ===")
    } catch (error) {
      console.error("=== ERRO NA SINCRONIZAÇÃO TINY ===")
      console.error(error)

      exibirToast(
        error instanceof Error
          ? error.message
          : "Erro de conexão ao tentar sincronizar.",
        "error"
      )
    } finally {
      setSincronizandoTiny(false)
    }
  }

  // BUSCAR CATEGORIAS DO BANCO DE DADOS (API)
  const carregarCategorias = async () => {
    try {
      const res = await fetch("/api/admin/categorias")
      if (res.ok) {
        const data: ApiCategoria[] = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const catsFormatadas: CategoriaItem[] = data
            .map((cat) => {
              // No schema atual, Categoria não possui id.
              // O campo identificador é "nome", que também é usado
              // pelo Produto através de "categoriaNome".
              const nome = String(
                cat.nome || cat.value || cat.label || ""
              ).trim()

              if (!nome) return null

              return {
                // Mantemos id somente por compatibilidade com respostas antigas.
                id: typeof cat.id === "string" ? cat.id : undefined,
                value: nome,
                label: nome,
              }
            })
            .filter(
              (cat): cat is CategoriaItem => cat !== null
            )
          setCategorias(catsFormatadas)
        }
      }
    } catch (error) {
      console.error("Erro ao carregar categorias da API:", error)
    }
  }

  // BUSCAR TAMANHOS DO BANCO DE DADOS (API)
  const carregarTamanhos = async () => {
    try {
      const res = await fetch("/api/admin/tamanhos")
      if (res.ok) {
        const data: ApiTamanho[] = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const tamanhosFormatados: TamanhoItem[] = data.map((t) => ({
            id: t.id,
            nome: t.nome || t.value || ""
          }))
          setOpcoesTamanhos(tamanhosFormatados)
        }
      }
    } catch (error) {
      console.error("Erro ao carregar tamanhos da API:", error)
    }
  }

  // BUSCAR CORES DO BANCO DE DADOS (API)
  const carregarCores = async () => {
    try {
      const res = await fetch("/api/admin/cores")
      if (res.ok) {
        const data: ApiCor[] = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const coresFormatadas: CorItem[] = data.map((c) => ({
            id: c.id,
            nome: c.nome || c.value || ""
          }))
          setOpcoesCores(coresFormatadas)
        }
      }
    } catch (error) {
      console.error("Erro ao carregar cores da API:", error)
    }
  }

  // HANDLERS DE CATEGORIAS
  const handleAdicionarCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeFormatado = novaCategoriaLabel.trim()
    if (!nomeFormatado) return

    try {
      const res = await fetch("/api/admin/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeFormatado }),
      })

      if (res.ok) {
        const novaCatBanco: ApiCategoria = await res.json()
        // Categoria usa "nome" como chave primária no Prisma.
        const nomeCategoria = String(
          novaCatBanco.nome ||
          novaCatBanco.value ||
          novaCatBanco.label ||
          nomeFormatado
        ).trim()

        const catItem: CategoriaItem = {
          id:
            typeof novaCatBanco.id === "string"
              ? novaCatBanco.id
              : undefined,
          value: nomeCategoria,
          label: nomeCategoria,
        }

        setCategorias((prev) => {
          if (prev.some((c) => c.value === catItem.value)) return prev
          return [...prev, catItem]
        })
        setFormCategoria(catItem.value)
        setNovaCategoriaLabel("")
        exibirToast(`Categoria "${nomeFormatado}" adicionada!`)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.erro || data.error || "Erro ao adicionar categoria.")
      }
    } catch (error) {
      console.error("Erro ao salvar categoria:", error)
      alert("Erro de conexão ao salvar categoria.")
    }
  }

  const handleDeletarCategoria = async (valueParaRemover: string) => {
    if (categorias.length <= 1) {
      alert("A loja precisa ter pelo menos uma categoria cadastrada.")
      return
    }

    try {
      const res = await fetch(`/api/admin/categorias/${encodeURIComponent(valueParaRemover)}`, {
        method: "DELETE",
      })

      if (res.ok) {
        const novasCategorias = categorias.filter((c) => c.value !== valueParaRemover)
        setCategorias(novasCategorias)

        if (formCategoria === valueParaRemover && novasCategorias.length > 0) {
          setFormCategoria(novasCategorias[0].value)
        }

        await carregarCategorias()
        exibirToast("Categoria removida com sucesso!")
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.erro || data.error || "Não foi possível excluir a categoria.")
      }
    } catch (error) {
      console.error("Erro ao excluir categoria:", error)
      alert("Erro de conexão ao excluir categoria.")
    }
  }

  // HANDLERS DE TAMANHOS GLOBAIS
  const handleAdicionarTamanho = async (e: React.FormEvent) => {
    e.preventDefault()
    const tamFormatado = novoTamanho.trim()
    if (!tamFormatado) return

    if (opcoesTamanhos.some((t) => (t.nome || "").toLowerCase() === tamFormatado.toLowerCase())) {
      alert("Este tamanho já existe no banco!")
      return
    }

    try {
      const res = await fetch("/api/admin/tamanhos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: tamFormatado }),
      })

      if (res.ok) {
        const novoTamBanco: ApiTamanho = await res.json()
        setOpcoesTamanhos((prev) => [
          ...prev, 
          { id: novoTamBanco.id || String(Date.now()), nome: novoTamBanco.nome || tamFormatado }
        ])
        setNovoTamanho("")
        exibirToast(`Tamanho "${tamFormatado}" adicionado!`)
      } else {
        setOpcoesTamanhos((prev) => [...prev, { id: `local-${Date.now()}`, nome: tamFormatado }])
        setNovoTamanho("")
      }
    } catch (error) {
      console.error("Erro ao salvar tamanho:", error)
      setOpcoesTamanhos((prev) => [...prev, { id: `local-${Date.now()}`, nome: tamFormatado }])
      setNovoTamanho("")
    }
  }

  const handleDeletarTamanho = async (tamanhoItem: string | { id: string; nome: string }) => {
    const idParaDeletar = typeof tamanhoItem === 'object' ? tamanhoItem.id : tamanhoItem
    const nomeParaFiltro = typeof tamanhoItem === 'object' ? tamanhoItem.nome : tamanhoItem

    if (idParaDeletar.startsWith("temp-") || idParaDeletar.startsWith("local-")) {
      setOpcoesTamanhos((prev) => prev.filter((t) => t.id !== idParaDeletar && t.nome !== nomeParaFiltro))
      if (formTamanhos.includes(nomeParaFiltro)) {
        handleRemoverTamanhoDoProduto(nomeParaFiltro)
      }
      exibirToast("Tamanho removido!")
      return
    }

    try {
      const res = await fetch(`/api/admin/tamanhos/${idParaDeletar}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const erroData = await res.json().catch(() => null)
        throw new Error(erroData?.erro || `Erro HTTP: ${res.status}`)
      }

      setOpcoesTamanhos((prev) => prev.filter((t) => t.id !== idParaDeletar && t.nome !== nomeParaFiltro))

      if (formTamanhos.includes(nomeParaFiltro)) {
        handleRemoverTamanhoDoProduto(nomeParaFiltro)
      }
      exibirToast("Tamanho excluído do banco!")
    } catch (error: any) {
      console.error("Detalhe do erro ao deletar tamanho:", error)
      setOpcoesTamanhos((prev) => prev.filter((t) => t.id !== idParaDeletar && t.nome !== nomeParaFiltro))
      if (formTamanhos.includes(nomeParaFiltro)) {
        handleRemoverTamanhoDoProduto(nomeParaFiltro)
      }
    }
  }

  // HANDLERS DE CORES GLOBAIS
  const handleAdicionarCor = async (e: React.FormEvent) => {
    e.preventDefault()
    const corFormatada = novaCor.trim()
    if (!corFormatada) return

    if (opcoesCores.some((c) => (c.nome || "").toLowerCase() === corFormatada.toLowerCase())) {
      alert("Esta cor já existe no banco!")
      return
    }

    try {
      const res = await fetch("/api/admin/cores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: corFormatada }),
      })

      if (res.ok) {
        const novaCorBanco: ApiCor = await res.json()
        setOpcoesCores((prev) => [
          ...prev, 
          { id: novaCorBanco.id || String(Date.now()), nome: novaCorBanco.nome || corFormatada }
        ])
        setNovaCor("")
        exibirToast(`Cor "${corFormatada}" adicionada!`)
      } else {
        setOpcoesCores((prev) => [...prev, { id: `local-cor-${Date.now()}`, nome: corFormatada }])
        setNovaCor("")
      }
    } catch (error) {
      console.error("Erro ao salvar cor:", error)
      setOpcoesCores((prev) => [...prev, { id: `local-cor-${Date.now()}`, nome: corFormatada }])
      setNovaCor("")
    }
  }

  const handleDeletarCor = async (corItem: string | { id: string; nome: string }) => {
    const idParaDeletar = typeof corItem === 'object' ? corItem.id : corItem
    const nomeParaFiltro = typeof corItem === 'object' ? corItem.nome : corItem

    if (idParaDeletar.startsWith("temp-cor-") || idParaDeletar.startsWith("local-cor-")) {
      setOpcoesCores((prev) => prev.filter((c) => c.id !== idParaDeletar && c.nome !== nomeParaFiltro))
      if (formCores.includes(nomeParaFiltro)) {
        handleRemoverCorDoProduto(nomeParaFiltro)
      }
      exibirToast("Cor removida!")
      return
    }

    try {
      const res = await fetch(`/api/admin/cores/${idParaDeletar}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const erroData = await res.json().catch(() => null)
        throw new Error(erroData?.erro || `Erro HTTP: ${res.status}`)
      }

      setOpcoesCores((prev) => prev.filter((c) => c.id !== idParaDeletar && c.nome !== nomeParaFiltro))

      if (formCores.includes(nomeParaFiltro)) {
        handleRemoverCorDoProduto(nomeParaFiltro)
      }
      exibirToast("Cor excluída do banco!")
    } catch (error: any) {
      console.error("Detalhe do erro ao deletar cor:", error)
      setOpcoesCores((prev) => prev.filter((c) => c.id !== idParaDeletar && c.nome !== nomeParaFiltro))
      if (formCores.includes(nomeParaFiltro)) {
        handleRemoverCorDoProduto(nomeParaFiltro)
      }
    }
  }

  // GERENCIAMENTO DE TAMANHOS NO PRODUTO ATUAL
  const toggleTamanho = (tam: string) => {
    setFormTamanhos((prev) => {
      const existe = prev.includes(tam)
      if (existe) {
        const novosTamanhos = prev.filter((t) => t !== tam)
        const novoEstoque = { ...formEstoquePorTamanho }
        delete novoEstoque[tam]
        setFormEstoquePorTamanho(novoEstoque)

        setFormEstoquePorCor((prevEstoque) => {
          const novo: Record<string, Record<string, number>> = {}
          Object.entries(prevEstoque).forEach(([cor, tamanhos]) => {
            const linha = { ...tamanhos }
            delete linha[tam]
            novo[cor] = linha
          })
          return novo
        })

        setMatrizEstoqueAlterada(true)
        return novosTamanhos
      } else {
        setFormEstoquePorTamanho((prevEstoque) => ({
          ...prevEstoque,
          [tam]: prevEstoque[tam] ?? 0,
        }))
        setFormEstoquePorCor((prevEstoque) => {
          const novo: Record<string, Record<string, number>> = {}
          Object.entries(prevEstoque).forEach(([cor, tamanhos]) => {
            novo[cor] = { ...tamanhos, [tam]: tamanhos?.[tam] ?? 0 }
          })
          return novo
        })
        setMatrizEstoqueAlterada(true)
        return [...prev, tam]
      }
    })
  }

  const handleRemoverTamanhoDoProduto = (tamNome: string) => {
    setFormTamanhos((prev) => prev.filter((t) => t !== tamNome))
    setFormEstoquePorTamanho((prev) => {
      const novo = { ...prev }
      delete novo[tamNome]
      return novo
    })
    setFormEstoquePorCor((prev) => {
      const novo: Record<string, Record<string, number>> = {}
      Object.entries(prev).forEach(([cor, tamanhos]) => {
        const linha = { ...tamanhos }
        delete linha[tamNome]
        novo[cor] = linha
      })
      return novo
    })
    setMatrizEstoqueAlterada(true)
  }

  const handleAdicionarTamanhoManualAoProduto = () => {
    const nomeFormatado = tamanhoManualInput.trim()
    if (!nomeFormatado) return

    if (!formTamanhos.includes(nomeFormatado)) {
      setFormTamanhos((prev) => [...prev, nomeFormatado])
      setFormEstoquePorTamanho((prev) => ({
        ...prev,
        [nomeFormatado]: prev[nomeFormatado] ?? 0,
      }))
      setFormEstoquePorCor((prev) => {
        const novo: Record<string, Record<string, number>> = {}
        Object.entries(prev).forEach(([cor, tamanhos]) => {
          novo[cor] = { ...tamanhos, [nomeFormatado]: tamanhos?.[nomeFormatado] ?? 0 }
        })
        return novo
      })
    }

    if (!opcoesTamanhos.some((t) => (t.nome || "").toLowerCase() === nomeFormatado.toLowerCase())) {
      setOpcoesTamanhos((prev) => [...prev, { id: `local-${Date.now()}`, nome: nomeFormatado }])
    }

    setMatrizEstoqueAlterada(true)
    setTamanhoManualInput("")
  }

  const handleQtdTamanhoChange = (tamanho: string, quantidade: number) => {
    setFormEstoquePorTamanho((prev) => ({
      ...prev,
      [tamanho]: Math.max(0, quantidade),
    }))
  }

  // GERENCIAMENTO DE CORES NO PRODUTO ATUAL
  const toggleCor = (cor: string) => {
    setFormCores((prev) => {
      const existe = prev.includes(cor)

      if (existe) {
        const novasCores = prev.filter((c) => c !== cor)

        setFormEstoquePorCor((prevEstoque) => {
          const novo = { ...prevEstoque }
          delete novo[cor]
          return novo
        })

        setFormEstoquePorCorLegado((prevEstoque) => {
          const novo = { ...prevEstoque }
          delete novo[cor]
          return novo
        })

        setFormImagensPorCor((prevImagens) => {
          const novo = { ...prevImagens }
          delete novo[cor]
          return novo
        })

        setMatrizEstoqueAlterada(true)
        return novasCores
      }

      setFormEstoquePorCor((prevEstoque) => ({
        ...prevEstoque,
        [cor]: formTamanhos.reduce((acc, tam) => ({
          ...acc,
          [tam]: prevEstoque[cor]?.[tam] ?? 0,
        }), {} as Record<string, number>),
      }))

      if (formTamanhos.length === 0) {
        setFormEstoquePorCorLegado((prevEstoque) => ({
          ...prevEstoque,
          [cor]: prevEstoque[cor] ?? 0,
        }))
      }

      setMatrizEstoqueAlterada(formTamanhos.length > 0 ? true : false)
      return [...prev, cor]
    })
  }

  const handleRemoverCorDoProduto = (corNome: string) => {
    setFormCores((prev) => prev.filter((c) => c !== corNome))
    setFormEstoquePorCor((prev) => {
      const novo = { ...prev }
      delete novo[corNome]
      return novo
    })
    setFormEstoquePorCorLegado((prev) => {
      const novo = { ...prev }
      delete novo[corNome]
      return novo
    })
    setMatrizEstoqueAlterada(true)
    setFormImagensPorCor((prev) => {
      const novo = { ...prev }
      delete novo[corNome]
      return novo
    })
  }

  const handleAdicionarCorManualAoProduto = () => {
    const nomeFormatado = corManualInput.trim()
    if (!nomeFormatado) return

    if (!formCores.includes(nomeFormatado)) {
      setFormCores((prev) => [...prev, nomeFormatado])
      setFormEstoquePorCor((prev) => ({
        ...prev,
        [nomeFormatado]: formTamanhos.reduce((acc, tam) => ({
          ...acc,
          [tam]: 0,
        }), {} as Record<string, number>),
      }))
      if (formTamanhos.length === 0) {
        setFormEstoquePorCorLegado((prev) => ({
          ...prev,
          [nomeFormatado]: prev[nomeFormatado] ?? 0,
        }))
      }
    }

    if (!opcoesCores.some((c) => (c.nome || "").toLowerCase() === nomeFormatado.toLowerCase())) {
      setOpcoesCores((prev) => [...prev, { id: `local-cor-${Date.now()}`, nome: nomeFormatado }])
    }

    setMatrizEstoqueAlterada(true)
    setCorManualInput("")
  }

  const handleImagemCorFileChange = (cor: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      e.target.value = ""
      return
    }

    const reader = new FileReader()

    reader.onloadend = () => {
      const result = reader.result as string

      if (result) {
        setFormImagensPorCor((prev) => ({
          ...prev,
          [cor]: result,
        }))
      }
    }

    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const handleImagemCorUrlChange = (cor: string, url: string) => {
    setFormImagensPorCor((prev) => ({
      ...prev,
      [cor]: url,
    }))
  }

  const handleRemoverImagemCor = (cor: string) => {
    setFormImagensPorCor((prev) => {
      const novo = { ...prev }
      delete novo[cor]
      return novo
    })
  }

  const handleQtdCorSemTamanhoChange = (cor: string, quantidade: number) => {
    setFormEstoquePorCorLegado((prev) => ({
      ...prev,
      [cor]: Math.max(0, quantidade),
    }))
  }

  const handleQtdCorTamanhoChange = (cor: string, tamanho: string, quantidade: number) => {
    setFormEstoquePorCor((prev) => ({
      ...prev,
      [cor]: {
        ...(prev[cor] || {}),
        [tamanho]: Math.max(0, quantidade),
      },
    }))
    setMatrizEstoqueAlterada(true)
  }

  const obterEstoqueDaMatriz = (cor: string, tamanho: string) => {
    return Number(formEstoquePorCor[cor]?.[tamanho] ?? 0) || 0
  }

  // Converte o estoque de uma cor para um número seguro para exibição.
  // O Tiny pode fornecer:
  //   "Azul": 6
  // ou:
  //   "Azul": { P: 2, M: 3, G: 1 }
  const obterTotalEstoqueCorProduto = (
    produto: Produto,
    cor: string
  ): number => {
    const valor = produto.estoquePorCor?.[cor]

    if (typeof valor === "number") {
      return Math.max(0, valor)
    }

    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      return Object.values(valor).reduce(
        (total, quantidade) => total + (Number(quantidade) || 0),
        0
      )
    }

    return 0
  }

  const totalEstoqueMatriz = formCores.reduce(
    (total, cor) =>
      total + formTamanhos.reduce(
        (subtotal, tam) => subtotal + obterEstoqueDaMatriz(cor, tam),
        0
      ),
    0
  )

  const totalEstoqueLegado = formCores.reduce(
    (total, cor) => total + (formEstoquePorCorLegado[cor] || 0),
    0
  )

  const totalEstoqueCalculado = formCores.length > 0 && formTamanhos.length > 0
    ? (matrizEstoqueAlterada || Object.keys(formEstoquePorCorLegado).length === 0
        ? totalEstoqueMatriz
        : totalEstoqueLegado)
    : formTamanhos.length > 0
    ? formTamanhos.reduce((acc, tam) => acc + (formEstoquePorTamanho[tam] || 0), 0)
    : formCores.length > 0
    ? totalEstoqueLegado
    : 0

  const estoquePorCorFinal = formCores.length > 0 && formTamanhos.length > 0
    ? (matrizEstoqueAlterada || Object.keys(formEstoquePorCorLegado).length === 0
        ? formEstoquePorCor
        : formEstoquePorCorLegado)
    : formCores.reduce((acc, cor) => {
        acc[cor] = formEstoquePorCorLegado[cor] ?? 0
        return acc
      }, {} as Record<string, number>)

  const estoquePorTamanhoFinal = formCores.length > 0 && formTamanhos.length > 0
    ? formTamanhos.reduce((acc, tam) => {
        acc[tam] = formCores.reduce(
          (total, cor) => total + obterEstoqueDaMatriz(cor, tam),
          0
        )
        return acc
      }, {} as Record<string, number>)
    : formEstoquePorTamanho

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        if (result) {
          setFormImagens((prev) => [...prev, result])
        }
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ""
  }

  const handleAdicionarUrlImagem = () => {
    if (!novaUrlImagem.trim()) return
    setFormImagens((prev) => [...prev, novaUrlImagem.trim()])
    setNovaUrlImagem("")
  }

  const handleDefinirCapaImagem = (index: number) => {
    if (index === 0) return
    setFormImagens((prev) => {
      const novas = [...prev]
      const [item] = novas.splice(index, 1)
      novas.unshift(item)
      return novas
    })
    exibirToast("Imagem definida como capa principal!")
  }

  const handleRemoverImagem = (index: number) => {
    setFormImagens((prev) => prev.filter((_, i) => i !== index))
  }

  const carregarProdutos = async () => {
    setCarregandoProdutos(true)
    try {
      const res = await fetch("/api/admin/produtos")
      if (res.ok) {
        const data: Produto[] = await res.json()
        setProdutos(data)
      }
    } catch (err) {
      console.error("Erro ao carregar produtos:", err)
    } finally {
      setCarregandoProdutos(false)
    }
  }

  const carregarClientes = async () => {
    setCarregandoClientes(true)
    try {
      const res = await fetch("/api/admin/clientes")
      if (res.ok) setClientes(await res.json())
    } catch (err) {
      console.error("Erro ao carregar clientes:", err)
    } finally {
      setCarregandoClientes(false)
    }
  }

  const carregarPedidos = async () => {
    setCarregandoPedidos(true)
    try {
      const res = await fetch("/api/admin/pedidos")
      if (res.ok) setPedidos(await res.json())
    } catch (err) {
      console.error("Erro ao carregar pedidos:", err)
    } finally {
      setCarregandoPedidos(false)
    }
  }

  useEffect(() => {
    carregarCategorias()
    carregarTamanhos()
    carregarCores()
    if (abaAtiva === "produtos" || abaAtiva === "geral") carregarProdutos()
    if (abaAtiva === "clientes" || abaAtiva === "geral") carregarClientes()
    if (abaAtiva === "pedidos" || abaAtiva === "geral") carregarPedidos()
  }, [abaAtiva])

  const handleMudarAba = (aba: typeof abaAtiva) => {
    setAbaAtiva(aba)
    setSidebarAberta(false)
  }

  const handleAbrirNovoProduto = () => {
    setProdutoEditando(null)
    setFormNome("")
    setFormDesc("")
    setFormPreco("")
    setFormPrecoPromocional("")
    setFormEstoqueManual("0")
    setFormImagens([])
    setNovaUrlImagem("")
    setFormTamanhos([])
    setFormEstoquePorTamanho({})
    setFormCores([])
    setFormEstoquePorCor({})
    setFormEstoquePorCorLegado({})
    setMatrizEstoqueAlterada(false)
    setFormImagensPorCor({})
    setTamanhoManualInput("")
    setCorManualInput("")
    setFormGenero("masculino")
    setFormCategoria(categorias[0]?.value || "Conjuntos")
    setFormFaixaEtaria("0-1")
    setFormLocalCard("HOME_DESTAQUE")
    setModalProduto(true)
  }

  const handleAbrirEditarProduto = (prod: Produto) => {
    setProdutoEditando(prod)
    setFormNome(prod.nome || "")
    setFormDesc(prod.descricao || "")
    setFormPreco(prod.preco !== undefined && prod.preco !== null ? prod.preco.toString() : "")
    setFormPrecoPromocional(prod.precoPromocional !== undefined && prod.precoPromocional !== null ? prod.precoPromocional.toString() : "")
    setFormEstoqueManual(prod.estoque !== undefined && prod.estoque !== null ? prod.estoque.toString() : "0")
    
    let imgs: string[] = []
    if (prod.imagens && prod.imagens.length > 0) {
      imgs = [...prod.imagens]
    } else if (prod.imagemUrl) {
      imgs = [prod.imagemUrl]
    }
    setFormImagens(imgs)
    setNovaUrlImagem("")
    setTamanhoManualInput("")
    setCorManualInput("")

    setFormTamanhos(prod.tamanhos || [])
    setFormCores(prod.cores || [])
    setFormGenero(prod.genero || "masculino")
    
    // No schema atual, a categoria real do produto está em categoriaNome.
    // Mantemos compatibilidade com dados antigos que possam trazer categoria,
    // categoriaId ou um objeto de categoria.
    let catValor =
      String(prod.categoriaNome || "").trim()

    if (!catValor) {
      if (
        typeof prod.categoria === "object" &&
        prod.categoria !== null
      ) {
        catValor = String(
          prod.categoria.nome ||
          prod.categoria.value ||
          prod.categoria.label ||
          prod.categoria.id ||
          ""
        ).trim()
      } else if (typeof prod.categoria === "string") {
        catValor = prod.categoria.trim()
      } else if (prod.categoriaId) {
        catValor = String(prod.categoriaId).trim()
      }
    }

    const catExiste = categorias.find(
      (c) =>
        normalizar(c.value) === normalizar(catValor) ||
        normalizar(c.label) === normalizar(catValor)
    )

    setFormCategoria(
      catExiste?.value ||
      catValor ||
      categorias[0]?.value ||
      "Conjuntos"
    )

    setFormFaixaEtaria(prod.faixaEtaria || "0-1") 
    setFormLocalCard(prod.localCard || "HOME_DESTAQUE")

    // Nunca distribua o estoque total artificialmente.
    // Os valores abaixo devem vir diretamente do Tiny ou do cadastro manual.
    setFormEstoquePorTamanho(
      prod.estoquePorTamanho ? { ...prod.estoquePorTamanho } : {}
    )

    const estoqueCorBruto =
      prod.estoquePorCor && typeof prod.estoquePorCor === "object"
        ? prod.estoquePorCor
        : {}

    const matrizCarregada: Record<string, Record<string, number>> = {}
    const legadoCarregado: Record<string, number> = {}
    let encontrouMatriz = false

    Object.entries(estoqueCorBruto).forEach(([cor, valor]) => {
      if (valor && typeof valor === "object" && !Array.isArray(valor)) {
        const linha: Record<string, number> = {}
        Object.entries(valor as Record<string, any>).forEach(([tam, qtd]) => {
          linha[tam] = Math.max(0, Number(qtd) || 0)
        })
        matrizCarregada[cor] = linha
        encontrouMatriz = true
      } else {
        legadoCarregado[cor] = Math.max(0, Number(valor) || 0)
      }
    })

    const matrizCompleta: Record<string, Record<string, number>> = {}
    ;(prod.cores || []).forEach((cor) => {
      matrizCompleta[cor] = {}
      ;(prod.tamanhos || []).forEach((tam) => {
        matrizCompleta[cor][tam] = matrizCarregada[cor]?.[tam] ?? 0
      })
    })

    setFormEstoquePorCor(matrizCompleta)
    setFormEstoquePorCorLegado(legadoCarregado)
    setMatrizEstoqueAlterada(encontrouMatriz)

    // Recupera as fotos específicas das cores.
    // Aceita tanto { "Azul": "url" } quanto
    // o formato { "Azul": { imagemUrl: "url" } }.
    const imagensPorCor =
      prod.coresDetalhes && typeof prod.coresDetalhes === "object"
        ? Object.entries(prod.coresDetalhes).reduce((acc, [cor, valor]) => {
            if (typeof valor === "string" && valor.trim()) {
              acc[cor] = valor
            } else if (valor && typeof valor === "object" && "imagemUrl" in valor) {
              const imagemUrl = String((valor as any).imagemUrl || "").trim()
              if (imagemUrl) acc[cor] = imagemUrl
            }
            return acc
          }, {} as Record<string, string>)
        : {}

    setFormImagensPorCor(imagensPorCor)

    setModalProduto(true)
  }

  const handleSalvarProduto = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvandoProduto(true)

    const url = produtoEditando ? `/api/admin/produtos/${produtoEditando.id}` : "/api/admin/produtos"
    const method = produtoEditando ? "PUT" : "POST"

    const imagemPrincipal = formImagens.length > 0 ? formImagens[0] : ""
    const precoParsed = parseFloat(String(formPreco).replace(",", "."))
    const precoPromocionalParsed = formPrecoPromocional ? parseFloat(String(formPrecoPromocional).replace(",", ".")) : null

    const estoqueFinal = (formTamanhos.length > 0 || formCores.length > 0) 
      ? totalEstoqueCalculado 
      : (parseInt(formEstoqueManual) || 0)

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(produtoEditando?.id ? { id: produtoEditando.id } : {}),
          nome: formNome,
          descricao: formDesc,
          preco: isNaN(precoParsed) ? 0 : precoParsed,
          precoPromocional: precoPromocionalParsed !== null && !isNaN(precoPromocionalParsed) ? precoPromocionalParsed : null,
          imagemUrl: imagemPrincipal,
          imagens: formImagens,
          estoque: estoqueFinal,
          tamanhos: formTamanhos,
          estoquePorTamanho: estoquePorTamanhoFinal,
          cores: formCores,
          estoquePorCor: estoquePorCorFinal,
          coresDetalhes: formImagensPorCor,
          genero: formGenero,
          categoriaId: formCategoria,
          faixaEtaria: formFaixaEtaria,
          localCard: formLocalCard,
        }),
      })

      if (res.ok) {
        setModalProduto(false)
        setProdutoEditando(null)
        exibirToast(produtoEditando ? "Produto atualizado com sucesso!" : "Produto cadastrado com sucesso!")
        carregarProdutos()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || data.message || "Erro ao salvar produto.")
      }
    } catch (err) {
      console.error("Erro de conexão ao salvar produto:", err)
      alert("Erro de conexão ao salvar produto.")
    } finally {
      setSalvandoProduto(false)
    }
  }

  const handleConfirmarExclusao = async () => {
    if (!produtoParaExcluir) return
    setDeletandoProduto(true)
    try {
      const res = await fetch(`/api/admin/produtos/${produtoParaExcluir.id}`, { method: "DELETE" })
      if (res.ok) {
        setProdutoParaExcluir(null)
        exibirToast("Produto excluído com sucesso!")
        carregarProdutos()
      } else {
        alert("Erro ao excluir produto.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setDeletandoProduto(false)
    }
  }

  const handleConfirmarExclusaoCliente = async () => {
    if (!clienteParaExcluir) return
    setDeletandoCliente(true)
    try {
      const res = await fetch(`/api/admin/clientes/${clienteParaExcluir.id}`, { method: "DELETE" })
      if (res.ok) {
        setClienteParaExcluir(null)
        exibirToast("Conta de cliente excluída!")
        carregarClientes()
      } else {
        alert("Erro ao excluir cliente.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setDeletandoCliente(false)
    }
  }

  const handleConfirmarExclusaoPedido = async () => {
    if (!pedidoParaExcluir) return
    setDeletandoPedido(true)
    try {
      const res = await fetch(`/api/admin/pedidos/${pedidoParaExcluir.id}`, { method: "DELETE" })
      if (res.ok) {
        setPedidoParaExcluir(null)
        exibirToast("Venda excluída e estoque estornado!")
        carregarPedidos()
        carregarProdutos()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || "Erro ao excluir o pedido.")
      }
    } catch (err) {
      console.error("Erro ao excluir venda:", err)
      alert("Erro ao tentar excluir a venda.")
    } finally {
      setDeletandoPedido(false)
    }
  }

  const handleMudarStatusPedido = async (id: string, novoStatus: string) => {
    setAtualizandoStatus(id)
    try {
      const res = await fetch(`/api/admin/pedidos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      })

      if (res.ok) {
        exibirToast(`Status do pedido alterado para ${novoStatus}!`)
        carregarPedidos()
      } else {
        alert("Erro ao alterar status do pedido.")
      }
    } catch (err) {
      console.error("Erro ao alterar status:", err)
    } finally {
      setAtualizandoStatus(null)
    }
  }

  const handleLogout = async () => {
    setSaindo(true)
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" })
      window.location.href = "/admin/login"
    } catch (error) {
      console.error("Erro ao deslogar admin:", error)
      setSaindo(false)
    }
  }

  const produtosFiltrados = produtos.filter((p) => (p.nome || "").toLowerCase().includes(buscaProduto.toLowerCase()))
  const clientesFiltrados = clientes.filter(
    (c) => (c.nome || "").toLowerCase().includes(buscaCliente.toLowerCase()) || (c.email || "").toLowerCase().includes(buscaCliente.toLowerCase())
  )
  const pedidosFiltrados = pedidos.filter(
    (p) =>
      (p.id || "").toLowerCase().includes(buscaPedido.toLowerCase()) ||
      (p.cliente?.nome || "").toLowerCase().includes(buscaPedido.toLowerCase()) ||
      (p.cliente?.email || "").toLowerCase().includes(buscaPedido.toLowerCase())
  )

  const totalVendas = pedidos.reduce((acc, p) => acc + (p.total || 0), 0)

  const obterLabelCategoria = (prod: Produto) => {
    let catVal = ""
    let catLabel = ""

    // A chave oficial da relação é Produto.categoriaNome.
    catVal = String(prod.categoriaNome || "").trim()

    if (!catVal) {
      if (
        typeof prod.categoria === "object" &&
        prod.categoria !== null
      ) {
        catVal = String(
          prod.categoria.nome ||
          prod.categoria.value ||
          prod.categoria.label ||
          prod.categoria.id ||
          ""
        ).trim()
      } else if (typeof prod.categoria === "string") {
        catVal = prod.categoria.trim()
      } else if (prod.categoriaId) {
        catVal = String(prod.categoriaId).trim()
      }

      catLabel = catVal
    } else {
      catLabel = catVal
    }

    const enc = categorias.find(
      (c) =>
        normalizar(c.value) === normalizar(catVal) ||
        normalizar(c.label) === normalizar(catLabel)
    )

    return enc?.label || catLabel || catVal || "Sem Categoria"
  }

  return (
    <div className="fixed inset-0 z-[999] flex flex-col md:flex-row bg-slate-950 text-slate-100 font-sans w-screen h-screen overflow-hidden">
      
      {/* TOAST FEEDBACK NOTIFICATION */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-[200] flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border text-xs font-bold shadow-2xl animate-in slide-in-from-top-3 duration-200 ${
          toastMessage.type === 'error' 
            ? 'border-rose-500/30 text-rose-400' 
            : 'border-emerald-500/30 text-emerald-400'
        }`}>
          {toastMessage.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* HEADER MOBILE */}
      <header className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 shrink-0 z-30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-rose-600 flex items-center justify-center font-bold text-white shadow-lg shadow-rose-600/20">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <span className="font-bold text-sm text-white block leading-none">Admin Hub</span>
            <span className="text-[9px] text-slate-400 font-medium">Gestão Interna</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarAberta(!sidebarAberta)}
          className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-950 border border-slate-800"
        >
          {sidebarAberta ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* BACKDROP MOBILE DA SIDEBAR */}
      {sidebarAberta && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarAberta(false)}
        />
      )}

      {/* SIDEBAR RESPONSIVA */}
      <aside className={`
        fixed md:relative inset-y-0 left-0 z-50 md:z-auto
        w-64 border-r border-slate-800 bg-slate-900 p-6 flex flex-col justify-between shrink-0 h-full overflow-y-auto
        transition-transform duration-300 ease-in-out
        ${sidebarAberta ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="space-y-8">
          <div className="hidden md:flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-rose-600 flex items-center justify-center font-bold text-white shadow-lg shadow-rose-600/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-base text-white block leading-none">Admin Hub</span>
              <span className="text-[10px] text-slate-400 font-medium">Gestão Interna</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              type="button"
              onClick={() => handleMudarAba("geral")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "geral" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" /> Visão Geral
            </button>

            <button
              type="button"
              onClick={() => handleMudarAba("produtos")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "produtos" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Package className="h-4 w-4" /> Produtos
            </button>

            <button
              type="button"
              onClick={() => handleMudarAba("pedidos")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "pedidos" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <ShoppingBag className="h-4 w-4" /> Pedidos
            </button>

            <button
              type="button"
              onClick={() => handleMudarAba("clientes")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "clientes" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Users className="h-4 w-4" /> Clientes
            </button>

            <button
              type="button"
              onClick={() => handleMudarAba("conta")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "conta" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <UserCheck className="h-4 w-4" /> Minha Conta
            </button>

            <button
              type="button"
              onClick={() => handleMudarAba("config")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "config" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Settings className="h-4 w-4" /> Configurações
            </button>
          </nav>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={saindo}
          className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-600 hover:text-white transition-all text-sm font-bold disabled:opacity-50 mt-6"
        >
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sair do Admin
        </button>
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-full">

        {/* ABA: VISÃO GERAL */}
        {abaAtiva === "geral" && (
          <div className="space-y-6 md:space-y-8 max-w-6xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Visão Geral</h1>
                <p className="text-xs text-slate-400 mt-1">Acompanhe as estatísticas principais da loja.</p>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSincronizarTiny("geral")}
                  disabled={sincronizandoTiny}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors flex items-center gap-2 text-xs font-semibold disabled:opacity-50 shrink-0"
                >
                  {sincronizandoTiny ? <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" /> : <RefreshCw className="h-3.5 w-3.5 text-rose-500" />}
                  <span>{sincronizandoTiny ? "Sincronizando Tiny..." : "Sincronizar Tiny (API)"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    carregarProdutos()
                    carregarClientes()
                    carregarPedidos()
                    exibirToast("Dados atualizados!")
                  }}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors flex items-center gap-2 text-xs font-semibold"
                  title="Atualizar dados"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Vendas Totais</span>
                <p className="text-xl md:text-2xl font-bold text-emerald-400 mt-2">
                  {formatarMoeda(totalVendas)}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Total de Pedidos</span>
                <p className="text-xl md:text-2xl font-bold text-white mt-2">{pedidos.length}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Produtos Cadastrados</span>
                <p className="text-xl md:text-2xl font-bold text-white mt-2">{produtos.length}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Clientes</span>
                <p className="text-xl md:text-2xl font-bold text-white mt-2">{clientes.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* ABA: PRODUTOS */}
        {abaAtiva === "produtos" && (
          <div className="space-y-6 max-w-6xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h1>
                <p className="text-xs text-slate-400 mt-1">Cadastre, edite e sincronize estoque, tamanhos e cores diretamente com o Tiny.</p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSincronizarTiny("geral")}
                  disabled={sincronizandoTiny}
                  className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 text-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shrink-0 disabled:opacity-50"
                >
                  {sincronizandoTiny ? <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> : <RefreshCw className="h-4 w-4 text-rose-500" />}
                  <span>{sincronizandoTiny ? "Sincronizando..." : "Sincronizar Tiny (API)"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAbrirNovoProduto}
                  className="flex items-center justify-center gap-2 bg-rose-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/20 shrink-0"
                >
                  <Plus className="h-4 w-4" /> Cadastrar Produto
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={buscaProduto}
                  onChange={(e) => setBuscaProduto(e.target.value)}
                  placeholder="Buscar produtos pelo nome..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {carregandoProdutos ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando produtos...
                </div>
              ) : produtosFiltrados.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs font-medium">
                  Nenhum produto encontrado.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                  <table className="w-full text-left text-xs text-slate-300 min-w-[700px]">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3">Imagens</th>
                        <th className="p-3">Nome</th>
                        <th className="p-3">Preço</th>
                        <th className="p-3">Gênero / Categoria / Faixa Etária</th>
                        <th className="p-3">Local do Card</th>
                        <th className="p-3">Variações (Tamanhos & Cores)</th>
                        <th className="p-3">Estoque Total</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {produtosFiltrados.map((prod) => {
                        const listaImgs = prod.imagens && prod.imagens.length > 0 ? prod.imagens : prod.imagemUrl ? [prod.imagemUrl] : []
                        return (
                          <tr key={prod.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-1 overflow-x-auto max-w-[120px]">
                                {listaImgs.length > 0 ? (
                                  listaImgs.map((img, idx) => (
                                    <img
                                      key={idx}
                                      src={img}
                                      alt={`${prod.nome} ${idx}`}
                                      className="h-10 w-10 object-cover rounded-lg bg-slate-800 border border-slate-700 shrink-0"
                                      title={`Imagem ${idx + 1}`}
                                    />
                                  ))
                                ) : (
                                  <div className="h-10 w-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                                    <ImageIcon className="h-5 w-5" />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 font-semibold text-white">
                              <div>{prod.nome}</div>
                              <div className="text-[10px] text-slate-500 line-clamp-1">{prod.descricao}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-rose-400">
                                {formatarMoeda(prod.preco)}
                              </div>
                              {prod.precoPromocional ? (
                                <div className="text-[10px] text-emerald-400 font-semibold">
                                  Promo: {formatarMoeda(prod.precoPromocional)}
                                </div>
                              ) : null}
                            </td>
                            <td className="p-3 space-y-1">
                              <div className="flex flex-wrap gap-1">
                                <span className="capitalize text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-[10px] font-semibold">
                                  {prod.genero || "masculino"}
                                </span>
                                <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 text-[10px] font-semibold">
                                  {obterLabelCategoria(prod)}
                                </span>
                                <span className="text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 text-[10px] font-semibold">
                                  {OPCOES_FAIXA_ETARIA.find(f => f.value === prod.faixaEtaria)?.label || prod.faixaEtaria || "até 1 ano"}
                                </span>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <MapPin className="h-3 w-3" />
                                {OPCOES_LOCAIS.find((loc) => loc.value === (prod.localCard || "HOME_DESTAQUE"))?.label || prod.localCard || "Vitrine Destaques"}
                              </span>
                            </td>
                            <td className="p-3 space-y-2">
                              {/* TAMANHOS */}
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold mb-1">Tamanhos:</span>
                                <div className="flex flex-wrap gap-1">
                                  {prod.tamanhos && prod.tamanhos.length > 0 ? (
                                    prod.tamanhos.map((t) => {
                                      const qtdTam: number | string =
                                        prod.estoquePorTamanho?.[t] ?? "-"

                                      return (
                                        <span 
                                          key={t} 
                                          className="bg-slate-950 border border-slate-700/80 text-slate-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                                        >
                                          <span className="text-slate-400">{t}:</span>
                                          <span className="text-emerald-400 font-black">{qtdTam}</span>
                                        </span>
                                      )
                                    })
                                  ) : (
                                    <span className="text-slate-500 text-[10px] italic">Sem tamanhos</span>
                                  )}
                                </div>
                              </div>

                              {/* CORES */}
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold mb-1">Cores:</span>
                                <div className="flex flex-wrap gap-1">
                                  {prod.cores && prod.cores.length > 0 ? (
                                    prod.cores.map((c) => {
                                      const qtdCor = obterTotalEstoqueCorProduto(prod, c)

                                      return (
                                        <span 
                                          key={c} 
                                          className="bg-slate-950 border border-rose-900/60 text-rose-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                                        >
                                          <span className="text-slate-400">{c}:</span>
                                          <span className="text-emerald-400 font-black">{qtdCor}</span>
                                        </span>
                                      )
                                    })
                                  ) : (
                                    <span className="text-slate-500 text-[10px] italic">Sem cores especificadas</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-black">
                                {prod.estoque} un.
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAbrirEditarProduto(prod)
                                  }}
                                  className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                                  title="Editar Produto / Adicionar Variações e Estoque"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setProdutoParaExcluir(prod)
                                  }}
                                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                  title="Excluir Produto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: PEDIDOS */}
        {abaAtiva === "pedidos" && (
          <div className="space-y-6 max-w-6xl">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Gestão de Pedidos</h1>
              <p className="text-xs text-slate-400 mt-1">Acompanhe as vendas e altere os status dos pedidos.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={buscaPedido}
                  onChange={(e) => setBuscaPedido(e.target.value)}
                  placeholder="Buscar pedido por ID, cliente ou e-mail..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {carregandoPedidos ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos...
                </div>
              ) : pedidosFiltrados.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs font-medium">
                  Nenhum pedido encontrado.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                  <table className="w-full text-left text-xs text-slate-300 min-w-[600px]">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3">ID do Pedido</th>
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Data</th>
                        <th className="p-3">Total</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {pedidosFiltrados.map((ped) => (
                        <tr key={ped.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-mono text-[11px] text-rose-400 font-bold">
                            #{ped.id.substring(0, 8)}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-white">{ped.cliente?.nome || "Cliente Removido"}</div>
                            <div className="text-[10px] text-slate-500">{ped.cliente?.email || "-"}</div>
                          </td>
                          <td className="p-3 text-slate-400">
                            {new Date(ped.createdAt).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-3 font-bold text-white">
                            {formatarMoeda(ped.total)}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {atualizandoStatus === ped.id && (
                                <Loader2 className="h-3 w-3 animate-spin text-rose-400" />
                              )}
                              <select
                                value={ped.status}
                                onChange={(e) => handleMudarStatusPedido(ped.id, e.target.value)}
                                className={`bg-slate-950 border rounded-lg px-2 py-1 text-[11px] font-bold focus:outline-none cursor-pointer ${
                                  ped.status === "PAGO" || ped.status === "ENTREGUE"
                                    ? "text-emerald-400 border-emerald-500/30"
                                    : ped.status === "CANCELADO"
                                    ? "text-rose-400 border-rose-500/30"
                                    : "text-amber-400 border-amber-500/30"
                                }`}
                              >
                                <option value="PENDENTE">PENDENTE</option>
                                <option value="PAGO">PAGO</option>
                                <option value="ENVIADO">ENVIADO</option>
                                <option value="ENTREGUE">ENTREGUE</option>
                                <option value="CANCELADO">CANCELADO</option>
                              </select>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPedidoDetalhes(ped)
                                }}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                title="Ver Detalhes do Pedido"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPedidoParaExcluir(ped)
                                }}
                                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Excluir Venda e Devolver Itens ao Estoque"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: CLIENTES */}
        {abaAtiva === "clientes" && (
          <div className="space-y-6 max-w-6xl">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Clientes Cadastrados</h1>
              <p className="text-xs text-slate-400 mt-1">Listagem em tempo real de usuários no banco de dados.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  placeholder="Buscar cliente por nome ou e-mail..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {carregandoClientes ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando clientes...
                </div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs font-medium">
                  Nenhum cliente cadastrado no momento.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                  <table className="w-full text-left text-xs text-slate-300 min-w-[500px]">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3">Nome</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3">Data Cadastro</th>
                        <th className="p-3">Permissão</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {clientesFiltrados.map((cli) => (
                        <tr key={cli.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-semibold text-white">{cli.nome}</td>
                          <td className="p-3 text-slate-400">{cli.email}</td>
                          <td className="p-3 text-slate-500">
                            {new Date(cli.createdAt).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                cli.role === "ADMIN"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              }`}
                            >
                              {cli.role}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setClienteParaExcluir(cli)
                              }}
                              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Excluir Conta"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: MINHA CONTA */}
        {abaAtiva === "conta" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Minha Conta (Administrador)</h1>
              <p className="text-xs text-slate-400 mt-1">Gerencie suas credenciais de acesso ao painel.</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Administrador</label>
                <input
                  type="text"
                  value={nomeAdmin}
                  onChange={(e) => setNomeAdmin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">E-mail</label>
                <input
                  type="email"
                  value={emailAdmin}
                  onChange={(e) => setEmailAdmin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={() => exibirToast("Alterações da conta salvas!")}
                  className="flex items-center gap-2 bg-rose-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-rose-500 transition-colors"
                >
                  <Key className="h-4 w-4" /> Salvar Dados da Conta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA: CONFIGURAÇÕES */}
        {abaAtiva === "config" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Configurações Gerais</h1>
              <p className="text-xs text-slate-400 mt-1">Ajustes operacionais do e-commerce e gestão de dados.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Loja</label>
                <input
                  type="text"
                  value={nomeLoja}
                  onChange={(e) => setNomeLoja(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <button
                type="button"
                onClick={() => exibirToast("Configurações atualizadas!")}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors"
              >
                Salvar Configurações
              </button>
            </div>

            {/* SEÇÃO: GERENCIAMENTO DE CATEGORIAS */}
            <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-rose-500" />
                  <h2 className="text-sm font-bold text-white">Categorias de Produtos</h2>
                </div>
                <span className="text-[10px] text-slate-400">{categorias.length} cadastradas</span>
              </div>

              <form onSubmit={handleAdicionarCategoria} className="flex gap-2">
                <input
                  type="text"
                  value={novaCategoriaLabel}
                  onChange={(e) => setNovaCategoriaLabel(e.target.value)}
                  placeholder="Nome da nova categoria (ex: Pijamas)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </form>

              <div className="space-y-2 pt-2">
                {categorias.map((cat) => (
                  <div
                    key={cat.value}
                    className="flex items-center justify-between bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{cat.label}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {cat.value}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletarCategoria(cat.value)
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Excluir Categoria"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO: GERENCIAMENTO DE TAMANHOS */}
            <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-rose-500" />
                  <h2 className="text-sm font-bold text-white">Tamanhos de Produtos</h2>
                </div>
                <span className="text-[10px] text-slate-400">{opcoesTamanhos.length} cadastrados</span>
              </div>

              <form onSubmit={handleAdicionarTamanho} className="flex gap-2">
                <input
                  type="text"
                  value={novoTamanho}
                  onChange={(e) => setNovoTamanho(e.target.value)}
                  placeholder="Nome do novo tamanho (ex: 18, Extra G)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </form>

              <div className="flex flex-wrap gap-2 pt-2">
                {opcoesTamanhos.map((tam) => (
                  <div
                    key={tam.id}
                    className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-white">{tam.nome}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletarTamanho(tam)
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Excluir Tamanho"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO: GERENCIAMENTO DE CORES */}
            <div className="bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-rose-500" />
                  <h2 className="text-sm font-bold text-white">Cores de Produtos</h2>
                </div>
                <span className="text-[10px] text-slate-400">{opcoesCores.length} cadastradas</span>
              </div>

              <form onSubmit={handleAdicionarCor} className="flex gap-2">
                <input
                  type="text"
                  value={novaCor}
                  onChange={(e) => setNovaCor(e.target.value)}
                  placeholder="Nome da nova cor (ex: Rosa Bebê, Azul Marinho)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </form>

              <div className="flex flex-wrap gap-2 pt-2">
                {opcoesCores.map((cor) => (
                  <div
                    key={cor.id}
                    className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-white">{cor.nome}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletarCor(cor)
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Excluir Cor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL ITENS DO PEDIDO */}
      {pedidoDetalhes && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-4 md:p-6 space-y-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">Detalhes do Pedido</h2>
                <p className="text-xs text-rose-400 font-mono font-semibold">#{pedidoDetalhes.id}</p>
              </div>
              <button type="button" onClick={() => setPedidoDetalhes(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase">Itens Comprados</span>
              <div className="divide-y divide-slate-800/60 max-h-60 overflow-y-auto pr-1">
                {pedidoDetalhes.itens.map((item) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.produto?.imagemUrl || ""}
                        alt={item.produto?.nome || "Produto"}
                        className="h-10 w-10 object-cover rounded-lg bg-slate-800 border border-slate-700 shrink-0"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">{item.produto?.nome || "Produto Não Encontrado"}</span>
                        <span className="text-[10px] text-slate-400">
                          {item.quantidade}x {formatarMoeda(item.precoUnitario)}
                          {item.tamanho && ` (Tamanho: ${item.tamanho})`}
                          {item.cor && ` (Cor: ${item.cor})`}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-rose-400 shrink-0">
                      {formatarMoeda((item.quantidade || 0) * (item.precoUnitario || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Total Pago:</span>
              <span className="text-base font-bold text-emerald-400">
                {formatarMoeda(pedidoDetalhes.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CADASTRAR OU EDITAR PRODUTO */}
      {modalProduto && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-4 md:p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {produtoEditando ? "Editar Produto e Estoque" : "Novo Produto"}
              </h2>
              <button type="button" onClick={() => setModalProduto(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarProduto} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Conjunto Infantil Verão"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Detalhes do tecido, estilo, lavagem..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Preço Normal (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formPreco}
                    onChange={(e) => setFormPreco(e.target.value)}
                    placeholder="89.90"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Preço Promocional (Opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPrecoPromocional}
                    onChange={(e) => setFormPrecoPromocional(e.target.value)}
                    placeholder="Ex: 69.90"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Estoque Total</label>
                {(formTamanhos.length > 0 || formCores.length > 0) ? (
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-emerald-400 font-extrabold flex items-center justify-between">
                    <span>{totalEstoqueCalculado} unidades</span>
                    <span className="text-[10px] text-slate-500 font-normal">(Somado das Variações)</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    value={formEstoqueManual}
                    onChange={(e) => setFormEstoqueManual(e.target.value)}
                    placeholder="Quantidade em estoque..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-emerald-400 font-bold focus:outline-none focus:border-rose-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Gênero</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormGenero("masculino")}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all ${
                      formGenero === "masculino"
                        ? "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/20"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    Masculino
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormGenero("feminino")}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all ${
                      formGenero === "feminino"
                        ? "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/20"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    Feminino
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-rose-500" /> Categoria do Produto
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalGerenciarCategorias(true)}
                    className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
                  >
                    <FolderPlus className="h-3 w-3" /> Gerenciar Categorias
                  </button>
                </div>
                <select
                  value={formCategoria}
                  onChange={(e) => setFormCategoria(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer font-medium"
                >
                  {categorias.map((opcao) => (
                    <option key={opcao.value} value={opcao.value}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                  <Baby className="h-3.5 w-3.5 text-rose-500" /> Faixa Etária
                </label>
                <select
                  value={formFaixaEtaria}
                  onChange={(e) => setFormFaixaEtaria(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer font-medium"
                >
                  {OPCOES_FAIXA_ETARIA.map((opcao) => (
                    <option key={opcao.value} value={opcao.value}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-rose-500" /> Localização do Card na Loja
                </label>
                <select
                  value={formLocalCard}
                  onChange={(e) => setFormLocalCard(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer font-medium"
                >
                  {OPCOES_LOCAIS.map((opcao) => (
                    <option key={opcao.value} value={opcao.value}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-rose-500" /> Imagens do Produto ({formImagens.length})
                  </span>
                  <span className="text-[10px] text-slate-400">A 1ª imagem será a capa principal</span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {formImagens.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    {formImagens.map((img, index) => (
                      <div key={index} className="relative group h-20 rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                        <img src={img} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                        {index === 0 ? (
                          <span className="absolute bottom-1 left-1 bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shadow flex items-center gap-1">
                            <Star className="h-2.5 w-2.5 fill-white" /> Capa
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDefinirCapaImagem(index)}
                            className="absolute bottom-1 left-1 bg-slate-900/80 hover:bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors"
                            title="Definir como capa principal"
                          >
                            Tornar Capa
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoverImagem(index)
                          }}
                          className="absolute top-1 right-1 bg-rose-600/90 hover:bg-rose-500 text-white p-1 rounded-full opacity-90 transition-opacity"
                          title="Remover imagem"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950 p-3 text-center hover:border-rose-500 hover:bg-rose-500/5 transition-all group"
                  >
                    <div className="rounded-full bg-rose-500/10 p-2 text-rose-500 group-hover:scale-110 transition-transform">
                      <Camera className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Tirar Foto</span>
                      <span className="text-[10px] text-slate-400">Câmera do celular</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950 p-3 text-center hover:border-rose-500 hover:bg-rose-500/5 transition-all group"
                  >
                    <div className="rounded-full bg-rose-500/10 p-2 text-rose-500 group-hover:scale-110 transition-transform">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Enviar Arquivo</span>
                      <span className="text-[10px] text-slate-400">Galeria / PC</span>
                    </div>
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={novaUrlImagem}
                    onChange={(e) => setNovaUrlImagem(e.target.value)}
                    placeholder="Ou cole a URL de uma imagem..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={handleAdicionarUrlImagem}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shrink-0"
                  >
                    Adicionar URL
                  </button>
                </div>
              </div>

              {/* CONTROLE DE TAMANHOS DO PRODUTO */}
              <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-rose-500" />
                    Tamanhos Selecionados ({formTamanhos.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalGerenciarTamanhos(true)}
                    className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
                  >
                    <FolderPlus className="h-3 w-3" /> Gerenciar Banco
                  </button>
                </div>

                {formTamanhos.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pb-1 border-b border-slate-800/80">
                    {formTamanhos.map((tam) => (
                      <span
                        key={tam}
                        className="inline-flex items-center gap-1.5 bg-rose-600/20 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded-lg text-xs font-bold"
                      >
                        {tam}
                        <button
                          type="button"
                          onClick={() => handleRemoverTamanhoDoProduto(tam)}
                          className="hover:text-white hover:bg-rose-600 rounded p-0.5 transition-colors"
                          title={`Remover tamanho ${tam} do produto`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Nenhum tamanho selecionado para este produto.
                  </p>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    Puxar tamanhos do banco de dados:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {opcoesTamanhos.map((tam) => {
                      const selecionado = formTamanhos.includes(tam.nome)
                      return (
                        <button
                          key={tam.id}
                          type="button"
                          onClick={() => toggleTamanho(tam.nome)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            selecionado
                              ? "bg-rose-600 text-white border-rose-500 shadow-sm"
                              : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                          }`}
                        >
                          {selecionado ? `✓ ${tam.nome}` : `+ ${tam.nome}`}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Ou insira outro tamanho manualmente:
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tamanhoManualInput}
                      onChange={(e) => setTamanhoManualInput(e.target.value)}
                      placeholder="Ex: 18, Extra G..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleAdicionarTamanhoManualAoProduto}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {/* ESTOQUE POR TAMANHO */}
              {formTamanhos.length > 0 && formCores.length === 0 && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-xs font-bold text-slate-200 block">
                    Definir Quantidade por Tamanho
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {formTamanhos.map((tam) => (
                      <div key={tam} className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <label className="text-[11px] font-bold text-rose-400 block mb-1">
                          Tamanho: {tam}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formEstoquePorTamanho[tam] ?? 0}
                          onChange={(e) => handleQtdTamanhoChange(tam, parseInt(e.target.value) || 0)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:border-rose-500 text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formTamanhos.length > 0 && formCores.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-[10px] text-slate-400">
                  O estoque por tamanho deste produto é definido diretamente na <strong className="text-emerald-400">matriz Cor × Tamanho</strong> abaixo. Não é necessário informar novamente a quantidade por tamanho.
                </div>
              )}

              {/* CONTROLE DE CORES DO PRODUTO */}
              <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-rose-500" />
                    Cores Selecionadas ({formCores.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalGerenciarCores(true)}
                    className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
                  >
                    <FolderPlus className="h-3 w-3" /> Gerenciar Banco
                  </button>
                </div>

                {formCores.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pb-1 border-b border-slate-800/80">
                    {formCores.map((cor) => (
                      <span
                        key={cor}
                        className="inline-flex items-center gap-1.5 bg-rose-600/20 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded-lg text-xs font-bold"
                      >
                        {cor}
                        <button
                          type="button"
                          onClick={() => handleRemoverCorDoProduto(cor)}
                          className="hover:text-white hover:bg-rose-600 rounded p-0.5 transition-colors"
                          title={`Remover cor ${cor} do produto`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Nenhuma cor selecionada para este produto.
                  </p>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    Puxar cores do banco de dados:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {opcoesCores.map((cor) => {
                      const selecionada = formCores.includes(cor.nome)
                      return (
                        <button
                          key={cor.id}
                          type="button"
                          onClick={() => toggleCor(cor.nome)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            selecionada
                              ? "bg-rose-600 text-white border-rose-500 shadow-sm"
                              : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                          }`}
                        >
                          {selecionada ? `✓ ${cor.nome}` : `+ ${cor.nome}`}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Ou insira outra cor manualmente:
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={corManualInput}
                      onChange={(e) => setCorManualInput(e.target.value)}
                      placeholder="Ex: Rosa Bebê, Azul Marinho..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleAdicionarCorManualAoProduto}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {/* FOTO POR COR */}
              {formCores.length > 0 && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Foto de cada Cor
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Cadastre uma foto específica para cada cor. Quando o cliente selecionar a cor, essa imagem poderá ser mostrada no produto.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {formCores.map((cor) => {
                      const imagemCor = formImagensPorCor[cor] || ""
                      const inputId = `imagem-cor-${cor.replace(/[^a-zA-Z0-9-_]/g, "-")}`

                      return (
                        <div key={cor} className="bg-slate-900 rounded-xl border border-slate-800 p-3">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div>
                              <span className="text-[11px] font-bold text-rose-400 block">
                                Cor: {cor}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {imagemCor ? "Foto cadastrada" : "Sem foto específica"}
                              </span>
                            </div>

                            {imagemCor && (
                              <button
                                type="button"
                                onClick={() => handleRemoverImagemCor(cor)}
                                className="text-[10px] font-bold text-rose-400 hover:text-rose-300"
                              >
                                Remover foto
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="h-28 w-28 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shrink-0 flex items-center justify-center">
                              {imagemCor ? (
                                <img
                                  src={imagemCor}
                                  alt={`Foto da cor ${cor}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="h-7 w-7 text-slate-700" />
                              )}
                            </div>

                            <div className="flex-1 space-y-2">
                              <input
                                id={inputId}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleImagemCorFileChange(cor, e)}
                              />

                              <label
                                htmlFor={inputId}
                                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950 p-3 text-center hover:border-rose-500 hover:bg-rose-500/5 transition-all cursor-pointer"
                              >
                                <Upload className="h-4 w-4 text-rose-500" />
                                <span className="text-xs font-bold text-white">
                                  Escolher foto da cor
                                </span>
                              </label>

                              <input
                                type="url"
                                value={imagemCor.startsWith("data:") ? "" : imagemCor}
                                onChange={(e) => handleImagemCorUrlChange(cor, e.target.value)}
                                placeholder="Ou cole a URL da foto..."
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ESTOQUE POR COR E TAMANHO */}
              {formCores.length > 0 && formTamanhos.length > 0 && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Estoque por Cor e Tamanho
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Informe exatamente quantas unidades existem de cada cor em cada tamanho. O estoque total será calculado automaticamente pela soma da matriz.
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full min-w-max text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900">
                          <th className="sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-slate-400">
                            Cor \ Tamanho
                          </th>
                          {formTamanhos.map((tam) => (
                            <th key={tam} className="border-b border-slate-800 px-3 py-2.5 text-center text-[10px] uppercase tracking-wider text-slate-400">
                              {tam}
                            </th>
                          ))}
                          <th className="border-b border-l border-slate-800 px-3 py-2.5 text-center text-[10px] uppercase tracking-wider text-rose-400">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {formCores.map((cor) => {
                          const totalCor = formTamanhos.reduce(
                            (total, tam) => total + obterEstoqueDaMatriz(cor, tam),
                            0
                          )

                          return (
                            <tr key={cor} className="bg-slate-950">
                              <td className="sticky left-0 z-10 bg-slate-950 border-r border-slate-800 px-3 py-2">
                                <span className="font-bold text-rose-400 whitespace-nowrap">{cor}</span>
                              </td>

                              {formTamanhos.map((tam) => (
                                <td key={`${cor}-${tam}`} className="px-2 py-2 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    value={formEstoquePorCor[cor]?.[tam] ?? 0}
                                    onChange={(e) =>
                                      handleQtdCorTamanhoChange(
                                        cor,
                                        tam,
                                        Number.parseInt(e.target.value, 10) || 0
                                      )
                                    }
                                    className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-emerald-400 font-bold text-center focus:outline-none focus:border-rose-500"
                                    aria-label={`Estoque da cor ${cor} no tamanho ${tam}`}
                                  />
                                </td>
                              ))}

                              <td className="border-l border-slate-800 px-3 py-2 text-center font-black text-emerald-400">
                                {totalCor}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900">
                          <td className="sticky left-0 z-10 bg-slate-900 border-r border-slate-800 px-3 py-2.5 text-[10px] font-bold uppercase text-slate-400">
                            Total por tamanho
                          </td>
                          {formTamanhos.map((tam) => {
                            const totalTamanho = formCores.reduce(
                              (total, cor) => total + obterEstoqueDaMatriz(cor, tam),
                              0
                            )
                            return (
                              <td key={tam} className="px-3 py-2.5 text-center text-emerald-400 font-black">
                                {totalTamanho}
                              </td>
                            )
                          })}
                          <td className="border-l border-slate-800 px-3 py-2.5 text-center text-white font-black">
                            {totalEstoqueCalculado}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ESTOQUE POR COR SEM TAMANHO */}
              {formCores.length > 0 && formTamanhos.length === 0 && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Definir Quantidade por Cor
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Como este produto não possui tamanhos, informe o estoque total de cada cor.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {formCores.map((cor) => (
                      <div key={cor} className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <label className="text-[11px] font-bold text-rose-400 block mb-1">
                          Cor: {cor}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formEstoquePorCorLegado[cor] ?? 0}
                          onChange={(e) =>
                            handleQtdCorSemTamanhoChange(
                              cor,
                              Number.parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:border-rose-500 text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalProduto(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoProduto}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {salvandoProduto && <Loader2 className="h-4 w-4 animate-spin" />}
                  {produtoEditando ? "Salvar Alterações" : "Cadastrar Produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR CATEGORIAS */}
      {modalGerenciarCategorias && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-4 md:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="h-4 w-4 text-rose-500" /> Gerenciar Categorias da Loja
              </h3>
              <button type="button" onClick={() => setModalGerenciarCategorias(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarCategoria} className="flex gap-2">
              <input
                type="text"
                value={novaCategoriaLabel}
                onChange={(e) => setNovaCategoriaLabel(e.target.value)}
                placeholder="Nome da categoria (ex: Pijamas)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shrink-0"
              >
                Adicionar
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {categorias.map((cat) => (
                <div key={cat.value} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                  <span className="font-semibold text-white">{cat.label}</span>
                  <button
                    type="button"
                    onClick={() => handleDeletarCategoria(cat.value)}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR TAMANHOS */}
      {modalGerenciarTamanhos && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-4 md:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Package className="h-4 w-4 text-rose-500" /> Gerenciar Banco de Tamanhos
              </h3>
              <button type="button" onClick={() => setModalGerenciarTamanhos(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarTamanho} className="flex gap-2">
              <input
                type="text"
                value={novoTamanho}
                onChange={(e) => setNovoTamanho(e.target.value)}
                placeholder="Nome do tamanho (ex: 18)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shrink-0"
              >
                Adicionar
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto flex flex-wrap gap-2 pr-1">
              {opcoesTamanhos.map((tam) => (
                <div key={tam.id} className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                  <span className="font-semibold text-white">{tam.nome}</span>
                  <button
                    type="button"
                    onClick={() => handleDeletarTamanho(tam)}
                    className="p-0.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR CORES */}
      {modalGerenciarCores && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-4 md:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Palette className="h-4 w-4 text-rose-500" /> Gerenciar Banco de Cores
              </h3>
              <button type="button" onClick={() => setModalGerenciarCores(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarCor} className="flex gap-2">
              <input
                type="text"
                value={novaCor}
                onChange={(e) => setNovaCor(e.target.value)}
                placeholder="Nome da cor (ex: Rosa Bebê)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shrink-0"
              >
                Adicionar
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto flex flex-wrap gap-2 pr-1">
              {opcoesCores.map((cor) => (
                <div key={cor.id} className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                  <span className="font-semibold text-white">{cor.nome}</span>
                  <button
                    type="button"
                    onClick={() => handleDeletarCor(cor)}
                    className="p-0.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO DE PRODUTO */}
      {produtoParaExcluir && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[120]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Excluir Produto?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Você tem certeza que deseja excluir <span className="text-white font-semibold">"{produtoParaExcluir.nome}"</span>? Esta ação é irreversible.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProdutoParaExcluir(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusao}
                disabled={deletandoProduto}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2"
              >
                {deletandoProduto && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO DE CLIENTE */}
      {clienteParaExcluir && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[120]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Excluir Conta do Cliente?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Tem certeza que deseja remover o usuário <span className="text-white font-semibold">"{clienteParaExcluir.nome}"</span>?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClienteParaExcluir(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoCliente}
                disabled={deletandoCliente}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2"
              >
                {deletandoCliente && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir Conta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO DE PEDIDO */}
      {pedidoParaExcluir && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[120]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Excluir Pedido e Devolver Itens?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Ao excluir este pedido, os itens serão automaticamente estornados para o estoque dos produtos.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPedidoParaExcluir(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoPedido}
                disabled={deletandoPedido}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2"
              >
                {deletandoPedido && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir Venda
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
