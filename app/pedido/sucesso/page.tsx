"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCarrinho } from "@/lib/carrinho-context";
import {
  CheckCircle2,
  Home,
  User,
  Loader2,
  AlertCircle,
  PackageCheck,
  ExternalLink,
} from "lucide-react";

type ResultadoConfirmacao = {
  success?: boolean;
  orderId?: string;
  alreadyPaid?: boolean;
  message?: string;
  error?: string;
  pagamento?: {
    verificado?: boolean;
    motivo?: string;
    paid?: boolean;
    amount?: number | null;
    paidAmount?: number | null;
    captureMethod?: string | null;
    transactionNsu?: string | null;
    slug?: string | null;
    receiptUrl?: string | null;
  };
  baixaEstoque?: {
    executada?: boolean;
    motivo?: string;
    itens?: Array<{
      itemId: string;
      produtoId: string;
      produtoNome: string;
      quantidade: number;
      estoqueAntes: number;
      estoqueDepois: number;
      tamanho: string | null;
      cor: string | null;
    }>;
  };
};

function ConteudoSucesso() {
  const searchParams = useSearchParams();
  const { limparCarrinho } = useCarrinho();
  const executadoRef = useRef(false);
  const [carregando, setCarregando] = useState(true);
  const [confirmacao, setConfirmacao] =
    useState<ResultadoConfirmacao | null>(null);
  const [erro, setErro] = useState("");

  const orderId =
    searchParams.get("order_nsu") || searchParams.get("orderId") || "";

  const transactionNsu =
    searchParams.get("transaction_nsu") ||
    searchParams.get("transaction_id") ||
    "";

  const slug = searchParams.get("slug") || "";
  const receiptUrl = searchParams.get("receipt_url") || "";
  const captureMethod = searchParams.get("capture_method") || "";

  useEffect(() => {
    async function processarConfirmacao() {
      if (executadoRef.current) return;
      executadoRef.current = true;

      if (!orderId) {
        setErro("Não foi possível identificar o pedido recebido da InfinitePay.");
        setCarregando(false);
        return;
      }

      try {
        const response = await fetch("/api/pedidos/confirmar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            orderId,
            order_nsu: orderId,
            transactionId: transactionNsu || null,
            transaction_nsu: transactionNsu || null,
            slug: slug || null,
            receipt_url: receiptUrl || null,
            capture_method: captureMethod || null,
          }),
        });

        const raw = await response.text();
        let data: ResultadoConfirmacao = {};

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            `O servidor não retornou JSON válido. HTTP ${response.status}`
          );
        }

        console.log("[PEDIDO SUCESSO] Confirmação recebida:", data);

        if (!response.ok || data.success !== true) {
          throw new Error(
            data.error ||
              data.message ||
              `Erro HTTP ${response.status} ao confirmar o pagamento.`
          );
        }

        setConfirmacao(data);

        // O carrinho só é limpo depois que o servidor confirmou o pedido.
        try {
          if (limparCarrinho) {
            await limparCarrinho();
          }
        } catch (errorCarrinho) {
          console.error(
            "Erro ao limpar o carrinho após confirmação:",
            errorCarrinho
          );
        }
      } catch (error: any) {
        console.error("❌ Erro na confirmação do pedido:", error);
        setErro(
          error?.message ||
            "Não foi possível concluir a confirmação do pedido."
        );
      } finally {
        setCarregando(false);
      }
    }

    processarConfirmacao();
  }, [
    orderId,
    transactionNsu,
    slug,
    receiptUrl,
    captureMethod,
    limparCarrinho,
  ]);

  if (carregando) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-emerald-600" />
          <h1 className="mt-5 text-2xl font-black text-slate-900">
            Confirmando seu pagamento...
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Estamos verificando a transação e atualizando o estoque da loja.
          </p>
        </div>
      </main>
    );
  }

  if (erro || !confirmacao?.success) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-5 text-2xl font-black text-slate-900">
            Não conseguimos concluir a confirmação
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {erro || "O pagamento não pôde ser confirmado neste momento."}
          </p>

          {orderId ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Pedido: <strong className="text-slate-700">{orderId}</strong>
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <Home className="h-4 w-4" /> Voltar para a loja
            </Link>
            <Link
              href="/minha-conta"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <User className="h-4 w-4" /> Minha conta
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const itensBaixados = confirmacao.baixaEstoque?.itens || [];
  const estoqueFoiBaixado =
    confirmacao.alreadyPaid === true ||
    confirmacao.baixaEstoque?.executada === true;

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          <h1 className="mt-5 text-3xl font-black text-slate-900">
            Pagamento confirmado!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Seu pedido foi confirmado com sucesso.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <PackageCheck className="h-4 w-4" /> Estoque
            </div>
            <p className="mt-2 text-sm font-bold text-emerald-700">
              {estoqueFoiBaixado
                ? "Estoque local atualizado"
                : "Pedido já estava confirmado"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {itensBaixados.length > 0
                ? `${itensBaixados.length} item(ns) processado(s).`
                : "Nenhuma nova baixa foi necessária."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Pedido
            </p>
            <p className="mt-2 break-all text-sm font-bold text-slate-800">
              #{confirmacao.orderId || orderId}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Forma: {confirmacao.pagamento?.captureMethod || captureMethod || "online"}
            </p>
          </div>
        </div>

        {itensBaixados.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-black text-slate-900">
              Baixa de estoque realizada
            </h2>
            <div className="mt-3 space-y-2">
              {itensBaixados.map((item) => (
                <div
                  key={item.itemId}
                  className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {item.produtoNome}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.quantidade} unidade(s)
                      {item.tamanho ? ` · Tam. ${item.tamanho}` : ""}
                      {item.cor ? ` · ${item.cor}` : ""}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-slate-600">
                    {item.estoqueAntes} → {item.estoqueDepois} un.
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {confirmacao.pagamento?.receiptUrl || receiptUrl ? (
          <a
            href={confirmacao.pagamento?.receiptUrl || receiptUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" /> Abrir comprovante de pagamento
          </a>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            <Home className="h-4 w-4" /> Voltar para a loja
          </Link>
          <Link
            href="/minha-conta"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <User className="h-4 w-4" /> Minha conta
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PedidoSucessoPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        </main>
      }
    >
      <ConteudoSucesso />
    </Suspense>
  );
}
