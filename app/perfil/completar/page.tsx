"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { User, MapPin, Loader2, Save } from "lucide-react"

export default function CompletarPerfil() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
    complemento: "",
  })

  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch("/api/cliente/perfil")
        if (res.status === 401) {
          router.push("/login")
          return
        }
        if (res.ok) {
          const data = await res.json()
          if (data.cliente) {
            // Se o perfil já estiver completo, redireciona direto para o catálogo
            if (data.cliente.telefone && data.cliente.cep) {
              router.push("/catalogo")
              return
            }

            setForm({
              nome: data.cliente.nome || "",
              email: data.cliente.email || "",
              telefone: data.cliente.telefone || "",
              cep: data.cliente.cep || "",
              rua: data.cliente.rua || "",
              numero: data.cliente.numero || "",
              bairro: data.cliente.bairro || "",
              cidade: data.cliente.cidade || "",
              estado: data.cliente.estado || "",
              complemento: data.cliente.complemento || "",
            })
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [router])

  const formatarTelefone = (valor: string) => {
    return valor
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .replace(/(-\d{4})\d+?$/, "$1")
  }

  const formatarCep = (valor: string) => {
    return valor
      .replace(/\D/g, "")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .replace(/(-\d{3})\d+?$/, "$1")
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    let valorFormatado = value

    if (name === "telefone") valorFormatado = formatarTelefone(value)
    if (name === "cep") {
      valorFormatado = formatarCep(value)
      buscarCep(value)
    }

    setForm({ ...form, [name]: valorFormatado })
  }

  const buscarCep = async (cepValue: string) => {
    const cepLimpo = cepValue.replace(/\D/g, "")
    if (cepLimpo.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
        const data = await res.json()
        if (!data.erro) {
          setForm((prev) => ({
            ...prev,
            rua: data.logradouro || prev.rua,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }))
        }
      } catch (e) {
        console.error("Erro ao buscar CEP", e)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro("")
    setSalvando(true)

    try {
      const res = await fetch("/api/cliente/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar dados.")
      }

      // Encaminha para o catálogo após concluir o cadastro do perfil
      router.push("/catalogo")
    } catch (err: any) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex h-[70vh] items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-rose-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10 font-sans text-neutral-800">
      <div className="mx-auto max-w-xl px-4">
        <div className="space-y-6 rounded-3xl border border-neutral-200/80 bg-white p-7 shadow-sm">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold text-neutral-900 tracking-tight">
              <User className="h-6 w-6 text-rose-600" /> Complete seu Cadastro
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              Precisamos de algumas informações adicionais para entrega e contato.
            </p>
          </div>

          {erro && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-center text-xs font-semibold text-red-600 shadow-sm">
              {erro}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Nome Completo
                </label>
                <input
                  type="text"
                  name="nome"
                  required
                  value={form.nome}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-400">
                  E-mail
                </label>
                <input
                  type="email"
                  name="email"
                  disabled
                  value={form.email}
                  className="w-full cursor-not-allowed rounded-2xl border border-neutral-200 bg-neutral-100 p-3 text-sm text-neutral-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-700">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                name="telefone"
                required
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={form.telefone}
                onChange={handleChange}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
              />
            </div>

            <div className="border-t border-neutral-100 pt-5">
              <h2 className="mb-3.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                <MapPin className="h-4 w-4 text-rose-600" /> Endereço de Entrega
              </h2>

              <div className="mb-3.5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    CEP
                  </label>
                  <input
                    type="text"
                    name="cep"
                    required
                    maxLength={9}
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Rua / Logradouro
                  </label>
                  <input
                    type="text"
                    name="rua"
                    required
                    value={form.rua}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                  />
                </div>
              </div>

              <div className="mb-3.5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Número
                  </label>
                  <input
                    type="text"
                    name="numero"
                    required
                    value={form.numero}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Bairro
                  </label>
                  <input
                    type="text"
                    name="bairro"
                    required
                    value={form.bairro}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                  />
                </div>
              </div>

              <div className="mb-3.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Cidade
                  </label>
                  <input
                    type="text"
                    name="cidade"
                    required
                    value={form.cidade}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Estado (UF)
                  </label>
                  <input
                    type="text"
                    name="estado"
                    required
                    maxLength={2}
                    placeholder="SP"
                    value={form.estado}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 uppercase placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Complemento (Opcional)
                </label>
                <input
                  type="text"
                  name="complemento"
                  placeholder="Apt, Bloco, Casa..."
                  value={form.complemento}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 placeholder-neutral-400 transition-all focus:border-rose-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-rose-700 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Salvar Dados e Continuar
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
