const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Rota 2: Cadastrar ou adicionar uma nova cor/variante para o produto
router.post('/api/produtos/:id/cores', async (req, res) => {
  const produtoId = req.params.id;
  const { cor, hex, estoque } = req.body;

  if (!cor) {
    return res.status(400).json({ sucesso: false, mensagem: "O nome da cor é obrigatório." });
  }

  const novoDetalheCor = {
    id: `v${Date.now()}`,
    cor,
    hex: hex || null,
    disponivel: (Number(estoque) > 0),
    estoque: Number(estoque) || 0
  };

  try {
    // 1. Buscamos o produto atual para pegar as cores que já existem
    const produtoAtual = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: { cores: true, coresDetalhes: true }
    });

    let listaCores = produtoAtual?.cores || [];
    let listaDetalhes = Array.isArray(produtoAtual?.coresDetalhes) ? produtoAtual.coresDetalhes : [];

    // 2. Evita duplicar o nome da cor no array text[]
    if (!listaCores.includes(cor)) {
      listaCores.push(cor);
    }

    // 3. Adiciona o objeto detalhado no array do jsonb
    listaDetalhes.push(novoDetalheCor);

    // 4. Salva usando upsert (atualiza se existe, cria um registro básico se não existir)
    const produtoAtualizado = await prisma.produto.upsert({
      where: { id: produtoId },
      update: {
        cores: listaCores,
        coresDetalhes: listaDetalhes
      },
      create: {
        id: produtoId,
        nome: "Produto " + produtoId, // Nome temporário caso o produto esteja sendo criado agora pela rota
        descricao: "Descrição padrão",
        preco: 0,
        imagemUrl: "",
        cores: [cor],
        coresDetalhes: [novoDetalheCor]
      }
    });

    res.status(201).json({
      sucesso: true,
      mensagem: "Cor salva com sucesso no banco!",
      cores: produtoAtualizado.cores,
      coresDetalhes: produtoAtualizado.coresDetalhes
    });
  } catch (erro) {
    console.error("Erro detalhado ao salvar cor:", erro);
    res.status(500).json({ sucesso: false, mensagem: "Erro ao salvar a cor no banco de dados.", detalhe: erro.message });
  }
});
