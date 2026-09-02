"use client";

import { useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCarrinho } from "@/lib/carrinho-context";
import { CheckCircle2, Home, User } from "lucide-react";

function ConteudoSucesso() {
  const searchParams = useSearchParams();
  const { limparCarrinho } = useCarrinho();
  const executadoRef = useRef(false);

  const orderId = searchParams.get("orderId");
  const transactionId = searchParams.get("transaction_id");

  useEffect(() => {
    async function processarConfirmacao() {
      if (executadoRef.current) return;
      executadoRef.current = true;

      // 1. Limpa o carrinho local e no banco
      if (limparCarrinho) {
        limparCarrinho();
      }

      // 2. Atualiza a situação do pedido para PAGO e reduz o estoque
      if (orderId) {
        try {
          await fetch("/api/pedidos/confirmar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, transactionId }),
          });
        } catch (error) {
          console.error("Erro ao confirmar o pagamento:", error);
        }
      }
    }

    processarConfirmacao();
  }, [orderId, transactionId, limparCarrinho]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center font-sans text-slate-800">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
        <CheckCircle2 className="h-12 w-12" />
      </div>

      <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">
        Pagamento Confirmado
      </span>

      <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
        Muito obrigado pelo seu pedido! 🎉
      </h1>

      <p className="mt-3 text-sm text-slate-600 leading-relaxed">
        Sua compra foi recebida com sucesso, o estoque foi atualizado e o pedido já está disponível em seu perfil.
      </p>

      {(orderId || transactionId) && (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500 space-y-1.5 text-left">
          {orderId && (
            <p className="flex justify-between">
              <span className="font-semibold text-slate-700">Número do Pedido:</span>
              <span className="font-mono text-violet-600 font-bold">{orderId}</span>
            </p>
          )}
          {transactionId && (
            <p className="flex justify-between border-t border-slate-200/60 pt-1.5">
              <span className="font-semibold text-slate-700">ID da Transação:</span>
              <span className="font-mono text-slate-600 truncate max-w-[200px]">{transactionId}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 font-display text-sm font-bold uppercase text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700 transition-all hover:scale-[1.02] active:scale-95"
        >
          <Home className="h-4 w-4" /> Voltar ao Início
        </Link>
        <Link
          href="/perfil"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 font-display text-sm font-bold uppercase text-slate-700 hover:bg-slate-50 transition-all"
        >
          <User className="h-4 w-4" /> Ver Meus Pedidos
        </Link>
      </div>
    </div>
  );
}

export default function PaginaPedidoSucesso() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-4 py-16 text-center font-sans text-slate-600">
          Carregando confirmação do pedido...
        </div>
      }
    >
      <ConteudoSucesso />
    </Suspense>
  );
}