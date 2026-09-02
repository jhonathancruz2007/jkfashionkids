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
  FileSpreadsheet,
  CheckCircle
} from "lucide-react"

interface CategoriaItem {
  value: string
  label: string
}

interface TamanhoItem {
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
  estoquePorTamanho?: Record<string, number>
  genero?: string
  localCard?: string
  categoria?: string | { value?: string; label?: string; id?: string; nome?: string }
  categoriaId?: string
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
  produto: {
    nome: string
    imagemUrl: string
  }
}

interface Pedido {
  id: string
  total: number
  status: string
  createdAt: string
  cliente: {
    nome: string
    email: string
  }
  itens: ItemPedido[]
}

const TAMANHOS_INICIAIS = ["RN", "P", "M", "G", "GG", "1", "2", "3", "4", "6", "8", "10", "12", "14", "16", "Unico", "Animais", "Normais"]

const CATEGORIAS_INICIAIS: CategoriaItem[] = [
  { value: "CONJUNTOS", label: "Conjuntos" },
  { value: "VESTIDOS", label: "Vestidos" },
  { value: "BLUSAS", label: "Blusas e Camisetas" },
  { value: "CALCAS_SHORTS", label: "Calças e Shorts" },
  { value: "CALCADOS", label: "Calçados" },
  { value: "ACESSORIOS", label: "Acessórios" },
]

const OPCOES_FAIXA_ETARIA = [
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

export default function PaginaDashboardAdmin() {
  const [abaAtiva, setAbaAtiva] = useState<"geral" | "produtos" | "pedidos" | "clientes" | "conta" | "config" | "tiny">("geral")
  const [saindo, setSaindo] = useState(false)

  // ESTADO DINÂMICO DE CATEGORIAS
  const [categorias, setCategorias] = useState<CategoriaItem[]>(CATEGORIAS_INICIAIS)
  const [novaCategoriaLabel, setNovaCategoriaLabel] = useState("")
  const [modalGerenciarCategorias, setModalGerenciarCategorias] = useState(false)

  // ESTADO DINÂMICO DE TAMANHOS
  const [opcoesTamanhos, setOpcoesTamanhos] = useState<TamanhoItem[]>(
    TAMANHOS_INICIAIS.map((t, index) => ({ id: `temp-${index}`, nome: t }))
  )
  const [novoTamanho, setNovoTamanho] = useState("")
  const [modalGerenciarTamanhos, setModalGerenciarTamanhos] = useState(false)

  // ESTADOS DE PRODUTOS
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState("")
  const [modalProduto, setModalProduto] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null)
  const [salvandoProduto, setSalvandoProduto] = useState(false)
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<Produto | null>(null)
  const [deletandoProduto, setDeletandoProduto] = useState(false)

  // Form Produto
  const [formNome, setFormNome] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formPreco, setFormPreco] = useState("")
  const [formPrecoPromocional, setFormPrecoPromocional] = useState("")
  const [formEstoqueManual, setFormEstoqueManual] = useState("0")
  
  // Múltiplas imagens
  const [formImagens, setFormImagens] = useState<string[]>([])
  const [novaUrlImagem, setNovaUrlImagem] = useState("")

  const [formTamanhos, setFormTamanhos] = useState<string[]>([])
  const [formEstoquePorTamanho, setFormEstoquePorTamanho] = useState<Record<string, number>>({})
  const [formGenero, setFormGenero] = useState("masculino")
  const [formCategoria, setFormCategoria] = useState("CONJUNTOS")
  const [formFaixaEtaria, setFormFaixaEtaria] = useState("0-1") 
  const [formLocalCard, setFormLocalCard] = useState("HOME_DESTAQUE")

  // Refs para inputs de arquivo e câmera
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // ESTADOS DE CLIENTES
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregandoClientes, setCarregandoClientes] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState("")
  const [clienteParaExcluir, setClienteParaExcluir] = useState<Cliente | null>(null)
  const [deletandoCliente, setDeletandoCliente] = useState(false)

  // ESTADOS DE PEDIDOS
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregandoPedidos, setCarregandoPedidos] = useState(false)
  const [buscaPedido, setBuscaPedido] = useState("")
  const [pedidoDetalhes, setPedidoDetalhes] = useState<Pedido | null>(null)
  const [atualizandoStatus, setAtualizandoStatus] = useState<string | null>(null)
  const [pedidoParaExcluir, setPedidoParaExcluir] = useState<Pedido | null>(null)
  const [deletandoPedido, setDeletandoPedido] = useState(false)

  // ESTADOS MINHA CONTA & CONFIG
  const [nomeAdmin, setNomeAdmin] = useState("Administrador")
  const [emailAdmin, setEmailAdmin] = useState("admin@seusite.com")

  // ESTADOS PARA IMPORTAÇÃO DO TINY ERP
  const [loadingTiny, setLoadingTiny] = useState(false)
  const [tinyMessage, setTinyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // BUSCAR CATEGORIAS DO BANCO DE DADOS (API)
  const carregarCategorias = async () => {
    try {
      const res = await fetch("/api/admin/categorias")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const catsFormatadas: CategoriaItem[] = data.map((cat: any) => ({
            value: cat.id || cat.value || cat.nome,
            label: cat.nome || cat.label || cat.value
          }))
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
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const tamanhosFormatados: TamanhoItem[] = data.map((t: any) => ({
            id: t.id,
            nome: t.nome || t.value
          }))
          setOpcoesTamanhos(tamanhosFormatados)
        }
      }
    } catch (error) {
      console.error("Erro ao carregar tamanhos da API:", error)
    }
  }

  const handleImportTiny = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoadingTiny(true)
    setTinyMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/admin/produtos/importar', { 
        method: 'POST', 
        body: formData 
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setTinyMessage({ 
          type: 'error', 
          text: data.error || data.erro || 'Erro ao processar o arquivo do Tiny.' 
        })
        return
      }

      setTinyMessage({ 
        type: 'success', 
        text: data.message || `Arquivo "${file.name}" importado com sucesso!` 
      })
      carregarProdutos()
      carregarCategorias()
    } catch (error) {
      console.error('Erro na importação:', error)
      setTinyMessage({ 
        type: 'error', 
        text: 'Erro de conexão ao enviar o arquivo do Tiny.' 
      })
    } finally {
      setLoadingTiny(false)
      e.target.value = ''
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
        const novaCatBanco = await res.json()
        const catItem: CategoriaItem = {
          value: novaCatBanco.id || novaCatBanco.value || novaCatBanco.nome || nomeFormatado,
          label: novaCatBanco.nome || novaCatBanco.label || nomeFormatado
        }

        setCategorias((prev) => {
          if (prev.some((c) => c.value === catItem.value)) return prev
          return [...prev, catItem]
        })
        setFormCategoria(catItem.value)
        setNovaCategoriaLabel("")
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
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.erro || data.error || "Não foi possível excluir a categoria.")
      }
    } catch (error) {
      console.error("Erro ao excluir categoria:", error)
      alert("Erro de conexão ao excluir categoria.")
    }
  }

  // HANDLERS DE TAMANHOS
  const handleAdicionarTamanho = async (e: React.FormEvent) => {
    e.preventDefault()
    const tamFormatado = novoTamanho.trim()
    if (!tamFormatado) return

    if (opcoesTamanhos.some((t) => t.nome.toLowerCase() === tamFormatado.toLowerCase())) {
      alert("Este tamanho já existe!")
      return
    }

    try {
      const res = await fetch("/api/admin/tamanhos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: tamFormatado }),
      })

      if (res.ok) {
        const novoTamBanco = await res.json()
        setOpcoesTamanhos((prev) => [
          ...prev, 
          { id: novoTamBanco.id || String(Date.now()), nome: novoTamBanco.nome || tamFormatado }
        ])
        setNovoTamanho("")
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

    if (idParaDeletar.startsWith("temp-")) {
        setOpcoesTamanhos((prev) => prev.filter((t) => t.id !== idParaDeletar && t.nome !== nomeParaFiltro))
        if (formTamanhos.includes(nomeParaFiltro)) {
          toggleTamanho(nomeParaFiltro)
        }
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
          toggleTamanho(nomeParaFiltro)
        }
    } catch (error: any) {
        console.error("Detalhe do erro ao deletar tamanho:", error)
        setOpcoesTamanhos((prev) => prev.filter((t) => t.id !== idParaDeletar && t.nome !== nomeParaFiltro))
        if (formTamanhos.includes(nomeParaFiltro)) {
          toggleTamanho(nomeParaFiltro)
        }
    }
  }

  const toggleTamanho = (tam: string) => {
    setFormTamanhos((prev) => {
      const existe = prev.includes(tam)
      if (existe) {
        const novosTamanhos = prev.filter((t) => t !== tam)
        const novoEstoque = { ...formEstoquePorTamanho }
        delete novoEstoque[tam]
        setFormEstoquePorTamanho(novoEstoque)
        return novosTamanhos
      } else {
        setFormEstoquePorTamanho((prevEstoque) => ({
          ...prevEstoque,
          [tam]: prevEstoque[tam] ?? 1,
        }))
        return [...prev, tam]
      }
    })
  }

  const handleQtdTamanhoChange = (tamanho: string, quantidade: number) => {
    setFormEstoquePorTamanho((prev) => ({
      ...prev,
      [tamanho]: Math.max(0, quantidade),
    }))
  }
  
  const totalEstoqueCalculado = formTamanhos.reduce(
    (acc, tam) => acc + (formEstoquePorTamanho[tam] || 0),
    0
  )

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
    if (abaAtiva === "produtos" || abaAtiva === "geral") carregarProdutos()
    if (abaAtiva === "clientes" || abaAtiva === "geral") carregarClientes()
    if (abaAtiva === "pedidos" || abaAtiva === "geral") carregarPedidos()
  }, [abaAtiva])

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
    setFormGenero("masculino")
    setFormCategoria(categorias[0]?.value || "CONJUNTOS")
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

    setFormTamanhos(prod.tamanhos || [])
    setFormGenero(prod.genero || "masculino")
    
    let catValor = ""
    if (typeof prod.categoria === "object" && prod.categoria !== null) {
      catValor = prod.categoria.id || prod.categoria.value || prod.categoria.nome || ""
    } else if (typeof prod.categoria === "string") {
      catValor = prod.categoria
    } else if (prod.categoriaId) {
      catValor = prod.categoriaId
    }

    const catExiste = categorias.find((c) => c.value === catValor || c.label === catValor)
    setFormCategoria(catExiste ? catExiste.value : catValor || categorias[0]?.value || "CONJUNTOS")

    setFormFaixaEtaria(prod.faixaEtaria || "0-1") 
    setFormLocalCard(prod.localCard || "HOME_DESTAQUE")

    if (prod.estoquePorTamanho && Object.keys(prod.estoquePorTamanho).length > 0) {
      setFormEstoquePorTamanho({ ...prod.estoquePorTamanho })
    } else if (prod.tamanhos && prod.tamanhos.length > 0) {
      const base = Math.floor((prod.estoque || 0) / prod.tamanhos.length)
      const resto = (prod.estoque || 0) % prod.tamanhos.length
      const mapaEstoque: Record<string, number> = {}
      prod.tamanhos.forEach((t, idx) => {
        mapaEstoque[t] = base + (idx < resto ? 1 : 0)
      })
      setFormEstoquePorTamanho(mapaEstoque)
    } else {
      setFormEstoquePorTamanho({})
    }

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

    const estoqueFinal = formTamanhos.length > 0 
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
          estoquePorTamanho: formEstoquePorTamanho,
          genero: formGenero,
          categoriaId: formCategoria,
          faixaEtaria: formFaixaEtaria,
          localCard: formLocalCard,
        }),
      })

      if (res.ok) {
        setModalProduto(false)
        setProdutoEditando(null)
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

  const produtosFiltrados = produtos.filter((p) => p.nome.toLowerCase().includes(buscaProduto.toLowerCase()))
  const clientesFiltrados = clientes.filter(
    (c) => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || c.email.toLowerCase().includes(buscaCliente.toLowerCase())
  )
  const pedidosFiltrados = pedidos.filter(
    (p) =>
      p.id.toLowerCase().includes(buscaPedido.toLowerCase()) ||
      p.cliente.nome.toLowerCase().includes(buscaPedido.toLowerCase()) ||
      p.cliente.email.toLowerCase().includes(buscaPedido.toLowerCase())
  )

  const totalVendas = pedidos.reduce((acc, p) => acc + (p.total || 0), 0)

  const obterLabelCategoria = (prod: Produto) => {
    let catVal = ""
    let catLabel = ""

    if (typeof prod.categoria === "object" && prod.categoria !== null) {
      catVal = prod.categoria.id || prod.categoria.value || ""
      catLabel = prod.categoria.nome || prod.categoria.label || catVal
    } else if (typeof prod.categoria === "string") {
      catVal = prod.categoria
      catLabel = prod.categoria
    } else if (prod.categoriaId) {
      catVal = prod.categoriaId
      catLabel = prod.categoriaId
    }

    const enc = categorias.find((c) => c.value === catVal || c.label === catLabel || c.value === prod.categoriaId)
    return enc ? enc.label : catLabel || catVal || "Sem Categoria"
  }

  return (
    <div className="fixed inset-0 z-[999] flex bg-slate-950 text-slate-100 font-sans w-screen h-screen overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900 p-6 flex flex-col justify-between shrink-0 h-full overflow-y-auto">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
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
              onClick={() => setAbaAtiva("geral")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "geral" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" /> Visão Geral
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("produtos")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "produtos" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Package className="h-4 w-4" /> Produtos
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("pedidos")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "pedidos" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <ShoppingBag className="h-4 w-4" /> Pedidos
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("clientes")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "clientes" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <Users className="h-4 w-4" /> Clientes
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("tiny")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "tiny" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> Importar Tiny ERP
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("conta")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                abaAtiva === "conta" ? "bg-rose-600 text-white font-semibold shadow-lg shadow-rose-600/20" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <UserCheck className="h-4 w-4" /> Minha Conta
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("config")}
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
      <main className="flex-1 p-8 overflow-y-auto h-full">

        {/* ABA: VISÃO GERAL */}
        {abaAtiva === "geral" && (
          <div className="space-y-8 max-w-6xl">
            <div>
              <h1 className="text-2xl font-bold text-white">Visão Geral</h1>
              <p className="text-xs text-slate-400 mt-1">Acompanhe as estatísticas principais da loja.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Vendas Totais</span>
                <p className="text-2xl font-bold text-white mt-2">
                  R$ {Number(totalVendas || 0).toFixed(2).replace(".", ",")}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Total de Pedidos</span>
                <p className="text-2xl font-bold text-white mt-2">{pedidos.length}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Produtos Cadastrados</span>
                <p className="text-2xl font-bold text-white mt-2">{produtos.length}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 uppercase">Clientes</span>
                <p className="text-2xl font-bold text-white mt-2">{clientes.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* ABA: PRODUTOS */}
        {abaAtiva === "produtos" && (
          <div className="space-y-6 max-w-6xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">Gestão de Produtos</h1>
                <p className="text-xs text-slate-400 mt-1">Cadastre, edite e adicione mais tamanhos, imagens ou quantidades aos seus produtos.</p>
              </div>
              <button
                type="button"
                onClick={handleAbrirNovoProduto}
                className="flex items-center gap-2 bg-rose-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/20"
              >
                <Plus className="h-4 w-4" /> Cadastrar Produto
              </button>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3">Imagens</th>
                        <th className="p-3">Nome</th>
                        <th className="p-3">Preço</th>
                        <th className="p-3">Gênero / Categoria / Faixa Etária</th>
                        <th className="p-3">Local do Card</th>
                        <th className="p-3">Estoque por Tamanho</th>
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
                                R$ {Number(prod.preco || 0).toFixed(2).replace(".", ",")}
                              </div>
                              {prod.precoPromocional && (
                                <div className="text-[10px] text-emerald-400 font-semibold">
                                  Promo: R$ {Number(prod.precoPromocional || 0).toFixed(2).replace(".", ",")}
                                </div>
                              )}
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
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1.5 max-w-sm">
                                {prod.tamanhos && prod.tamanhos.length > 0 ? (
                                  prod.tamanhos.map((t, idx) => {
                                    let qtdTam: number | string = "-"
                                    
                                    if (prod.estoquePorTamanho && prod.estoquePorTamanho[t] !== undefined) {
                                      qtdTam = prod.estoquePorTamanho[t]
                                    } else if (prod.estoque !== undefined) {
                                      const base = Math.floor(prod.estoque / prod.tamanhos.length)
                                      const resto = prod.estoque % prod.tamanhos.length
                                      qtdTam = base + (idx < resto ? 1 : 0)
                                    }

                                    return (
                                      <span 
                                        key={t} 
                                        className="bg-slate-950 border border-slate-700/80 text-slate-200 px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 shadow-sm"
                                      >
                                        <span className="text-slate-400">{t}:</span>
                                        <span className="text-emerald-400 text-sm font-black">
                                          {qtdTam}
                                        </span>
                                      </span>
                                    )
                                  })
                                ) : (
                                  <span className="text-slate-500 text-xs italic">Sem tamanho</span>
                                )}
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
                                  title="Editar Produto / Adicionar Tamanhos e Estoque"
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
              <h1 className="text-2xl font-bold text-white">Gestão de Pedidos</h1>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
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
                            R$ {Number(ped.total || 0).toFixed(2).replace(".", ",")}
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
              <h1 className="text-2xl font-bold text-white">Clientes Cadastrados</h1>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
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

        {/* ABA: IMPORTAR TINY ERP */}
        {abaAtiva === "tiny" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-2xl font-bold text-white">Integração Tiny ERP</h1>
              <p className="text-xs text-slate-400 mt-1">Importe os arquivos CSV baixados do Tiny ERP para atualizar a base de dados.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl space-y-5">
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center bg-slate-950 hover:border-rose-500/50 transition-colors">
                <FileSpreadsheet size={48} className="text-rose-500 mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">Selecionar Arquivo do Tiny</h3>
                <p className="text-xs text-slate-400 mb-5 max-w-sm">
                  Envie o arquivo CSV exportado do Tiny ERP para atualizar o e-commerce.
                </p>
                
                <label className="cursor-pointer bg-rose-600 text-white px-5 py-2.5 rounded-xl hover:bg-rose-500 transition-colors font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/20">
                  <Upload size={16} />
                  <span>{loadingTiny ? 'Processando Arquivo...' : 'Selecionar Arquivo'}</span>
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={handleImportTiny} 
                    disabled={loadingTiny}
                  />
                </label>
              </div>

              {tinyMessage && (
                <div className={`p-4 rounded-xl flex items-center gap-3 text-xs ${
                  tinyMessage.type === 'success' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {tinyMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                  <span>{tinyMessage.text}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: MINHA CONTA */}
        {abaAtiva === "conta" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-2xl font-bold text-white">Minha Conta (Administrador)</h1>
              <p className="text-xs text-slate-400 mt-1">Gerencie suas credenciais de acesso ao painel.</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
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
              <div className="pt-4 border-t border-slate-800">
                <button type="button" className="flex items-center gap-2 bg-rose-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-rose-500 transition-colors">
                  <Key className="h-4 w-4" /> Alterar Senha de Acesso
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA: CONFIGURAÇÕES */}
        {abaAtiva === "config" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-2xl font-bold text-white">Configurações Gerais</h1>
              <p className="text-xs text-slate-400 mt-1">Ajustes operacionais do e-commerce e gestão de dados.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Loja</label>
                <input
                  type="text"
                  defaultValue="JKfashion Kids"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* SEÇÃO: GERENCIAMENTO DE CATEGORIAS */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
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
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
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
          </div>
        )}

      </main>

      {/* MODAL ITENS DO PEDIDO */}
      {pedidoDetalhes && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 space-y-6 shadow-2xl">
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
                        className="h-10 w-10 object-cover rounded-lg bg-slate-800 border border-slate-700"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">{item.produto?.nome || "Produto Não Encontrado"}</span>
                        <span className="text-[10px] text-slate-400">
                          {item.quantidade}x R$ {Number(item.precoUnitario || 0).toFixed(2).replace(".", ",")}
                          {item.tamanho && ` (Tamanho: ${item.tamanho})`}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-rose-400">
                      R$ {Number((item.quantidade || 0) * (item.precoUnitario || 0)).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Total Pago:</span>
              <span className="text-base font-bold text-emerald-400">
                R$ {Number(pedidoDetalhes.total || 0).toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CADASTRAR OU EDITAR PRODUTO */}
      {modalProduto && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
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

              <div className="grid grid-cols-2 gap-4">
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
                {formTamanhos.length > 0 ? (
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-emerald-400 font-extrabold flex items-center justify-between">
                    <span>{totalEstoqueCalculado} unidades</span>
                    <span className="text-[10px] text-slate-500 font-normal">(Somado dos Tamanhos)</span>
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
                  <div className="grid grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    {formImagens.map((img, index) => (
                      <div key={index} className="relative group h-20 rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                        <img src={img} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                        {index === 0 && (
                          <span className="absolute bottom-1 left-1 bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shadow">
                            Capa
                          </span>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">
                    1. Adicionar ou Remover Tamanhos (Variáveis)
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalGerenciarTamanhos(true)}
                    className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
                  >
                    <FolderPlus className="h-3 w-3" /> Gerenciar Tamanhos
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {opcoesTamanhos.map((tam) => {
                    const selecionado = formTamanhos.includes(tam.nome)
                    return (
                      <button
                        key={tam.id}
                        type="button"
                        onClick={() => toggleTamanho(tam.nome)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          selecionado
                            ? "bg-rose-600 text-white border-rose-500"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                        }`}
                      >
                        {tam.nome}
                      </button>
                    )
                  })}
                </div>
              </div>

              {formTamanhos.length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <label className="block text-xs font-bold text-rose-400 uppercase tracking-wider">
                    2. Ajustar Estoque de Cada Tamanho
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {formTamanhos.map((tam) => (
                      <div key={tam} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-sm font-bold text-white">{tam}</span>
                        <input
                          type="number"
                          min="0"
                          value={formEstoquePorTamanho[tam] ?? 0}
                          onChange={(e) => handleQtdTamanhoChange(tam, parseInt(e.target.value) || 0)}
                          className="w-16 bg-slate-950 border border-slate-700 rounded-lg text-center text-sm py-1 text-emerald-400 font-extrabold focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={salvandoProduto}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-3 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-rose-600/20"
              >
                {salvandoProduto ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : produtoEditando ? (
                  "Salvar Alterações do Produto"
                ) : (
                  "Cadastrar Produto"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE GERENCIAMENTO DE CATEGORIAS */}
      {modalGerenciarCategorias && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-bold text-white">Gerenciar Categorias</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalGerenciarCategorias(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarCategoria} className="flex gap-2">
              <input
                type="text"
                required
                value={novaCategoriaLabel}
                onChange={(e) => setNovaCategoriaLabel(e.target.value)}
                placeholder="Nome da categoria (ex: Pijamas)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3 py-2 rounded-xl transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" /> Adicionar
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {categorias.map((cat) => (
                <div
                  key={cat.value}
                  className="flex items-center justify-between bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-white">{cat.label}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletarCategoria(cat.value)
                    }}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Excluir Categoria"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setModalGerenciarCategorias(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE GERENCIAMENTO DE TAMANHOS */}
      {modalGerenciarTamanhos && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-bold text-white">Gerenciar Tamanhos</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalGerenciarTamanhos(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdicionarTamanho} className="flex gap-2">
              <input
                type="text"
                required
                value={novoTamanho}
                onChange={(e) => setNovoTamanho(e.target.value)}
                placeholder="Nome do tamanho (ex: 18, Extra G)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3 py-2 rounded-xl transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" /> Adicionar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-1">
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

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setModalGerenciarTamanhos(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXCLUSÃO PRODUTO */}
      {produtoParaExcluir && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 space-y-5 text-center shadow-2xl">
            <div className="mx-auto h-12 w-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Excluir Produto?</h3>
              <p className="text-xs text-slate-400 mt-2">
                Tem certeza que deseja excluir <span className="font-semibold text-slate-200">"{produtoParaExcluir.nome}"</span>? Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProdutoParaExcluir(null)}
                disabled={deletandoProduto}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusao}
                disabled={deletandoProduto}
                className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deletandoProduto ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXCLUSÃO CLIENTE */}
      {clienteParaExcluir && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 space-y-5 text-center shadow-2xl">
            <div className="mx-auto h-12 w-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Excluir Conta do Cliente?</h3>
              <p className="text-xs text-slate-400 mt-2">
                Tem certeza que deseja excluir a conta de <span className="font-semibold text-slate-200">"{clienteParaExcluir.nome}"</span> ({clienteParaExcluir.email})?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClienteParaExcluir(null)}
                disabled={deletandoCliente}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoCliente}
                disabled={deletandoCliente}
                className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deletandoCliente ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXCLUSÃO PEDIDO */}
      {pedidoParaExcluir && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 space-y-5 text-center shadow-2xl">
            <div className="mx-auto h-12 w-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Excluir Venda?</h3>
              <p className="text-xs text-slate-400 mt-2">
                Tem certeza que deseja excluir o pedido <span className="font-semibold text-rose-400 font-mono">#{pedidoParaExcluir.id.substring(0, 8)}</span>?
              </p>
              <p className="text-[11px] text-amber-400/90 mt-2 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl font-medium">
                ⚠️ Os itens desta venda retornarão ao estoque dos produtos automaticamente.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPedidoParaExcluir(null)}
                disabled={deletandoPedido}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExclusaoPedido}
                disabled={deletandoPedido}
                className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deletandoPedido ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}