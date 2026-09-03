import type { Metadata, Viewport } from "next";
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

// Configuração explícita de viewport para dispositivos móveis
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "JKfashion Kids",
  description: "Roupinhas coloridas para brincar sem parar!",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (  
    <html lang="pt-BR" className={`${inter.variable} ${fredoka.variable} antialiased h-full`}>
      <body className="flex min-h-screen flex-col overflow-x-hidden selection:bg-pink-500 selection:text-white font-sans">
        <CarrinhoProvider>
          <FavoritosProvider>
            <Header />
            <CarrinhoLateral />
            <main className="flex-1 w-full bg-white">
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
