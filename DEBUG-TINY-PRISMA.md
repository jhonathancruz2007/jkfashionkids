# Diagnóstico temporário — Prisma x Tiny

Esta versão adiciona apenas um log diagnóstico na rota `/api/admin/produtos/sincronizar-tiny` para mostrar os campos que o Prisma Client em produção reconhece no modelo `Produto`.

O log esperado na Vercel é:

```text
=== DEBUG PRISMA PRODUTO === [ ... ] tinyVariacoes reconhecido: true
```

Também mantém `tinyVariacoes Json?` declarado no `prisma/schema.prisma`.

Depois de identificar a causa, o bloco de debug pode ser removido.
