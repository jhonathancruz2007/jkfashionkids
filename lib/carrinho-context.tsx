"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export interface ItemCarrinho {
  id: string;
  produtoId?: string;
  slug?: string;
  nome: string;
  preco: number;
  imagemUrl: string;
  tamanho: string;
  cor?: string | null;
  quantidade: number;
}

interface CarrinhoContextType {
  itens: ItemCarrinho[];
  carregandoCarrinho: boolean;
  carrinhoAberto: boolean;
  setCarrinhoAberto: (aberto: boolean) => void;
  abrirCarrinho: () => void;
  fecharCarrinho: () => void;
  recarregarCarrinho: () => Promise<void>;
  adicionarAoCarrinho: (item: Omit<ItemCarrinho, "quantidade">, quantidade?: number) => void;
  removerDoCarrinho: (id: string, tamanho: string, cor?: string | null) => Promise<void>;
  atualizarQuantidade: (id: string, tamanho: string, quantidade: number, cor?: string | null) => Promise<void>;
  limparCarrinho: () => Promise<void>;
  totalItens: number;
  valorTotal: number;
}

const CarrinhoContext = createContext<CarrinhoContextType | undefined>(undefined);

export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [carregandoCarrinho, setCarregandoCarrinho] = useState(true);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);

  // Busca os itens do banco de dados.
  // O estado "carregandoCarrinho" existe para que as páginas não confundam
  // o estado inicial vazio com um carrinho realmente vazio.
  const recarregarCarrinho = useCallback(async () => {
    try {
      const res = await fetch("/api/cliente/carrinho", {
        cache: "no-store",
      });

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

    // Fallback local apenas se a API não retornar os itens.
    try {
      const carrinhoSalvo = localStorage.getItem("carrinho_jkfashion");

      if (carrinhoSalvo) {
        const itensSalvos = JSON.parse(carrinhoSalvo);
        if (Array.isArray(itensSalvos)) {
          setItens(itensSalvos);
          return;
        }
      }
    } catch (e) {
      console.error("Erro ao recuperar carrinho local:", e);
    }

    setItens([]);
  }, []);

  // Carregamento inicial do carrinho.
  useEffect(() => {
    let ativo = true;

    async function inicializarCarrinho() {
      try {
        await recarregarCarrinho();
      } finally {
        if (ativo) {
          setCarregandoCarrinho(false);
        }
      }
    }

    inicializarCarrinho();

    const handleAtualizar = () => {
      recarregarCarrinho();
    };

    window.addEventListener("atualizarCarrinhoGlobal", handleAtualizar);

    return () => {
      ativo = false;
      window.removeEventListener("atualizarCarrinhoGlobal", handleAtualizar);
    };
  }, [recarregarCarrinho]);

  // Só sincroniza com o localStorage depois que o primeiro carregamento
  // terminou, evitando sobrescrever um carrinho salvo com [] na montagem.
  useEffect(() => {
    if (!carregandoCarrinho) {
      localStorage.setItem("carrinho_jkfashion", JSON.stringify(itens));
    }
  }, [itens, carregandoCarrinho]);

  const abrirCarrinho = () => setCarrinhoAberto(true);
  const fecharCarrinho = () => setCarrinhoAberto(false);

  const adicionarAoCarrinho = (produto: Omit<ItemCarrinho, "quantidade">, qtdAdicionar = 1) => {
    setItens((itensAtuais) => {
      const normalizar = (valor: unknown) => String(valor ?? "").trim().toUpperCase();

      const indiceExistente = itensAtuais.findIndex(
        (item) =>
          item.id === produto.id &&
          item.tamanho === produto.tamanho &&
          normalizar(item.cor) === normalizar(produto.cor)
      );

      if (indiceExistente > -1) {
        const novosItens = [...itensAtuais];
        novosItens[indiceExistente].quantidade += qtdAdicionar;
        return novosItens;
      }

      return [...itensAtuais, { ...produto, quantidade: qtdAdicionar }];
    });
  };

  // Deleta do banco e da tela.
  const removerDoCarrinho = async (id: string, tamanho: string, cor?: string | null) => {
    const normalizar = (valor: unknown) => String(valor ?? "").trim().toUpperCase();

    setItens((itensAtuais) =>
      itensAtuais.filter(
        (item) =>
          !(
            item.id === id &&
            item.tamanho === tamanho &&
            normalizar(item.cor) === normalizar(cor)
          )
      )
    );

    try {
      await fetch("/api/cliente/carrinho", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: id, tamanho, cor: cor || null }),
      });
    } catch (e) {
      console.error("Erro ao remover item do banco:", e);
    }
  };

  // Altera quantidade no banco e na tela.
  const atualizarQuantidade = async (
    id: string,
    tamanho: string,
    quantidade: number,
    cor?: string | null
  ) => {
    if (quantidade <= 0) {
      await removerDoCarrinho(id, tamanho, cor);
      return;
    }

    const normalizar = (valor: unknown) => String(valor ?? "").trim().toUpperCase();

    setItens((itensAtuais) =>
      itensAtuais.map((item) => {
        if (
          item.id === id &&
          item.tamanho === tamanho &&
          normalizar(item.cor) === normalizar(cor)
        ) {
          return { ...item, quantidade };
        }
        return item;
      })
    );

    try {
      await fetch("/api/cliente/carrinho", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: id, tamanho, cor: cor || null, quantidade }),
      });
    } catch (e) {
      console.error("Erro ao atualizar quantidade no banco:", e);
    }
  };

  // Limpa tudo no banco e na tela.
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
  const valorTotal = itens.reduce(
    (acc, item) => acc + (Number(item.preco) || 0) * (item.quantidade || 0),
    0
  );

  return (
    <CarrinhoContext.Provider
      value={{
        itens,
        carregandoCarrinho,
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
