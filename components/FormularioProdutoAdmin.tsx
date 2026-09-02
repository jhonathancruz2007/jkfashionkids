"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPCOES_TAMANHOS = ["RN", "P", "M", "G", "GG", "1", "2", "4", "6", "8", "10", "12"];

export default function FormularioProdutoAdmin() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [imagemUrl, setImagemUrl] = useState("");
  const [tamanhosSelecionados, setTamanhosSelecionados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  const toggleTamanho = (tamanho: string) => {
    setTamanhosSelecionados((prev) =>
      prev.includes(tamanho)
        ? prev.filter((item) => item !== tamanho)
        : [...prev, tamanho]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);

    try {
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome,
          descricao,
          preco: parseFloat(preco),
          imagemUrl,
          tamanhos: tamanhosSelecionados,
        }),
      });

      if (!res.ok) {
        throw new Error("Erro ao salvar produto");
      }

      setMensagem({ tipo: "sucesso", texto: "Produto cadastrado com sucesso!" });
      setNome("");
      setDescricao("");
      setPreco("");
      setImagemUrl("");
      setTamanhosSelecionados([]);
      router.refresh();
    } catch (error) {
      setMensagem({ tipo: "erro", texto: "Ocorreu um erro ao cadastrar o produto." });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
      <h2 className="font-display text-2xl font-bold text-ink">Cadastrar Novo Produto</h2>

      {mensagem && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold ${
            mensagem.tipo === "sucesso"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-ink mb-1">Nome do Produto *</label>
        <input
          type="text"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Conjunto Moletom Infantil"
          className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-berry focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-ink mb-1">Descrição</label>
        <textarea
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: Tecido 100% algodão, ultra macio..."
          className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-berry focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-ink mb-1">Preço (R$) *</label>
          <input
            type="number"
            step="0.01"
            required
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            placeholder="89.90"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-berry focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-ink mb-1">URL da Imagem</label>
          <input
            type="url"
            value={imagemUrl}
            onChange={(e) => setImagemUrl(e.target.value)}
            placeholder="https://exemplo.com/imagem.jpg"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-berry focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-ink mb-2">
          Tamanhos Disponíveis
        </label>
        <div className="flex flex-wrap gap-2">
          {OPCOES_TAMANHOS.map((tamanho) => {
            const selecionado = tamanhosSelecionados.includes(tamanho);
            return (
              <button
                key={tamanho}
                type="button"
                onClick={() => toggleTamanho(tamanho)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                  selecionado
                    ? "bg-berry text-white border-berry shadow-sm"
                    : "bg-gray-50 text-ink border-gray-200 hover:bg-gray-100"
                }`}
              >
                {tamanho}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={carregando}
        className="w-full rounded-xl bg-berry py-3.5 font-display text-sm font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-50"
      >
        {carregando ? "Cadastrando..." : "Cadastrar Produto"}
      </button>
    </form>
  );
}