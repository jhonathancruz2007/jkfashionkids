"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface FavoritoItem {
  id: string;
  [key: string]: any;
}

interface FavoritosContextType {
  favoritos: FavoritoItem[];
  isFavorito: (id: string | number) => boolean;
  toggleFavorito: (produto: any) => Promise<void>;
  recarregarFavoritos: () => Promise<void>;
  limparFavoritos: () => void;
}

const FavoritosContext = createContext<FavoritosContextType | undefined>(undefined);

export function FavoritosProvider({ children }: { children: ReactNode }) {
  const [favoritos, setFavoritos] = useState<FavoritoItem[]>([]);

  // Limpa o estado local e a memória do navegador
  const limparFavoritos = () => {
    setFavoritos([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("jk_favoritos");
    }
  };

  const recarregarFavoritos = async () => {
    try {
      // 1. Tenta buscar da API do servidor
      const res = await fetch("/api/cliente/favoritos");

      // Se a sessão expirou ou o usuário deslogou
      if (res.status === 401) {
        limparFavoritos();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const listaBruta = Array.isArray(data) ? data : data.favoritos || [];

        // Extrai e garante que o 'id' do item no estado seja sempre o ID do PRODUTO
        const listaNormalizada = listaBruta.map((item: any) => {
          const prodId = String(
            item.produto?.id || item.produto?._id || item.produtoId || item.id || ""
          );

          if (item.produto) {
            return {
              ...item.produto,
              favoritoRelacaoId: item.id, // Guarda o ID da tabela Favorito caso precise
              id: prodId,
            };
          }

          return {
            ...item,
            id: prodId,
          };
        });

        setFavoritos(listaNormalizada);
        localStorage.setItem("jk_favoritos", JSON.stringify(listaNormalizada));
        return;
      }

      // Fallback para storage local apenas se a API não responder com sucesso
      const local = localStorage.getItem("jk_favoritos");
      if (local) {
        setFavoritos(JSON.parse(local));
      }
    } catch (err) {
      console.log("Servidor off ou sem auth, usando storage local.");
    }
  };

  useEffect(() => {
    recarregarFavoritos();
  }, []);

  const isFavorito = (id: string | number) => {
    if (!id) return false;
    const targetId = String(id);
    return favoritos.some((f) => {
      const favId = String(
        f?.id || f?._id || f?.produtoId || f?.produto?.id || f?.produto?._id || f
      );
      return favId === targetId;
    });
  };

  const toggleFavorito = async (produto: any) => {
    if (!produto) return;
    const prodId = String(
      produto.id || produto._id || produto.produtoId || produto.produto?.id || ""
    );
    if (!prodId) return;

    const jaFavorito = isFavorito(prodId);

    // 1. Atualização otimista na tela
    let novosFavoritos: FavoritoItem[];
    if (jaFavorito) {
      novosFavoritos = favoritos.filter((f) => {
        const favId = String(
          f?.id || f?._id || f?.produtoId || f?.produto?.id || f
        );
        return favId !== prodId;
      });
    } else {
      novosFavoritos = [...favoritos, { ...produto, id: prodId }];
    }

    setFavoritos(novosFavoritos);
    localStorage.setItem("jk_favoritos", JSON.stringify(novosFavoritos));

    // 2. Persistência na API e validação de login
    try {
      const res = await fetch("/api/cliente/favoritos", {
        method: jaFavorito ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: prodId, produto }),
      });

      // Se tentar favoritar/desfavoritar estando deslogado
      if (res.status === 401) {
        limparFavoritos();
        const pathAtual = window.location.pathname;
        window.location.href = `/login?redirectTo=${encodeURIComponent(pathAtual)}`;
      }
    } catch (e) {
      console.log("Sincronizado apenas no LocalStorage do navegador.");
    }
  };

  return (
    <FavoritosContext.Provider
      value={{ favoritos, isFavorito, toggleFavorito, recarregarFavoritos, limparFavoritos }}
    >
      {children}
    </FavoritosContext.Provider>
  );
}

export function useFavoritos() {
  const context = useContext(FavoritosContext);
  if (!context) {
    throw new Error("useFavoritos deve ser usado dentro de um FavoritosProvider");
  }
  return context;
}
