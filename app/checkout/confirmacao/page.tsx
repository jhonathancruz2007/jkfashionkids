"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCarrinho } from "@/lib/carrinho-context";
import { Store, Truck, ArrowLeft, ArrowRight, MapPin, Loader2, AlertCircle, Tag } from "lucide-react";

interface ItemCarrinho {
  id?: string | number;
  produtoId?: string | number;
  slug?: string;
  nome: string;
  preco: number;
  precoOriginal?: number;
  quantidade: number;
  tamanho: string;
  imagem?: string;
  imagemUrl?: string;
}

interface Endereco {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  complemento: string;
}

interface Cliente {
  nome?: string;
  name?: string;
  email?: string;
  telefone?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  complemento?: string;
  endereco?: Partial<Endereco>;
}

const formatador = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function mascararCEP(valor: string) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

export default function PaginaConfirmacao() {
  const { itens = [], valorTotal = 0 } = useCarrinho();
  const router = useRouter();

  const secaoFormularioRef = useRef<HTMLDivElement>(null);

  // Padronizado para "entrega" para exibir e validar o CEP de imediato
  const [tipoEntrega, setTipoEntrega] = useState<"retirada" | "entrega">("entrega");
  const [valorFrete, setValorFrete] = useState(0);
  const [calculandoFrete, setCalculandoFrete] = useState(false);
  const [processandoPagamento, setProcessandoPagamento] = useState(false);

  const [carregandoCep, setCarregandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");

  const [errosCampos, setErrosCampos] = useState<{ cep?: string; numero?: string }>({});

  const [clienteLogado, setClienteLogado] = useState<Cliente | null>(null);

  const [endereco, setEndereco] = useState<Endereco>({
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
    complemento: "",
  });

  const subtotalComDesconto = valorTotal || itens.reduce((acc: number, item: ItemCarrinho) => acc + item.preco * item.quantidade, 0);

  const subtotalOriginal = itens.reduce((acc: number, item: ItemCarrinho) => {
    const precoBase = item.precoOriginal && item.precoOriginal > item.preco
      ? item.precoOriginal
      : item.preco;
    return acc + precoBase * item.quantidade;
  }, 0);

  const totalDesconto = Math.max(0, subtotalOriginal - subtotalComDesconto);
  const totalFinal = subtotalComDesconto + valorFrete;

  const calcularFretePorDistancia = useCallback(async (cepDestino: string) => {
    const cepLimpo = cepDestino.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;

    setCalculandoFrete(true);
    try {
      const response = await fetch(`/api/calcular-frete?cep=${cepLimpo}`);
      const data = await response.json();

      if (data && typeof data.valorFrete === "number") {
        setValorFrete(data.valorFrete);
      } else {
        setValorFrete(15.0);
      }
    } catch (error) {
      console.error("Erro ao calcular o frete por distância:", error);
      setValorFrete(15.0);
    } finally {
      setCalculandoFrete(false);
    }
  }, []);

  useEffect(() => {
    async function carregarPerfilCliente() {
      try {
        const response = await fetch("/api/cliente/perfil");
        if (response.ok) {
          const data = await response.json();
          const usuario: Cliente = data.cliente || data.user || data;
          setClienteLogado(usuario);

          const cepCadastrado = usuario.cep || usuario.endereco?.cep || "";
          const enderecoFormatado: Endereco = {
            cep: cepCadastrado ? mascararCEP(cepCadastrado) : "",
            rua: usuario.rua || usuario.endereco?.rua || "",
            numero: usuario.numero || usuario.endereco?.numero || "",
            bairro: usuario.bairro || usuario.endereco?.bairro || "",
            cidade: usuario.cidade || usuario.endereco?.cidade || "",
            estado: usuario.estado || usuario.endereco?.estado || "",
            complemento: usuario.complemento || usuario.endereco?.complemento || "",
          };

          setEndereco(enderecoFormatado);

          // Calcula o frete e atualiza os dados completos se houver CEP
          if (cepCadastrado) {
            calcularFretePorDistancia(cepCadastrado);
            
            // Se falta rua no perfil, busca via ViaCEP
            if (!enderecoFormatado.rua && cepCadastrado.replace(/\D/g, "").length === 8) {
              fetch(`https://viacep.com.br/ws/${cepCadastrado.replace(/\D/g, "")}/json/`)
                .then((res) => res.json())
                .then((viacepData) => {
                  if (!viacepData.erro) {
                    setEndereco((prev) => ({
                      ...prev,
                      rua: viacepData.logradouro || "",
                      bairro: viacepData.bairro || "",
                      cidade: viacepData.localidade || "",
                      estado: viacepData.uf || "",
                    }));
                  }
                })
                .catch(console.error);
            }
          }
        }
      } catch (error) {
        console.error("Erro ao carregar endereço do perfil do cliente:", error);
      }
    }

    carregarPerfilCliente();
  }, [calcularFretePorDistancia]);

  const buscarCep = async (cepDigitado: string) => {
    const cepLimpo = cepDigitado.replace(/\D/g, "");
    setEndereco((prev) => ({ ...prev, cep: cepDigitado }));

    if (errosCampos.cep) {
      setErrosCampos((prev) => ({ ...prev, cep: undefined }));
    }

    if (cepLimpo.length === 8) {
      setCarregandoCep(true);
      setErroCep("");

      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();

        if (data.erro) {
          setErroCep("CEP não encontrado. Verifique o número digitado.");
          setCarregandoCep(false);
          return;
        }

        setEndereco((prev) => ({
          ...prev,
          cep: cepDigitado,
          rua: data.logradouro || "",
          bairro: data.bairro || "",
          cidade: data.localidade || "",
          estado: data.uf || "",
        }));

        await calcularFretePorDistancia(cepLimpo);
      } catch {
        setErroCep("Erro ao buscar o CEP. Tente novamente.");
      } finally {
        setCarregandoCep(false);
      }
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorFormatado = mascararCEP(e.target.value);
    buscarCep(valorFormatado);
  };

  const handleTipoEntregaChange = (tipo: "retirada" | "entrega") => {
    setTipoEntrega(tipo);
    setErrosCampos({});
    if (tipo === "retirada") {
      setValorFrete(0);
    } else {
      const cepLimpo = endereco.cep.replace(/\D/g, "");
      if (cepLimpo.length === 8) {
        calcularFretePorDistancia(cepLimpo);
      } else {
        setValorFrete(0);
      }
    }
  };

  const handleIrParaPagamento = async () => {
    const novosErros: { cep?: string; numero?: string } = {};

    if (tipoEntrega === "entrega") {
      if (!endereco.cep.trim() || endereco.cep.length < 9) {
        novosErros.cep = "Digite um CEP válido no formato 00000-000";
      } else if (!endereco.rua) {
        novosErros.cep = "Aguarde o carregamento do endereço ou tente um CEP válido";
      }

      if (!endereco.numero.trim()) {
        novosErros.numero = "Informe o número da residência";
      }
    }

    if (Object.keys(novosErros).length > 0) {
      setErrosCampos(novosErros);
      secaoFormularioRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      setProcessandoPagamento(true);

      const emailUsuario = clienteLogado?.email || "";
      const nomeUsuario = clienteLogado?.nome || clienteLogado?.name || "Cliente";
      const telefoneUsuario = clienteLogado?.telefone || "";

      const orderId = `PEDIDO_${Date.now()}`;

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          totalAmount: totalFinal,
          items: itens.map((item: ItemCarrinho) => ({
            produtoId: item.produtoId || item.id || item.slug,
            nome: item.nome,
            quantidade: item.quantidade,
            preco: item.preco,
            tamanho: item.tamanho,
          })),
          customer: {
            nome: nomeUsuario,
            email: emailUsuario,
            telefone: telefoneUsuario,
          },
          entrega: {
            tipo: tipoEntrega,
            valorFrete,
            endereco: tipoEntrega === "entrega" ? {
              cep: endereco.cep,
              rua: endereco.rua,
              numero: endereco.numero,
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              estado: endereco.estado,
              complemento: endereco.complemento,
            } : null,
          },
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || "Ocorreu um erro ao gerar o pagamento na InfinitePay. Tente novamente.");
      }
    } catch (error) {
      console.error("Erro ao iniciar pagamento:", error);
      alert("Falha na conexão ao gerar o pagamento. Tente novamente.");
    } finally {
      setProcessandoPagamento(false);
    }
  };

  if (!itens || itens.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center font-sans text-slate-800">
        <span className="text-5xl">🧸</span>
        <h2 className="mt-4 font-display text-2xl font-bold text-slate-900">Seu carrinho está vazio</h2>
        <p className="mt-2 text-sm text-slate-600">Adicione produtos antes de confirmar o pedido.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-violet-600 px-6 py-3 font-display text-sm font-bold uppercase text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700 transition-all"
        >
          Ir para a Loja
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 font-sans text-slate-800">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Continuar Comprando
      </Link>

      <h1 className="font-display text-2xl font-bold text-slate-900 mb-6 tracking-tight">Confirmação do Pedido</h1>

      <div className="space-y-6" ref={secaoFormularioRef}>
        {Object.keys(errosCampos).length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-600 shadow-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <span>Atenção: Corrija os campos destacados em vermelho para prosseguir.</span>
          </div>
        )}

        {/* 1. RESUMO DOS PRODUTOS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
            1. Produtos Escolhidos ({itens.length})
          </h2>

          <ul className="divide-y divide-slate-100">
            {itens.map((item: ItemCarrinho, index: number) => {
              const temDesconto = item.precoOriginal && item.precoOriginal > item.preco;

              return (
                <li key={`${item.id || item.slug || index}-${item.tamanho}`} className="flex gap-4 py-3">
                  <div className="relative h-16 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                    <Image
                      src={item.imagemUrl || item.imagem || "/placeholder.png"}
                      alt={item.nome}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex flex-1 justify-between items-center">
                    <div>
                      <h3 className="font-display text-sm font-semibold text-slate-900">{item.nome}</h3>
                      <p className="text-xs text-slate-500">
                        Tamanho: <span className="font-bold text-violet-600">{item.tamanho}</span> | Qtd: {item.quantidade}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-sm font-bold text-slate-900">
                        {formatador.format(item.preco * item.quantidade)}
                      </p>
                      {temDesconto && (
                        <p className="text-[10px] font-medium text-slate-400 line-through">
                          {formatador.format(item.precoOriginal! * item.quantidade)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 2. FORMA DE RECEBIMENTO */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
            2. Como deseja receber o pedido?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => handleTipoEntregaChange("retirada")}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                tipoEntrega === "retirada"
                  ? "border-violet-600 bg-violet-50/70 text-slate-900 shadow-sm"
                  : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300"
              }`}
            >
              <Store className="h-6 w-6 text-violet-600" />
              <div>
                <p className="font-bold text-sm text-slate-900">Retirar na Loja</p>
                <p className="text-xs text-slate-500">Grátis • Pronto em até 2 horas</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTipoEntregaChange("entrega")}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                tipoEntrega === "entrega"
                  ? "border-violet-600 bg-violet-50/70 text-slate-900 shadow-sm"
                  : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300"
              }`}
            >
              <Truck className="h-6 w-6 text-violet-600" />
              <div>
                <p className="font-bold text-sm text-slate-900">Receber em Casa</p>
                <p className="text-xs text-slate-500">Calculado por distância</p>
              </div>
            </button>
          </div>

          {tipoEntrega === "entrega" && (
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-4">
              <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <MapPin className="h-4 w-4 text-violet-600" /> Endereço de Entrega
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    CEP <span className="text-violet-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="00000-000"
                    maxLength={9}
                    value={endereco.cep}
                    onChange={handleCepChange}
                    className={`w-full rounded-xl border bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors outline-none ${
                      errosCampos.cep
                        ? "border-2 border-red-500 bg-red-50 focus:ring-1 focus:ring-red-500"
                        : "border-slate-300 focus:border-violet-600"
                    }`}
                  />
                  {carregandoCep && (
                    <Loader2 className="absolute right-3 top-8 h-4 w-4 animate-spin text-violet-600" />
                  )}
                  {errosCampos.cep && (
                    <p className="mt-1 text-[11px] font-bold text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 inline" /> {errosCampos.cep}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Número <span className="text-violet-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 123"
                    value={endereco.numero}
                    onChange={(e) => {
                      setEndereco({ ...endereco, numero: e.target.value });
                      if (errosCampos.numero) {
                        setErrosCampos((prev) => ({ ...prev, numero: undefined }));
                      }
                    }}
                    className={`w-full rounded-xl border bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors outline-none ${
                      errosCampos.numero
                        ? "border-2 border-red-500 bg-red-50 focus:ring-1 focus:ring-red-500"
                        : "border-slate-300 focus:border-violet-600"
                    }`}
                  />
                  {errosCampos.numero && (
                    <p className="mt-1 text-[11px] font-bold text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 inline" /> {errosCampos.numero}
                    </p>
                  )}
                </div>
              </div>

              {erroCep && (
                <p className="text-xs text-red-600 font-medium">{erroCep}</p>
              )}

              {endereco.rua && (
                <div className="rounded-xl bg-violet-50 p-3 border border-violet-100 text-xs space-y-1 text-slate-700">
                  <p><strong className="text-slate-900">Rua:</strong> {endereco.rua}</p>
                  <p><strong className="text-slate-900">Bairro:</strong> {endereco.bairro}</p>
                  <p><strong className="text-slate-900">Cidade/UF:</strong> {endereco.cidade} - {endereco.estado}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Complemento / Ponto de Referência (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Apto 102, Bloco B"
                  value={endereco.complemento}
                  onChange={(e) => setEndereco({ ...endereco, complemento: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-600 outline-none transition-colors"
                />
              </div>
            </div>
          )}
        </section>

        {/* 3. RESUMO DO PAGAMENTO E BOTÃO */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <h2 className="font-display text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            3. Resumo do Pagamento
          </h2>

          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between items-center">
              <span>Subtotal dos produtos:</span>
              <span className="text-slate-900 font-medium">{formatador.format(subtotalOriginal)}</span>
            </div>

            {totalDesconto > 0 && (
              <div className="flex justify-between items-center font-bold text-emerald-600">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> Desconto nos produtos:
                </span>
                <span>- {formatador.format(totalDesconto)}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span>Frete / Retirada:</span>
              <div className="flex items-center gap-2">
                {calculandoFrete ? (
                  <span className="flex items-center gap-1 text-xs text-violet-600 font-semibold">
                    <Loader2 className="h-3 w-3 animate-spin" /> Calculando...
                  </span>
                ) : (
                  <span className="text-slate-900 font-medium">
                    {valorFrete === 0 ? "Grátis" : formatador.format(valorFrete)}
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 my-2" />

            <div className="flex justify-between font-display text-lg font-bold text-slate-900 pt-1">
              <span>Total Final:</span>
              <span className="text-violet-600">{formatador.format(totalFinal)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleIrParaPagamento}
            disabled={calculandoFrete || processandoPagamento}
            className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 font-display text-sm font-bold uppercase text-white shadow-lg shadow-violet-600/25 transition-all hover:bg-violet-700 hover:shadow-violet-600/40 hover:scale-[1.01] active:scale-95 disabled:opacity-50"
          >
            {processandoPagamento ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando Pagamento...
              </>
            ) : (
              <>
                Ir para o Pagamento <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}