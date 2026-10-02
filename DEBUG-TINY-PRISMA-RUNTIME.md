# Diagnóstico temporário: Prisma/Tiny em runtime

Esta versão mantém a lógica de sincronização Tiny/Olist intacta e adiciona apenas logs de diagnóstico.

Ao executar `stock-batch`, `quick` ou `sync`, a rota imprime:

- os campos que o Prisma Client em runtime reconhece no modelo `Produto`;
- a versão do Prisma Client em runtime;
- um `findFirst` somente leitura usando `tinyVariacoes`;
- caso o `produto.update()` falhe, as chaves do `data` e os campos reconhecidos pelo runtime.

Nenhum dado é alterado por esses diagnósticos.

Depois de identificar a causa, o ideal é remover esses logs temporários.
