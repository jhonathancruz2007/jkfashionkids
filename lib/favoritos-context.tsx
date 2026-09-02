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
}

const FavoritosContext = createContext<FavoritosContextType | undefined>(undefined);

export function FavoritosProvider({ children }: { children: ReactNode }) {
  const [favoritos, setFavoritos] = useState<FavoritoItem[]>([]);

  const recarregarFavoritos = async () => {
    try {
      // 1. Carrega salvamento local imediato
      const local = localStorage.getItem("jk_favoritos");
      if (local) {
        setFavoritos(JSON.parse(local));
      }

      // 2. Tenta buscar da API do servidor
      const res = await fetch("/api/cliente/favoritos");
      if (res.ok) {
        const data = await res.json();
        const lista = Array.isArray(data) ? data : data.favoritos || [];
        if (lista.length > 0) {
          setFavoritos(lista);
          localStorage.setItem("jk_favoritos", JSON.stringify(lista));
        }
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
      const favId = String(f?.id || f?._id || f?.produtoId || f?.produto?.id || f?.produto?._id || f);
      return favId === targetId;
    });
  };

  const toggleFavorito = async (produto: any) => {
    if (!produto) return;
    const prodId = String(produto.id || produto._id || produto.produtoId || "");
    if (!prodId) return;

    const jaFavorito = isFavorito(prodId);

    // Atualização instantânea na tela e no LocalStorage
    let novosFavoritos: FavoritoItem[];
    if (jaFavorito) {
      novosFavoritos = favoritos.filter((f) => {
        const favId = String(f?.id || f?._id || f?.produtoId || f?.produto?.id || f);
        return favId !== prodId;
      });
    } else {
      novosFavoritos = [...favoritos, { ...produto, id: prodId }];
    }

    setFavoritos(novosFavoritos);
    localStorage.setItem("jk_favoritos", JSON.stringify(novosFavoritos));

    // Persistência em background na API sem redirecionar a tela
    try {
      await fetch("/api/cliente/favoritos", {
        method: jaFavorito ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: prodId, produto }),
      });
    } catch (e) {
      console.log("Sincronizado apenas no LocalStorage do navegador.");
    }
  };

  return (
    <FavoritosContext.Provider value={{ favoritos, isFavorito, toggleFavorito, recarregarFavoritos }}>
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