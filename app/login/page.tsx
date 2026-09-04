"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Mail, User, Loader2, Sparkles, Eye, EyeOff } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-stone-50/70 px-4 py-12 font-sans text-stone-800 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-10 left-[-8%] w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-[-8%] w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Gradient Accent */}
      <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-red-500 via-red-600 to-rose-600" />

      <div className="w-full max-w-md space-y-5 relative z-10">
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-red-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Catálogo
        </Link>

        <div className="rounded-3xl border border-red-500/15 bg-white/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl shadow-red-500/5">
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
