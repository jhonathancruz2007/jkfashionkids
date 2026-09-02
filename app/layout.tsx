import type { Metadata } from "next";
import { Inter, Fredoka } from "next/font/google";
import "./globals.css";
import { CarrinhoProvider } from "@/lib/carrinho-context";
import { FavoritosProvider } from "@/lib/favoritos-context";
import Header from "@/components/Header";
import Rodape from "@/components/Rodape";
import CarrinhoLateral from "@/components/CarrinhoLateral";
import VoltarAoTopo from "@/components/VoltarAoTopo";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "JKfashion Kids",
  description: "Roupinhas coloridas para brincar sem parar!",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (  
    <html lang="pt-BR">
      <body className="selection:text-white">
      <CarrinhoProvider>
          <FavoritosProvider>
            <Header />
            <CarrinhoLateral />
            <main className="flex-1 bg-white">
              {children}
            </main>
            <VoltarAoTopo />
            <Rodape />
          </FavoritosProvider>
        </CarrinhoProvider>
      </body>
    </html>
  );
}