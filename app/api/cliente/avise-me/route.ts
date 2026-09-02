import { NextResponse } from "next/server";
import { db } from "@/lib/db"; // Ajuste o caminho do seu Prisma Client
import { resend } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { produtoId, tamanho, email, telefone } = body;

    if (!produtoId || !tamanho || (!email && !telefone)) {
      return NextResponse.json(
        { erro: "Preencha os campos obrigatórios para o aviso de estoque." },
        { status: 400 }
      );
    }

    // 1. Busca o produto para incluir o nome no e-mail
    const produto = await db.produto.findUnique({
      where: { id: produtoId },
    });

    if (!produto) {
      return NextResponse.json(
        { erro: "Produto não encontrado." },
        { status: 404 }
      );
    }

    // 2. Salva ou atualiza no banco de dados com Prisma
    await db.avisoEstoque.upsert({
      where: {
        produtoId_tamanho_email: {
          produtoId,
          tamanho: tamanho.toUpperCase(),
          email,
        },
      },
      update: {
        telefone,
        notificado: false,
      },
      create: {
        produtoId,
        tamanho: tamanho.toUpperCase(),
        email,
        telefone,
        notificado: false,
      },
    });

    // 3. Dispara o e-mail de confirmação via Resend
    // Nota: Em ambiente de testes do Resend, o "from" precisa ser "onboarding@resend.dev"
    // Quando você validar seu próprio domínio no Resend, poderá usar "contato@seudominio.com"
    await resend.emails.send({
      from: "Sua Loja <onboarding@resend.dev>",
      to: [email],
      subject: `Aviso Cadastrado: ${produto.nome} (${tamanho})`,
      html: `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px;">
          <h2 style="color: #ec4899; margin-top: 0;">Pronto! Anotamos seu aviso 🔔</h2>
          <p>Olá! Recebemos sua solicitação de aviso para o produto:</p>
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <strong>${produto.nome}</strong><br/>
            Tamanho selecionado: <span style="color: #ec4899; font-weight: bold;">${tamanho}</span>
          </div>
          <p>Assim que este item retornar ao nosso estoque, enviaremos um e-mail avisando para você garantir o seu!</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888;">Este é um e-mail automático enviado pela nossa loja.</p>
        </div>
      `,
    });

    return NextResponse.json(
      { 
        sucesso: true, 
        mensagem: "Inscrição realizada e e-mail de confirmação enviado!" 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Erro na API /api/cliente/avise-me:", error);
    return NextResponse.json(
      { erro: "Erro interno no servidor ao cadastrar aviso." },
      { status: 500 }
    );
  }
}