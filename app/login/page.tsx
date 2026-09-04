"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Mail, User, Loader2, Sparkles, Eye, EyeOff, ShoppingBag, ShieldCheck } from "lucide-react";

function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectParam = searchParams.get("redirect") || searchParams.get("redirectTo");
  const redirectUrl = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/catalogo";

  const [isCadastro, setIsCadastro] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [checandoSessao, setChecandoSessao] = useState(true);

  const verificarPerfilIncompleto = (usuario: any) => {
    return !usuario?.telefone || !usuario?.cep;
  };

  useEffect(() => {
    async function verificarAutenticacao() {
      try {
        const res = await fetch("/api/cliente/perfil");
        if (res.ok) {
          const data = await res.json();
          const usuario = data.cliente || data.user || data;

          if (usuario?.email) {
            if (verificarPerfilIncompleto(usuario)) {
              router.replace("/perfil/completar");
            } else {
              router.replace(redirectUrl);
            }
            return;
          }
        }
      } catch (err) {
        console.error("Erro ao verificar sessão:", err);
      } finally {
        setChecandoSessao(false);
      }
    }

    verificarAutenticacao();
  }, [router, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (isCadastro && !nome.trim()) {
      setErro("Por favor, informe seu nome completo.");
      return;
    }

    if (senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setCarregando(true);

    const payload = isCadastro
      ? { acao: "cadastro", nome: nome.trim(), email: email.trim(), senha }
      : { acao: "login", email: email.trim(), senha };

    try {
      const res = await fetch("/api/cliente/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Ocorreu um erro ao processar a requisição.");
      }

      if (isCadastro) {
        window.location.href = "/perfil/completar";
        return;
      }

      const perfilRes = await fetch("/api/cliente/perfil");
      if (perfilRes.ok) {
        const perfilData = await perfilRes.json();
        const usuario = perfilData.cliente || perfilData.user || perfilData;

        if (verificarPerfilIncompleto(usuario)) {
          window.location.href = "/perfil/completar";
          return;
        }
      }

      window.location.href = redirectUrl;
    } catch (err: any) {
      setErro(err.message || "Ocorreu um erro ao processar sua solicitação.");
      setCarregando(false);
    }
  };

  if (checandoSessao) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 bg-stone-50/70">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        <p className="text-xs font-semibold text-stone-500">Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50/70 px-4 py-8 lg:py-12 font-sans text-stone-800 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-10 left-[-8%] w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-[-8%] w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Gradient Accent */}
      <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-red-500 via-rose-500 to-orange-500" />

      {/* Container Principal Ampliado */}
      <div className="w-full max-w-6xl space-y-4 relative z-10">
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-red-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Catálogo
        </Link>

        {/* Outer Layout Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white/60 backdrop-blur-md rounded-3xl p-4 sm:p-6 lg:p-8 border border-red-500/10 shadow-2xl shadow-red-500/5">
          
          {/* Coluna Esquerda: Limpa com Cores Vibrantes */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-between h-full p-8 sm:p-10 rounded-2xl bg-gradient-to-br from-red-600 via-rose-500 to-orange-500 text-white shadow-xl relative overflow-hidden group">
            
            {/* Detalhes visuais sutis no fundo */}
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-amber-300/20 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-60 h-60 bg-red-800/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-6 right-6 text-white/10 font-black text-8xl select-none pointer-events-none rotate-12">
              🛒
            </div>

            <div className="space-y-6 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 text-white text-xs font-bold w-fit backdrop-blur-md shadow-xs border border-white/20">
                <Sparkles className="h-4 w-4 text-amber-200" /> Experiência Exclusiva
              </div>
              <h2 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight">
                Sua jornada de compras mais simples, rápida e segura.
              </h2>
              <p className="text-xs xl:text-sm text-white/90 leading-relaxed font-medium max-w-md">
                Acesse sua conta para visualizar seu histórico de pedidos, gerenciar suas preferências e ter acesso antecipado a ofertas exclusivas.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-12 relative z-10 pt-6 border-t border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md">
                  <ShoppingBag className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-bold">Catálogo Amplo</h3>
                  <p className="text-[10px] text-white/80">Produtos selecionados</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-bold">Compra Segura</h3>
                  <p className="text-[10px] text-white/80">Proteção de dados</p>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Formulário */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto lg:max-w-none lg:p-4">
            <div className="rounded-3xl border border-red-500/15 bg-white p-6 sm:p-8 shadow-xl shadow-red-500/5">
              <div className="text-center space-y-2 mb-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-100 shadow-xs">
                  <Sparkles className="h-6 w-6 text-red-500" />
                </div>
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                  {isCadastro ? "Criar sua Conta" : "Bem-vindo de volta"}
                </h1>
                <p className="text-xs text-stone-500 font-medium">
                  {isCadastro
                    ? "Preencha os dados abaixo para começar suas compras."
                    : "Entre com seu e-mail e senha para acessar a plataforma."}
                </p>
              </div>

              {erro && (
                <div className="mb-5 rounded-2xl border border-red-200 bg-red-50/80 p-3.5 text-center text-xs font-bold text-red-600 transition-all">
                  {erro}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {isCadastro && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-stone-700">
                      Nome Completo
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-stone-400">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        required
                        disabled={carregando}
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        className="w-full rounded-2xl border border-stone-200 bg-stone-50/50 py-3 pl-10 pr-4 text-xs font-semibold text-stone-900 placeholder-stone-400 transition-all focus:border-red-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                        placeholder="Seu nome completo"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-stone-700">
                    E-mail
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-stone-400">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      type="email"
                      required
                      disabled={carregando}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-stone-50/50 py-3 pl-10 pr-4 text-xs font-semibold text-stone-900 placeholder-stone-400 transition-all focus:border-red-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-stone-700">
                    Senha
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-stone-400">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      required
                      disabled={carregando}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-stone-50/50 py-3 pl-10 pr-10 text-xs font-semibold text-stone-900 placeholder-stone-400 transition-all focus:border-red-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-stone-400 hover:text-stone-600 transition-colors"
                      aria-label={mostrarSenha ? "Ocultar senha" : "Exibir senha"}
                    >
                      {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full mt-3 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-red-600/20 transition-all hover:from-red-700 hover:to-rose-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {carregando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Processando...
                    </>
                  ) : isCadastro ? (
                    "Criar Conta"
                  ) : (
                    "Entrar na Conta"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center border-t border-stone-100 pt-5">
                <button
                  type="button"
                  onClick={() => {
                    setErro("");
                    setIsCadastro(!isCadastro);
                  }}
                  className="text-xs font-bold text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                >
                  {isCadastro ? (
                    <>Já tem uma conta? <span className="underline underline-offset-4">Entrar</span></>
                  ) : (
                    <>Não tem uma conta? <span className="underline underline-offset-4">Cadastre-se</span></>
                  )}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[70vh] items-center justify-center bg-stone-50/70">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      }
    >
      <FormularioLogin />
    </Suspense>
  );
}
