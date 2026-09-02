"use client"

import { useState } from "react"
import { useCarrinho } from "@/lib/carrinho-context"
import { useRouter } from "next/navigation"

export default function PaginaCheckout() {
  const carrinho = useCarrinho() as any
  const { itens = [], totalPreco = 0, remover } = carrinho
  const router = useRouter()

  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix")
  const [carregando, setCarregando] = useState(false)
  const [pixDados, setPixDados] = useState<{ qrCodeBase64?: string; qrCodeCopiaECola?: string } | null>(null)
  const [erro, setErro] = useState("")

  // Estado do formulário de Cartão
  const [cartao, setCartao] = useState({
    numero: "",
    nome: "",
    validadeMes: "",
    validadeAno: "",
    cvv: "",
    cpf: "",
    parcelas: "1",
  })

  // Função auxiliar para esvaziar o carrinho de forma segura
  const esvaziarCarrinhoSeguro = () => {
    if (typeof carrinho.limparCarrinho === "function") {
      carrinho.limparCarrinho()
    } else if (typeof carrinho.limpar === "function") {
      carrinho.limpar()
    } else if (typeof carrinho.esvaziar === "function") {
      carrinho.esvaziar()
    } else if (remover && Array.isArray(itens)) {
      // Fallback: Remove todos os itens um por um
      itens.forEach((item: any) => {
        remover(item.slug || item.id, item.tamanho)
      })
    }
  }

  async function handleFinalizarCompra(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro("")

    try {
      const payload: any = {
        itens,
        meiodepagamento: metodo === "pix" ? "pix" : "credit_card",
      }

      if (metodo === "cartao") {
        payload.dadosCartao = {
          paymentMethodId: "master",
          token: "TEST_TOKEN_SIMULADO",
          installments: Number(cartao.parcelas),
          payer: {
            email: "teste_user_123456@testuser.com",
            cpf: cartao.cpf.replace(/\D/g, ""),
          },
        }
      }

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || "Falha ao processar pagamento.")
      }

      if (metodo === "pix" && data.pix) {
        esvaziarCarrinhoSeguro()
        setPixDados(data.pix)
      } else {
        esvaziarCarrinhoSeguro()
        alert("Pagamento efetuado com sucesso! 🎉")
        router.push("/")
      }
    } catch (err: any) {
      setErro(err.message || "Ocorreu um erro ao processar o checkout.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-ink mb-6">Checkout & Pagamento</h1>

      {erro && (
        <div className="mb-4 rounded-xl bg-red-100 p-4 text-sm text-red-700">
          {erro}
        </div>
      )}

      {metodo === "pix" && pixDados ? (
        <div className="rounded-2xl border-2 border-ink/10 bg-white p-6 text-center space-y-6">
          <h3 className="font-bold text-xl text-ink">Pedido Gerado com Sucesso!</h3>
          <p className="text-sm text-ink/70">
            Seu carrinho já foi limpo. Escaneie o QR Code abaixo para concluir o pagamento:
          </p>

          {pixDados.qrCodeBase64 && (
            <img
              src={`data:image/png;base64,${pixDados.qrCodeBase64}`}
              alt="QR Code PIX"
              className="mx-auto h-48 w-48 rounded-xl border p-2"
            />
          )}

          <div className="text-xs break-all bg-cream p-3 rounded-xl border border-ink/10 font-mono text-ink/80">
            {pixDados.qrCodeCopiaECola}
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full rounded-full bg-berry p-4 font-display text-sm font-bold uppercase text-white shadow-lg transition-transform hover:scale-[1.02]"
          >
            Voltar para a Página Inicial
          </button>
        </div>
      ) : (
        <form onSubmit={handleFinalizarCompra} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMetodo("pix")}
              className={`rounded-2xl border-2 p-4 font-bold text-sm transition-all ${
                metodo === "pix"
                  ? "border-berry bg-berry/10 text-berry"
                  : "border-ink/10 text-ink/70"
              }`}
            >
              📱 Pagar com PIX
            </button>
            <button
              type="button"
              onClick={() => setMetodo("cartao")}
              className={`rounded-2xl border-2 p-4 font-bold text-sm transition-all ${
                metodo === "cartao"
                  ? "border-berry bg-berry/10 text-berry"
                  : "border-ink/10 text-ink/70"
              }`}
            >
              💳 Cartão de Crédito
            </button>
          </div>

          {metodo === "cartao" && (
            <div className="space-y-4 rounded-2xl border-2 border-ink/10 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-ink">Dados do Cartão de Crédito</h3>
              
              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Número do Cartão</label>
                <input
                  type="text"
                  placeholder="4000 0000 0000 0000"
                  value={cartao.numero}
                  onChange={(e) => setCartao({ ...cartao, numero: e.target.value })}
                  className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Nome Impresso no Cartão</label>
                  <input
                    type="text"
                    placeholder="APROVADO"
                    value={cartao.nome}
                    onChange={(e) => setCartao({ ...cartao, nome: e.target.value })}
                    className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">CPF do Titular</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={cartao.cpf}
                    onChange={(e) => setCartao({ ...cartao, cpf: e.target.value })}
                    className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Mês (MM)</label>
                  <input
                    type="text"
                    placeholder="11"
                    maxLength={2}
                    value={cartao.validadeMes}
                    onChange={(e) => setCartao({ ...cartao, validadeMes: e.target.value })}
                    className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Ano (AA)</label>
                  <input
                    type="text"
                    placeholder="28"
                    maxLength={2}
                    value={cartao.validadeAno}
                    onChange={(e) => setCartao({ ...cartao, validadeAno: e.target.value })}
                    className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">CVV</label>
                  <input
                    type="text"
                    placeholder="123"
                    maxLength={4}
                    value={cartao.cvv}
                    onChange={(e) => setCartao({ ...cartao, cvv: e.target.value })}
                    className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Parcelas</label>
                <select
                  value={cartao.parcelas}
                  onChange={(e) => setCartao({ ...cartao, parcelas: e.target.value })}
                  className="w-full rounded-xl border border-ink/20 p-3 text-sm"
                >
                  <option value="1">1x à vista (R$ {totalPreco.toFixed(2)})</option>
                  <option value="2">2x sem juros (R$ {(totalPreco / 2).toFixed(2)})</option>
                  <option value="3">3x sem juros (R$ {(totalPreco / 3).toFixed(2)})</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-full bg-berry p-4 font-display text-sm font-bold uppercase text-white shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {carregando ? "Processando..." : `Finalizar e Pagar R$ ${totalPreco.toFixed(2)}`}
          </button>
        </form>
      )}
    </div>
  )
}