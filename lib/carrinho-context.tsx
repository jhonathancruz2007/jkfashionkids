"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export interface ItemCarrinho {
  id: string;
  nome: string;
  preco: number;
  imagemUrl: string;
  tamanho: string;
  quantidade: number;
}

interface CarrinhoContextType {
  itens: ItemCarrinho[];
  carrinhoAberto: boolean;
  setCarrinhoAberto: (aberto: boolean) => void;
  abrirCarrinho: () => void;
  fecharCarrinho: () => void;
  recarregarCarrinho: () => Promise<void>;
  adicionarAoCarrinho: (item: Omit<ItemCarrinho, "quantidade">, quantidade?: number) => void;
  removerDoCarrinho: (id: string, tamanho: string) => Promise<void>;
  atualizarQuantidade: (id: string, tamanho: string, quantidade: number) => Promise<void>;
  limparCarrinho: () => Promise<void>;
  totalItens: number;
  valorTotal: number;
}

const CarrinhoContext = createContext<CarrinhoContextType | undefined>(undefined);

export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);

  // 🟢 Busca os itens do banco de dados
  const recarregarCarrinho = useCallback(async () => {
    try {
      const res = await fetch("/api/cliente/carrinho");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.itens)) {
          setItens(data.itens);
          return;
        }
      }
    } catch (e) {
      console.error("Erro ao carregar carrinho:", e);
    }

    const carrinhoSalvo = localStorage.getItem("carrinho_jkfashion");
    if (carrinhoSalvo) {
      try {
        setItens(JSON.parse(carrinhoSalvo));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    recarregarCarrinho();

    const handleAtualizar = () => {
      recarregarCarrinho();
    };

    window.addEventListener("atualizarCarrinhoGlobal", handleAtualizar);
    return () => {
      window.removeEventListener("atualizarCarrinhoGlobal", handleAtualizar);
    };
  }, [recarregarCarrinho]);

  useEffect(() => {
    localStorage.setItem("carrinho_jkfashion", JSON.stringify(itens));
  }, [itens]);

  const abrirCarrinho = () => setCarrinhoAberto(true);
  const fecharCarrinho = () => setCarrinhoAberto(false);

  const adicionarAoCarrinho = (produto: Omit<ItemCarrinho, "quantidade">, qtdAdicionar = 1) => {
    setItens((itensAtuais) => {
      const indiceExistente = itensAtuais.findIndex(
        (item) => item.id === produto.id && item.tamanho === produto.tamanho
      );

      if (indiceExistente > -1) {
        const novosItens = [...itensAtuais];
        novosItens[indiceExistente].quantidade += qtdAdicionar;
        return novosItens;
      }

      return [...itensAtuais, { ...produto, quantidade: qtdAdicionar }];
    });
  };

  // 🔴 DELETAR DO BANCO E DA TELA
  const removerDoCarrinho = async (id: string, tamanho: string) => {
    // 1. Atualiza na tela instantaneamente
    setItens((itensAtuais) =>
      itensAtuais.filter((item) => !(item.id === id && item.tamanho === tamanho))
    );

    // 2. Avisa o banco de dados
    try {
      await fetch("/api/cliente/carrinho", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: id, tamanho }),
      });
    } catch (e) {
      console.error("Erro ao remover item do banco:", e);
    }
  };

  // 🟡 ALTERAR QUANTIDADE NO BANCO E NA TELA
  const atualizarQuantidade = async (id: string, tamanho: string, quantidade: number) => {
    if (quantidade <= 0) {
      await removerDoCarrinho(id, tamanho);
      return;
    }

    // 1. Atualiza na tela instantaneamente
    setItens((itensAtuais) =>
      itensAtuais.map((item) => {
        if (item.id === id && item.tamanho === tamanho) {
          return { ...item, quantidade };
        }
        return item;
      })
    );

    // 2. Avisa o banco de dados
    try {
      await fetch("/api/cliente/carrinho", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: id, tamanho, quantidade }),
      });
    } catch (e) {
      console.error("Erro ao atualizar quantidade no banco:", e);
    }
  };

  // 🧹 LIMPAR TUDO NO BANCO E NA TELA
  const limparCarrinho = async () => {
    setItens([]);
    try {
      await fetch("/api/cliente/carrinho", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limparTudo: true }),
      });
    } catch (e) {
      console.error("Erro ao limpar carrinho no banco:", e);
    }
  };

  const totalItens = itens.reduce((acc, item) => acc + (item.quantidade || 0), 0);
  const valorTotal = itens.reduce((acc, item) => acc + (Number(item.preco) || 0) * (item.quantidade || 0), 0);

  return (
    <CarrinhoContext.Provider
      value={{
        itens,
        carrinhoAberto,
        setCarrinhoAberto,
        abrirCarrinho,
        fecharCarrinho,
        recarregarCarrinho,
        adicionarAoCarrinho,
        removerDoCarrinho,
        atualizarQuantidade,
        limparCarrinho,
        totalItens,
        valorTotal,
      }}
    >
      {children}
    </CarrinhoContext.Provider>
  );
}

export function useCarrinho() {
  const ctx = useContext(CarrinhoContext);
  if (!ctx) {
    throw new Error("useCarrinho deve ser usado dentro de CarrinhoProvider");
  }
  return ctx;
}