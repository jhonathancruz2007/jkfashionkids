"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCarrinho } from "@/lib/carrinho-context";
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Tag,
  Check,
  Ticket,
  Loader2,
  AlertCircle,
} from "lucide-react";

const formatador = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function CarrinhoLateral() {
  const router = useRouter();
  const {
    itens = [],
    carrinhoAberto,
    fecharCarrinho,
    removerDoCarrinho,
    atualizarQuantidade,
    valorTotal = 0,
    limparCarrinho,
  } = useCarrinho() as any;

  // Estado para controlar o loading ao verificar o estoque
  const [verificandoId, setVerificandoId] = useState<string | null>(null);

  // Estado para a Notificação Personalizada (Toast)
  const [notificacao, setNotificacao] = useState<string | null>(null);

  // Estados do Cupom
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; porcentagem: number } | null>(null);
  const [erroCupom, setErroCupom] = useState("");

  const CUPONS_VALIDOS: Record<string, number> = {
    DESCONTO10: 10,
    BENVINDO15: 15,
    PRIMEIRACOMPRA: 20,
  };

  const mostrarNotificacao = (mensagem: string) => {
    setNotificacao(mensagem);
    setTimeout(() => {
      setNotificacao(null);
    }, 4000);
  };

  const handleAplicarCupom = (e: React.FormEvent) => {
    e.preventDefault();
    setErroCupom("");
    const codigoLimpo = cupomTexto.trim().toUpperCase();

    if (!codigoLimpo) {
      setErroCupom("Digite um cupom válido");
      return;
    }

    if (CUPONS_VALIDOS[codigoLimpo]) {
      setCupomAplicado({
        codigo: codigoLimpo,
        porcentagem: CUPONS_VALIDOS[codigoLimpo],
      });
      setCupomTexto("");
    } else {
      setErroCupom("Cupom inválido ou expirado");
    }
  };

  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setErroCupom("");
  };

  // Função para Incrementar Quantidade com Validação de Estoque
  const handleAumentarQuantidade = async (item: any) => {
    const itemProdId = String(item.produtoId || item.id || item._id || "");
    const itemTamanho = String(item.tamanho || "").trim().toUpperCase();
    const novaQtdDesejada = item.quantidade + 1;
    const itemChaveUnica = `${itemProdId}-${itemTamanho}`;

    setVerificandoId(itemChaveUnica);

    try {
      // Busca dados atualizados do produto para conferir estoque
      const res = await fetch(`/api/produtos/${itemProdId}`).catch(() => null);
      let produto = null;

      if (res && res.ok) {
        const data = await res.json();
        produto = data.produto || data;
      }

      let estoqueMaximo = 0;

      if (produto) {
        let bruto = produto.estoquePorTamanho ?? produto.tamanhosEstoque ?? produto.estoqueTamanhos;

        if (typeof bruto === "string") {
          try { bruto = JSON.parse(bruto); } catch { bruto = null; }
        }

        if (Array.isArray(bruto)) {
          const itemEstoque = bruto.find((i: any) => {
            const tam = String(i?.tamanho || i?.tam || i?.name || i?.label || "").trim().toUpperCase();
            return tam === itemTamanho;
          });
          estoqueMaximo = Number(itemEstoque?.quantidade ?? itemEstoque?.qtd ?? itemEstoque?.estoque ?? 0);
        } else if (bruto && typeof bruto === "object") {
          const subValor = bruto[itemTamanho];
          if (subValor && typeof subValor === "object") {
            estoqueMaximo = Number(subValor.quantidade ?? subValor.qtd ?? subValor.estoque ?? 0);
          } else {
            estoqueMaximo = Number(subValor || 0);
          }
        } else {
          estoqueMaximo = Number(produto.estoque ?? produto.quantidade ?? produto.qtd ?? 0);
        }
      } else {
        // Fallback caso a rota específica não exista: lê o limite que veio no próprio item se houver
        estoqueMaximo = Number(item.estoqueMaximo || item.estoque || 99);
      }

      if (novaQtdDesejada > estoqueMaximo) {
        if (estoqueMaximo === 1) {
          mostrarNotificacao("Limite de estoque atingido! Restam apenas está única unidade no estoque.");
        } else {
          mostrarNotificacao(`Limite de estoque atingido! Restam apenas ${estoqueMaximo} unidades no estoque.`);
        }
        return;
      }

      await atualizarQuantidade(item.id || item.produtoId, item.tamanho, novaQtdDesejada);
    } catch (error) {
      console.error("Erro ao verificar estoque:", error);
      mostrarNotificacao("Não foi possível verificar o estoque no momento.");
    } finally {
      setVerificandoId(null);
    }
  };

  // Cálculos de Valores
  const subtotalComDesconto =
    valorTotal ||
    itens.reduce((acc: number, item: any) => acc + item.preco * item.quantidade, 0);

  const subtotalOriginal = itens.reduce((acc: number, item: any) => {
    const precoBase =
      item.precoOriginal && item.precoOriginal > item.preco
        ? item.precoOriginal
        : item.preco;
    return acc + precoBase * item.quantidade;
  }, 0);

  const descontoProdutos = Math.max(0, subtotalOriginal - subtotalComDesconto);

  const valorDescontoCupom = cupomAplicado
    ? (subtotalComDesconto * cupomAplicado.porcentagem) / 100
    : 0;

  const totalFinal = Math.max(0, subtotalComDesconto - valorDescontoCupom);
  const descontoTotalAcumulado = descontoProdutos + valorDescontoCupom;

  if (!carrinhoAberto) return null;

  const handleFinalizarCompra = () => {
    fecharCarrinho();
    router.push("/checkout/confirmacao");
  };

  const handleVerMaisProdutos = () => {
    fecharCarrinho();
    router.push("/catalogo");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-sans">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={fecharCarrinho}
      />

      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white border-l border-slate-200 p-6 shadow-2xl text-slate-800">
        
        {/* Toast Notificação Personalizada */}
        {notificacao && (
          <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-amber-500 text-white p-3.5 shadow-xl transition-all animate-in fade-in slide-in-from-top-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-100" />
              <p className="text-xs font-bold leading-tight">{notificacao}</p>
            </div>
            <button
              onClick={() => setNotificacao(null)}
              className="rounded-lg p-1 text-amber-100 hover:bg-amber-600 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-slate-900 tracking-tight">
                Seu Carrinho
              </h2>
              <span className="text-[11px] font-semibold text-slate-400 block -mt-1">
                {itens.length} {itens.length === 1 ? "item selecionado" : "itens selecionados"}
              </span>
            </div>
          </div>
          <button
            onClick={fecharCarrinho}
            aria-label="Fechar carrinho"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lista de Itens */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 custom-scrollbar">
          {itens.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-300">
                <ShoppingBag className="h-10 w-10" />
              </div>
              <p className="font-extrabold text-slate-800 text-sm">
                Seu carrinho está vazio
              </p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">
                Explore o nosso catálogo e adicione suas peças favoritas!
              </p>
              <button
                type="button"
                onClick={handleVerMaisProdutos}
                className="mt-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-all"
              >
                Ver Produtos
              </button>
            </div>
          ) : (
            itens.map((item: any) => {
              const temDesconto =
                item.precoOriginal && item.precoOriginal > item.preco;
              const prodId = String(item.produtoId || item.id || item._id || "");
              const tam = String(item.tamanho || "").trim().toUpperCase();
              const chaveUnica = `${prodId}-${tam}`;
              const carregandoEsteItem = verificandoId === chaveUnica;

              return (
                <div
                  key={`${item.id || item.slug}-${item.tamanho}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="relative h-18 w-18 overflow-hidden rounded-xl bg-white border border-slate-200 flex-shrink-0">
                    <Image
                      src={item.imagemUrl || item.imagem || "/placeholder.png"}
                      alt={item.nome || "Produto"}
                      fill
                      className="object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-extrabold text-slate-900 truncate">
                      {item.nome}
                    </h4>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-lg bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                        Tam: {item.tamanho}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <p className="text-xs font-black text-slate-900">
                        {formatador.format(item.preco * item.quantidade)}
                      </p>
                      {temDesconto && (
                        <span className="text-[10px] font-medium text-slate-400 line-through">
                          {formatador.format(item.precoOriginal! * item.quantidade)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between gap-3 self-stretch">
                    <button
                      onClick={() => removerDoCarrinho(item.id || item.produtoId, item.tamanho)}
                      aria-label="Remover item"
                      className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
                      <button
                        onClick={() =>
                          atualizarQuantidade(
                            item.id || item.produtoId,
                            item.tamanho,
                            item.quantidade - 1
                          )
                        }
                        disabled={carregandoEsteItem || item.quantidade <= 1}
                        aria-label="Diminuir quantidade"
                        className="text-slate-500 hover:text-amber-600 transition-colors p-0.5 disabled:opacity-30"
                      >
                        <Minus className="h-3 w-3" />
                      </button>

                      <span className="text-xs font-extrabold w-4 text-center text-slate-800">
                        {carregandoEsteItem ? (
                          <Loader2 className="h-3 w-3 animate-spin mx-auto text-slate-500" />
                        ) : (
                          item.quantidade
                        )}
                      </span>

                      <button
                        onClick={() => handleAumentarQuantidade(item)}
                        disabled={carregandoEsteItem}
                        aria-label="Aumentar quantidade"
                        className="text-slate-500 hover:text-amber-600 transition-colors p-0.5 disabled:opacity-30"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Cupom e Detalhamento */}
        {itens.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            {/* Seção Cupom */}
            <div className="space-y-1">
              {!cupomAplicado ? (
                <form onSubmit={handleAplicarCupom} className="flex gap-2">
                  <div className="relative flex-1">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cupom de desconto"
                      value={cupomTexto}
                      onChange={(e) => setCupomTexto(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs font-semibold uppercase placeholder:normal-case placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 active:scale-95 transition-all"
                  >
                    Aplicar
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>
                      Cupom <strong>{cupomAplicado.codigo}</strong> (-{cupomAplicado.porcentagem}%)
                    </span>
                  </div>
                  <button
                    onClick={handleRemoverCupom}
                    className="text-[11px] font-bold text-emerald-700 hover:text-red-600 underline"
                  >
                    Remover
                  </button>
                </div>
              )}
              {erroCupom && (
                <p className="text-[11px] font-semibold text-red-500 pl-1">
                  {erroCupom}
                </p>
              )}
            </div>

            {/* Detalhamento de Valores */}
            <div className="space-y-2 rounded-2xl bg-slate-50 p-3.5 border border-slate-100 text-xs">
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>Subtotal:</span>
                <span>{formatador.format(subtotalOriginal)}</span>
              </div>

              {descontoTotalAcumulado > 0 && (
                <div className="flex justify-between items-center font-bold text-emerald-600">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Desconto Total:
                  </span>
                  <span>- {formatador.format(descontoTotalAcumulado)}</span>
                </div>
              )}

              <div className="border-t border-slate-200/60 my-1" />

              <div className="flex justify-between items-center text-base font-extrabold text-slate-900 pt-0.5">
                <span>Total a pagar:</span>
                <span className="text-xl font-black text-slate-900">
                  {formatador.format(totalFinal)}
                </span>
              </div>
            </div>

            {/* Ações Finais */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleFinalizarCompra}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all"
              >
                <span>Finalizar Compra</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleVerMaisProdutos}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all"
              >
                Ver mais produtos
              </button>
            </div>

            <button
              type="button"
              onClick={limparCarrinho}
              className="w-full text-center text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors pt-1"
            >
              Esvaziar carrinho
            </button>
          </div>
        )}
      </div>
    </div>
  );
}