"use client";

import { useState, useEffect, useMemo, MouseEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useFavoritos } from "@/lib/favoritos-context";
import { useCarrinho } from "@/lib/carrinho-context";
import {
  Heart,
  ShoppingBag,
  ArrowLeft,
  Loader2,
  Truck,
  ShieldCheck,
  Check,
  Ruler,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CreditCard,
  X,
  Bell,
  Tag,
  AlertCircle,
  Palette,
} from "lucide-react";

const ORDEM_TAMANHOS = [
  "RN", "PP", "P", "M", "G", "GG", "XG", "XGG", "EG", "EGG", "EXG",
  "0", "1", "2", "3", "4", "6", "8", "10", "12", "14", "16",
];

function ordenarTamanhos(lista: string[]): string[] {
  if (!Array.isArray(lista)) return ["P", "M", "G", "GG"];

  return [...lista].sort((a, b) => {
    const indexA = ORDEM_TAMANHOS.indexOf(String(a).toUpperCase());
    const indexB = ORDEM_TAMANHOS.indexOf(String(b).toUpperCase());

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/**
 * Converte nomes comuns de cores em uma cor visual quando o produto
 * não possui um HEX cadastrado.
 */
function obterHexDaCor(nome: string, hexInformado?: string | null): string {
  if (hexInformado && String(hexInformado).trim()) {
    return String(hexInformado).trim();
  }

  const normalizado = String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const mapa: Record<string, string> = {
    preto: "#111827",
    preta: "#111827",
    branco: "#ffffff",
    branca: "#ffffff",
    vermelho: "#ef4444",
    vermelha: "#ef4444",
    azul: "#2563eb",
    "azul marinho": "#172554",
    marinho: "#172554",
    "azul claro": "#60a5fa",
    rosa: "#ec4899",
    "rosa bebe": "#f9a8d4",
    pink: "#ec4899",
    roxo: "#8b5cf6",
    violeta: "#8b5cf6",
    lilas: "#c084fc",
    amarelo: "#facc15",
    dourado: "#d4af37",
    laranja: "#f97316",
    verde: "#22c55e",
    "verde militar": "#4d5c3b",
    "verde musgo": "#556b2f",
    bege: "#d6b98c",
    nude: "#e8c3a5",
    marrom: "#8b5a2b",
    cinza: "#9ca3af",
    prata: "#c0c0c0",
    caramelo: "#b7793f",
    terracota: "#c66b4e",
    vinho: "#7f1d1d",
    bordô: "#7f1d1d",
    bordo: "#7f1d1d",
    creme: "#fff7d6",
  };

  if (mapa[normalizado]) return mapa[normalizado];

  const encontrada = Object.keys(mapa).find((chave) =>
    normalizado.includes(chave) || chave.includes(normalizado)
  );

  return encontrada ? mapa[encontrada] : "#d1d5db";
}

/**
 * Procura a imagem específica de uma cor dentro de `coresDetalhes`.
 * Aceita os formatos:
 *   { "Azul": "https://..." }
 *   { "Azul": { imagemUrl: "https://..." } }
 *
 * A comparação também ignora acentos, espaços laterais e maiúsculas/minúsculas.
 */
function obterImagemDaCor(detalhes: any, cor: string): string {
  if (
    !detalhes ||
    typeof detalhes !== "object" ||
    Array.isArray(detalhes) ||
    !cor
  ) {
    return "";
  }

  const normalizarTexto = (valor: string) =>
    String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const extrairImagem = (valor: any): string => {
    if (typeof valor === "string" && valor.trim()) {
      return valor.trim();
    }

    if (
      valor &&
      typeof valor === "object" &&
      typeof valor.imagemUrl === "string" &&
      valor.imagemUrl.trim()
    ) {
      return valor.imagemUrl.trim();
    }

    return "";
  };

  // Primeiro tenta a chave exatamente como veio.
  const valorDireto = extrairImagem(detalhes[cor]);
  if (valorDireto) return valorDireto;

  // Depois tenta ignorando acentos, espaços e caixa.
  const chaveEncontrada = Object.keys(detalhes).find(
    (chave) => normalizarTexto(chave) === normalizarTexto(cor)
  );

  if (!chaveEncontrada) return "";

  return extrairImagem(detalhes[chaveEncontrada]);
}

export default function ProdutoDetalhePage() {
  const { isFavorito, toggleFavorito } = useFavoritos();
  const { carrinho = [], recarregarCarrinho } = useCarrinho() as any;

  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [produto, setProduto] = useState<any>(null);
  const [estoqueTinyReal, setEstoqueTinyReal] = useState<number | null>(null);
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState<string>("");
  const [corSelecionada, setCorSelecionada] = useState<string>("");
  const [imagemIndex, setImagemIndex] = useState<number>(0);
  const [imagemDaCor, setImagemDaCor] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [sucessoAdicao, setSucessoAdicao] = useState(false);

  const [toast, setToast] = useState<{
    visivel: boolean;
    mensagem: string;
  }>({
    visivel: false,
    mensagem: "",
  });

  const mostrarToast = (mensagem: string) => {
    setToast({ visivel: true, mensagem });
    setTimeout(() => {
      setToast({ visivel: false, mensagem: "" });
    }, 4000);
  };

  const [modalAviseMe, setModalAviseMe] = useState(false);
  const [emailAviseMe, setEmailAviseMe] = useState("");
  const [telefoneAviseMe, setTelefoneAviseMe] = useState("");
  const [enviandoAviseMe, setEnviandoAviseMe] = useState(false);
  const [sucessoAviseMe, setSucessoAviseMe] = useState(false);

  const [zoomPos, setZoomPos] = useState<{ x: number; y: number }>({
    x: 50,
    y: 50,
  });
  const [isHovered, setIsHovered] = useState(false);

  const [modalGuiaTamanhos, setModalGuiaTamanhos] = useState(false);
  const [abaAberta, setAbaAberta] = useState<"cuidados" | "trocas" | null>(
    "cuidados"
  );

  const idProd = String(produto?.id || produto?._id || id || "");
  const favoritado = isFavorito(idProd);

  const listaTamanhos = useMemo(() => {
    const base =
      Array.isArray(produto?.tamanhos) && produto.tamanhos.length > 0
        ? produto.tamanhos
        : Array.isArray(produto?.tamanhosDisponiveis) &&
          produto.tamanhosDisponiveis.length > 0
        ? produto.tamanhosDisponiveis
        : [];

    return ordenarTamanhos(base);
  }, [produto]);

  const listaCores = useMemo(() => {
    if (!produto) return [];

    const base =
      Array.isArray(produto?.cores) && produto.cores.length > 0
        ? produto.cores
        : Array.isArray(produto?.coresDisponiveis) &&
          produto.coresDisponiveis.length > 0
        ? produto.coresDisponiveis
        : Array.isArray(produto?.variantesCores) &&
          produto.variantesCores.length > 0
        ? produto.variantesCores
        : [];

    return base
      .map((c: any) => {
        if (typeof c === "string") {
          return { nome: c, hex: null };
        }

        return {
          nome: c.nome || c.cor || c.label,
          hex: c.hex || c.codigo || c.color || null,
        };
      })
      .filter((c: any) => Boolean(c.nome));
  }, [produto]);

  const estoqueTamanhosObj = useMemo(() => {
    if (!produto) return {};

    let bruto =
      produto.estoquePorTamanho ??
      produto.tamanhosEstoque ??
      produto.estoqueTamanhos;

    if (typeof bruto === "string") {
      try {
        bruto = JSON.parse(bruto);
      } catch {
        return {};
      }
    }

    if (Array.isArray(bruto)) {
      const obj: Record<string, number> = {};

      bruto.forEach((item) => {
        if (item && typeof item === "object") {
          const tam =
            item.tamanho || item.tam || item.name || item.label;
          const qtd =
            item.quantidade ??
            item.qtd ??
            item.estoque ??
            item.stock ??
            item.qnt ??
            0;

          if (tam) {
            obj[String(tam).trim().toUpperCase()] = Number(qtd) || 0;
          }
        }
      });

      return obj;
    }

    if (bruto && typeof bruto === "object") {
      const obj: Record<string, number> = {};

      Object.entries(bruto).forEach(([k, v]) => {
        if (!k) return;

        if (v && typeof v === "object") {
          const subQtd =
            (v as any).quantidade ??
            (v as any).qtd ??
            (v as any).estoque ??
            0;

          obj[String(k).trim().toUpperCase()] = Number(subQtd) || 0;
        } else {
          obj[String(k).trim().toUpperCase()] = Number(v) || 0;
        }
      });

      return obj;
    }

    return {};
  }, [produto]);

  const getEstoqueDisponivel = (tam: string) => {
    if (estoqueTinyReal !== null) {
      return Math.max(0, Number(estoqueTinyReal) || 0);
    }

    // Produto sem tamanhos: o estoque fica no campo geral `estoque`.
    // Nesses produtos não existe tamanho para selecionar e, portanto,
    // eles devem continuar compráveis enquanto o estoque geral for maior que zero.
    if (!tam && listaTamanhos.length === 0) {
      return Math.max(
        0,
        Number(
          produto?.estoque ??
            produto?.quantidade ??
            produto?.qtd ??
            0
        ) || 0
      );
    }

    if (!tam) return 0;

    const tamClean = String(tam).trim().toUpperCase();
    const chaves = Object.keys(estoqueTamanhosObj);

    if (chaves.length > 0) {
      if (tamClean in estoqueTamanhosObj) {
        return Number(estoqueTamanhosObj[tamClean]) || 0;
      }

      return 0;
    }

    return Number(
      produto?.estoque ?? produto?.quantidade ?? produto?.qtd ?? 0
    );
  };

  const qtdNoCarrinho = useMemo(() => {
    if (!Array.isArray(carrinho) || !idProd) {
      return 0;
    }

    const produtoSemTamanho = listaTamanhos.length === 0;

    const item = carrinho.find((i: any) => {
      const itemProdId = String(
        i.produtoId || i.produto?.id || i.produto?._id || i.id || ""
      );
      const itemTam = String(i.tamanho || "").trim().toUpperCase();
      const itemCor = String(i.cor || "").trim().toUpperCase();
      const corAtual = String(corSelecionada || "")
        .trim()
        .toUpperCase();

      const mesmoTam = produtoSemTamanho
        ? true
        : itemTam === String(tamanhoSelecionado).trim().toUpperCase();
      const mesmaCor = !corAtual || itemCor === corAtual;

      return itemProdId === idProd && mesmoTam && mesmaCor;
    });

    return Number(item?.quantidade || item?.qtd || 0);
  }, [carrinho, idProd, tamanhoSelecionado, corSelecionada, listaTamanhos]);

  const estoqueMaxAtual = getEstoqueDisponivel(tamanhoSelecionado);
  const tamanhoAtualEsgotado =
    estoqueMaxAtual <= 0 || qtdNoCarrinho >= estoqueMaxAtual;

  const produtoSemTamanhos = listaTamanhos.length === 0;
  const produtoSemCores = listaCores.length === 0;
  const produtoSemVariacoes = produtoSemTamanhos && produtoSemCores;

  const isTamanhoEsgotado = (tam: string) => {
    const max = getEstoqueDisponivel(tam);

    if (max <= 0) return true;

    if (
      String(tam).trim().toUpperCase() ===
      String(tamanhoSelecionado).trim().toUpperCase()
    ) {
      return qtdNoCarrinho >= max;
    }

    return false;
  };

  const fotosGaleria = useMemo(() => {
    if (!produto) return [];

    const imagens = [
      produto.imagemUrl,
      produto.imagem,
      ...(Array.isArray(produto.imagens) ? produto.imagens : []),
      ...(Array.isArray(produto.fotos) ? produto.fotos : []),
      ...(Array.isArray(produto.galeria) ? produto.galeria : []),
    ].filter(Boolean);

    return Array.from(new Set(imagens));
  }, [produto]);

  useEffect(() => {
    if (!id) return;

    let ativo = true;

    async function carregarDados() {
      try {
        setCarregando(true);
        setImagemDaCor("");
        setEstoqueTinyReal(null);

        let produtoEncontrado: any = null;

        const resProduto = await fetch(`/api/produtos/${id}`).catch(() => null);

        if (resProduto && resProduto.ok) {
          const data = await resProduto.json();
          produtoEncontrado = data.produto || data;
        } else {
          const resTodos = await fetch("/api/produtos");

          if (resTodos.ok) {
            const dataTodos = await resTodos.json();
            const lista = Array.isArray(dataTodos)
              ? dataTodos
              : dataTodos.produtos || [];

            produtoEncontrado =
              lista.find(
                (p: any) => String(p.id || p._id) === String(id)
              ) || null;
          }
        }

        if (
          !ativo ||
          !produtoEncontrado ||
          !(produtoEncontrado.id || produtoEncontrado._id)
        ) {
          if (ativo) setProduto(null);
          return;
        }

        setProduto(produtoEncontrado);
        setImagemIndex(0);

        const tamanhosProduto = ordenarTamanhos(
          Array.isArray(produtoEncontrado.tamanhos)
            ? produtoEncontrado.tamanhos
            : Array.isArray(produtoEncontrado.tamanhosDisponiveis)
            ? produtoEncontrado.tamanhosDisponiveis
            : []
        );

        setTamanhoSelecionado(tamanhosProduto[0] || "");

        const cores =
          produtoEncontrado.cores ||
          produtoEncontrado.coresDisponiveis ||
          [];

        // Nenhuma cor fica selecionada automaticamente ao abrir o produto.
        // O cliente precisa escolher a cor antes de adicionar ao carrinho.
        setCorSelecionada("");
        setImagemDaCor("");

        // Consulta do estoque no Tiny usando o SKU/ID.
        // Mantida conforme a implementação atual do projeto.
        const skuBusca = produtoEncontrado.sku || produtoEncontrado.id || id;

        try {
          const token = process.env.NEXT_PUBLIC_TINY_API_TOKEN || "";

          const resTiny = await fetch(
            `https://api.tiny.com.br/public-api/v3/produtos?pesquisa=${encodeURIComponent(
              skuBusca
            )}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ).catch(() => null);

          if (resTiny && resTiny.ok && ativo) {
            const tinyData = await resTiny.json();

            if (tinyData.itens && tinyData.itens.length > 0) {
              const saldo = tinyData.itens[0].produto?.saldoEstoque;

              if (saldo !== undefined && saldo !== null) {
                setEstoqueTinyReal(Number(saldo));
              }
            }
          }
        } catch (err) {
          console.warn(
            "Aviso: Não foi possível buscar o estoque do Tiny diretamente no cliente.",
            err
          );
        }
      } catch (e) {
        console.error("Erro ao carregar produto:", e);

        if (ativo) {
          setProduto(null);
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarDados();

    return () => {
      ativo = false;
    };
  }, [id]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } =
      e.currentTarget.getBoundingClientRect();

    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;

    setZoomPos({ x, y });
  };

  const handleToggleFavorito = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!produto || !idProd) return;

    toggleFavorito({
      ...produto,
      id: idProd,
      produtoId: idProd,
    });
  };

  const handleSelecionarCor = (novaCor: string) => {
    setCorSelecionada(novaCor);
    setImagemIndex(0);

    const imagem = obterImagemDaCor(
      produto?.coresDetalhes,
      novaCor
    );

    setImagemDaCor(imagem);
  };

  const handleAdicionarCarrinho = async () => {
    if (!produto) return;

    if (listaCores.length > 0 && !corSelecionada) {
      mostrarToast(
        "Por favor, selecione uma cor antes de adicionar ao carrinho."
      );
      return;
    }

    if (qtdNoCarrinho >= estoqueMaxAtual) {
      mostrarToast(
        `Limite de estoque atingido! Restam apenas ${estoqueMaxAtual} unidade(s) no estoque.`
      );
      return;
    }

    setAdicionando(true);

    try {
      const res = await fetch("/api/cliente/carrinho", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          produtoId: idProd,
          tamanho: tamanhoSelecionado || "Único",
          cor: corSelecionada || null,
          quantidade: 1,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const responseData = await res.json().catch(() => ({}));

      if (!res.ok) {
        mostrarToast(
          responseData.message ||
            "Não há mais unidades disponíveis em estoque."
        );

        if (typeof recarregarCarrinho === "function") {
          await recarregarCarrinho();
        }

        return;
      }

      setSucessoAdicao(true);

      if (typeof recarregarCarrinho === "function") {
        await recarregarCarrinho();
      }

      setTimeout(() => setSucessoAdicao(false), 2000);
    } catch (e: any) {
      mostrarToast("Erro ao adicionar ao carrinho. Tente novamente.");
    } finally {
      setAdicionando(false);
    }
  };

  const handleCadastrarAviseMe = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    setEnviandoAviseMe(true);

    try {
      await fetch("/api/cliente/avise-me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          produtoId: idProd,
          tamanho: tamanhoSelecionado,
          cor: corSelecionada,
          email: emailAviseMe,
          telefone: telefoneAviseMe,
        }),
      }).catch(() => null);

      setSucessoAviseMe(true);

      setTimeout(() => {
        setSucessoAviseMe(false);
        setModalAviseMe(false);
      }, 2000);
    } finally {
      setEnviandoAviseMe(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex h-[70vh] items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
      </div>
    );
  }

  if (!produto) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center space-y-4 bg-slate-50 text-slate-800">
        <h1 className="text-xl font-bold text-slate-900">
          Produto não encontrado
        </h1>

        <Link
          href="/catalogo"
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-xs font-bold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Catálogo
        </Link>
      </div>
    );
  }

  const precoAtual = Number(
    produto.precoPromocional ?? produto.preco ?? 0
  );

  const precoOriginal = Number(produto.preco ?? 0);

  const porcentagemDesconto =
    produto.precoPromocional &&
    precoOriginal > produto.precoPromocional
      ? Math.round(
          ((precoOriginal - produto.precoPromocional) /
            precoOriginal) *
            100
        )
      : 0;

  const valorParcela = (precoAtual / 6).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  );

  // A foto específica da cor SEMPRE tem prioridade sobre a galeria comum.
  const imagemAtual =
    imagemDaCor ||
    fotosGaleria[imagemIndex] ||
    produto.imagemUrl ||
    produto.imagem;

  return (
    <div className="min-h-screen bg-slate-50 py-10 font-sans text-slate-800 relative">
      {toast.visivel && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 transform animate-bounce">
          <div className="flex items-center gap-2.5 rounded-2xl bg-amber-500 px-5 py-3 text-xs font-bold text-white shadow-2xl backdrop-blur-md">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{toast.mensagem}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4">
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Catálogo
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* GALERIA */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {fotosGaleria.length > 1 && (
              <div className="flex sm:flex-col gap-2.5 overflow-x-auto sm:overflow-y-auto max-h-[500px] w-full sm:w-24 flex-shrink-0 scrollbar-none">
                {fotosGaleria.map((img: string, idx: number) => (
                  <button
                    key={`${img}-${idx}`}
                    type="button"
                    onClick={() => {
                      // Ao selecionar manualmente uma imagem da galeria,
                      // deixamos de forçar a imagem específica da cor.
                      setImagemDaCor("");
                      setImagemIndex(idx);
                    }}
                    className={`relative h-20 w-20 sm:w-full aspect-square flex-shrink-0 overflow-hidden rounded-2xl border-2 transition-all duration-300 ${
                      !imagemDaCor && imagemIndex === idx
                        ? "border-slate-900 shadow-sm scale-105"
                        : "border-slate-200 bg-white opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img}
                      alt={`Thumb ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex-1 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm overflow-hidden group w-full">
              <button
                type="button"
                onClick={handleToggleFavorito}
                aria-label={
                  favoritado
                    ? "Remover dos favoritos"
                    : "Adicionar aos favoritos"
                }
                className={`absolute top-6 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md shadow-sm transition-all hover:scale-110 active:scale-95 ${
                  favoritado
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-slate-200 bg-white/90 text-slate-400 hover:text-slate-900"
                }`}
              >
                <Heart
                  className={`h-5 w-5 transition-colors ${
                    favoritado ? "fill-red-600 text-red-600" : ""
                  }`}
                />
              </button>

              {porcentagemDesconto > 0 && (
                <span className="absolute top-6 left-6 z-20 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 font-display text-xs font-black uppercase text-white shadow-md">
                  <Tag className="h-3.5 w-3.5" /> -
                  {porcentagemDesconto}% OFF
                </span>
              )}

              <div
                className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-50 border border-slate-100 relative cursor-crosshair flex items-center justify-center"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onMouseMove={handleMouseMove}
              >
                {imagemAtual ? (
                  <img
                    key={imagemAtual}
                    src={imagemAtual}
                    alt={produto.nome}
                    style={{
                      transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                    }}
                    className={`w-full h-full object-cover transition-all duration-700 ease-out ${
                      isHovered ? "scale-150" : "scale-100"
                    }`}
                  />
                ) : (
                  <div className="text-slate-400 text-xs font-semibold">
                    Sem imagem
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DETALHES DO PRODUTO */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm space-y-6">
            <div>
              {produto.categoria && (
                <span className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                  {typeof produto.categoria === "object"
                    ? produto.categoria.nome
                    : produto.categoria}
                </span>
              )}

              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                {produto.nome}
              </h1>

              <div className="mt-4 flex flex-wrap items-baseline gap-3 border-b border-slate-100 pb-5">
                <span className="text-3xl font-black text-slate-900">
                  {precoAtual.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>

                {produto.precoPromocional &&
                  precoOriginal > produto.precoPromocional && (
                    <span className="text-sm text-slate-400 line-through font-semibold">
                      De {precoOriginal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  )}

                <div className="w-full text-xs text-slate-500 font-medium flex items-center gap-1.5 pt-1">
                  <CreditCard className="h-4 w-4 text-slate-600" />
                  <span>
                    ou até <strong>6x de {valorParcela}</strong> sem juros
                  </span>
                </div>
              </div>
            </div>

            {/* SELEÇÃO DE CORES */}
            {listaCores.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-slate-500" />
                    Selecione a Cor:
                    {corSelecionada && (
                      <span className="font-normal text-slate-500 normal-case">
                        {corSelecionada}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {listaCores.map((item: any, idx: number) => {
                    const selecionado = corSelecionada === item.nome;
                    const corVisual = obterHexDaCor(
                      item.nome,
                      item.hex
                    );

                    return (
                      <button
                        key={`${item.nome}-${idx}`}
                        type="button"
                        onClick={() => handleSelecionarCor(item.nome)}
                        aria-label={`Selecionar cor ${item.nome}`}
                        title={item.nome}
                        className={`relative h-11 w-11 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                          selecionado
                            ? "border-slate-900 shadow-md scale-110 ring-2 ring-slate-200 ring-offset-2"
                            : "border-slate-200 bg-white hover:border-slate-400 hover:scale-105"
                        }`}
                      >
                        <span
                          className="h-8 w-8 rounded-full border border-black/10 shadow-inner"
                          style={{ backgroundColor: corVisual }}
                        />

                        {selecionado && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Check
                              className={`h-4 w-4 drop-shadow ${
                                [
                                  "#ffffff",
                                  "#facc15",
                                  "#d1d5db",
                                  "#f9a8d4",
                                  "#fff7d6",
                                ].includes(
                                  corVisual.toLowerCase()
                                )
                                  ? "text-slate-900"
                                  : "text-white"
                              }`}
                            />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {!corSelecionada && (
                  <p className="text-[11px] text-slate-400">
                    Escolha uma cor para continuar.
                  </p>
                )}
              </div>
            )}

            {/* SELEÇÃO DE TAMANHOS */}
            {listaTamanhos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-slate-700">
                    Selecione o Tamanho:
                  </span>

                  <button
                    type="button"
                    onClick={() => setModalGuiaTamanhos(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900"
                  >
                    <Ruler className="h-3.5 w-3.5" /> Guia de tamanhos
                  </button>
                </div>

                <div className="flex gap-2.5 flex-wrap">
                  {listaTamanhos.map((tam: string) => {
                    const esgotado = isTamanhoEsgotado(tam);
                    const selecionado = tamanhoSelecionado === tam;

                    return (
                      <button
                        key={tam}
                        type="button"
                        onClick={() => setTamanhoSelecionado(tam)}
                        className={`h-11 min-w-[48px] px-3.5 rounded-2xl text-xs font-bold uppercase border transition-all ${
                          selecionado
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400"
                        }`}
                      >
                        <span
                          className={
                            esgotado && !selecionado
                              ? "line-through opacity-50"
                              : ""
                          }
                        >
                          {tam}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AÇÃO E VERIFICAÇÃO DE ESTOQUE */}
            <div className="space-y-3 pt-2">
              {tamanhoAtualEsgotado ? (
                <div className="space-y-2 animate-fadeIn">
                  <div className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 py-3.5 px-4 text-xs font-bold text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span>
                      {estoqueMaxAtual === 0
                        ? "Sem disponibilidade no estoque para este tamanho."
                        : `Sem disponibilidade no estoque. Você já adicionou todas as ${estoqueMaxAtual} unidades disponíveis ao seu carrinho.`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalAviseMe(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-800 py-4 text-xs font-black uppercase text-white hover:bg-slate-900 transition-colors"
                  >
                    <Bell className="h-4 w-4" /> Avisar-me quando chegar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAdicionarCarrinho}
                  disabled={adicionando}
                  className={`w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-xs font-black uppercase text-white transition-all ${
                    sucessoAdicao
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-slate-900 hover:bg-slate-800"
                  }`}
                >
                  {adicionando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : sucessoAdicao ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <ShoppingBag className="h-4 w-4" />
                  )}

                  {adicionando
                    ? "Adicionando..."
                    : sucessoAdicao
                    ? "Adicionado ao Carrinho!"
                    : "Adicionar ao Carrinho"}
                </button>
              )}
            </div>

            {/* DESCRIÇÃO DO PRODUTO */}
            {produto.descricao && (
              <div className="border-t border-slate-100 pt-5 space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Descrição do Produto
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {produto.descricao}
                </p>
              </div>
            )}

            {/* SELOS E BENEFÍCIOS */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <Truck className="h-5 w-5 text-slate-700 flex-shrink-0" />

                <div className="text-[11px]">
                  <p className="font-bold text-slate-900">
                    Entrega para todo Brasil
                  </p>
                  <p className="text-slate-500">
                    Com rastreamento online
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <ShieldCheck className="h-5 w-5 text-slate-700 flex-shrink-0" />

                <div className="text-[11px]">
                  <p className="font-bold text-slate-900">
                    Compra 100% Segura
                  </p>
                  <p className="text-slate-500">
                    Garantia e suporte
                  </p>
                </div>
              </div>
            </div>

            {/* SANFONADOS */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setAbaAberta(
                      abaAberta === "cuidados" ? null : "cuidados"
                    )
                  }
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-slate-600" />
                    Cuidados com a Peça
                  </span>

                  {abaAberta === "cuidados" ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>

                {abaAberta === "cuidados" && (
                  <div className="p-4 text-xs text-slate-600 space-y-1.5 bg-white border-t border-slate-100 leading-relaxed">
                    <p>• Lavar preferencialmente à mão ou em ciclo delicado na máquina.</p>
                    <p>• Não usar alvejantes a base de cloro.</p>
                    <p>• Secar à sombra para preservar a vivacidade das cores.</p>
                    <p>• Passar a ferro em temperatura baixa/média.</p>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setAbaAberta(
                      abaAberta === "trocas" ? null : "trocas"
                    )
                  }
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-600" />
                    Trocas e Devoluções
                  </span>

                  {abaAberta === "trocas" ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>

                {abaAberta === "trocas" && (
                  <div className="p-4 text-xs text-slate-600 space-y-1.5 bg-white border-t border-slate-100 leading-relaxed">
                    <p>• Primeira troca grátis em até 7 dias após o recebimento.</p>
                    <p>• O produto deve estar sem marcas de uso e com as etiquetas originais afixadas.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL GUIA DE TAMANHOS */}
      {modalGuiaTamanhos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl relative">
            <button
              type="button"
              onClick={() => setModalGuiaTamanhos(false)}
              className="absolute top-4 right-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Ruler className="h-5 w-5 text-slate-900" />
              <h3 className="text-base font-bold text-slate-900">
                Guia de Tamanhos
              </h3>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Tamanho</th>
                    <th className="p-3">Idade</th>
                    <th className="p-3">Altura (cm)</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-slate-600">
                  <tr><td className="p-3 font-semibold text-slate-900">RN</td><td className="p-3">0 a 1 mês</td><td className="p-3">50 - 55</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">P</td><td className="p-3">1 a 3 meses</td><td className="p-3">55 - 60</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">M</td><td className="p-3">3 a 6 meses</td><td className="p-3">60 - 65</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">G</td><td className="p-3">6 a 9 meses</td><td className="p-3">65 - 70</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">GG</td><td className="p-3">9 a 12 meses</td><td className="p-3">70 - 75</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">1</td><td className="p-3">12 a 18 meses</td><td className="p-3">75 - 82</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">2</td><td className="p-3">2 anos</td><td className="p-3">82 - 88</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">3</td><td className="p-3">3 anos</td><td className="p-3">88 - 95</td></tr>
                  <tr><td className="p-3 font-semibold text-slate-900">4</td><td className="p-3">4 anos</td><td className="p-3">95 - 104</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AVISE-ME */}
      {modalAviseMe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl relative">
            <button
              type="button"
              onClick={() => setModalAviseMe(false)}
              className="absolute top-4 right-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-5 w-5 text-slate-900" />
              <h3 className="text-base font-bold text-slate-900">
                Avisar quando chegar
              </h3>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Deixe seus dados para avisarmos assim que o tamanho{" "}
              <strong>{tamanhoSelecionado}</strong>{" "}
              {corSelecionada ? `na cor ${corSelecionada}` : ""} estiver de volta ao estoque.
            </p>

            {sucessoAviseMe ? (
              <div className="rounded-2xl bg-emerald-50 p-4 text-center text-xs font-bold text-emerald-700 border border-emerald-200">
                ✓ Solicitação enviada com sucesso!
              </div>
            ) : (
              <form onSubmit={handleCadastrarAviseMe} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                    E-mail
                  </label>

                  <input
                    type="email"
                    required
                    placeholder="seuemail@exemplo.com"
                    value={emailAviseMe}
                    onChange={(e) => setEmailAviseMe(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                    WhatsApp / Telefone
                  </label>

                  <input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={telefoneAviseMe}
                    onChange={(e) => setTelefoneAviseMe(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={enviandoAviseMe}
                  className="w-full rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  {enviandoAviseMe && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Cadastrar Alerta
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
