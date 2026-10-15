import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function responderDataUrl(dataUrl: string): Response | null {
  if (!dataUrl.startsWith("data:")) return null;

  const separador = dataUrl.indexOf(",");
  if (separador < 0) return null;

  const metadados = dataUrl.slice(5, separador);
  const payload = dataUrl.slice(separador + 1);
  const partes = metadados.split(";");
  const contentType = partes[0] || "application/octet-stream";
  const ehBase64 = partes.some((parte) => parte.toLowerCase() === "base64");

  try {
    const decoded = ehBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    // Cria uma Uint8Array própria para manter compatibilidade com BodyInit/TS.
    const bytes = new Uint8Array(decoded.byteLength);
    bytes.set(decoded);

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const parsedIndex = Number.parseInt(new URL(request.url).searchParams.get("index") ?? "0", 10);
    const index = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;

    const produto = await prisma.produto.findUnique({
      where: { id },
      select: { imagemUrl: true, imagens: true },
    });

    if (!produto) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    const imagens = Array.isArray(produto.imagens) ? produto.imagens : [];
    // Se não existir a imagem secundária, retorna a principal como fallback.
    const fonte = imagens[index] || produto.imagemUrl || "";
    if (!fonte || typeof fonte !== "string") {
      return new Response("Imagem não encontrada", { status: 404 });
    }

    const imagem = responderDataUrl(fonte);
    if (imagem) return imagem;

    // Imagens que já são URLs não precisam ser convertidas nem duplicadas.
    if (/^https?:\/\//i.test(fonte)) {
      const resposta = NextResponse.redirect(fonte, 302);
      resposta.headers.set("Cache-Control", CACHE_CONTROL);
      return resposta;
    }

    if (fonte.startsWith("/")) {
      const resposta = NextResponse.redirect(new URL(fonte, request.url), 302);
      resposta.headers.set("Cache-Control", CACHE_CONTROL);
      return resposta;
    }

    return new Response("Formato de imagem não suportado", { status: 415 });
  } catch (error) {
    console.error("Erro ao carregar imagem do produto:", error);
    return new Response("Erro ao carregar imagem", { status: 500 });
  }
}
