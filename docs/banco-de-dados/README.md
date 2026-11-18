# Banco de dados do Atelier Bureau

Documentação do modelo de dados (issue #8, RNF16). A fonte da verdade é o [`prisma/schema.prisma`](../../prisma/schema.prisma) e as [migrations](../../prisma/migrations).

| Documento | Conteúdo |
|---|---|
| [01 — Escopo](01-escopo.md) | O que o banco guarda e o que fica fora, convenções, integridade, usuários do banco, LGPD e backup |
| [02 — DER](02-der.md) | Modelo conceitual em notação de Chen, por domínio |
| [03 — MER](03-mer.md) | Modelo lógico (pé de galinha) com tipos e chaves, por domínio |
| [04 — Dicionário de dados](04-dicionario-de-dados.md) | Cada tabela e coluna: tipo, nulo, padrão, chave, descrição, índices, FKs e gatilhos |
| [05 — Gatilhos](05-gatilhos.md) | Os 20 gatilhos de integridade e por que existem |
| [06 — Script SQL](06-script.sql) | Script completo de criação: tabelas, índices, FKs e gatilhos |

Os diagramas usam Mermaid, que o GitHub e o VS Code (com a extensão Markdown Preview Mermaid Support) desenham direto.

## Como regenerar

Os documentos 02, 03, 04 e 06 são gerados. Não os edite à mão.

1. Mude o schema e crie a migration (`npx prisma migrate dev --name <slug>`).
2. Se surgiu tabela ou coluna nova, descreva-a em [`scripts/db-docs/descriptions.ts`](../../scripts/db-docs/descriptions.ts). O gerador falha se faltar alguma descrição.
3. Com o `DATABASE_URL` apontando para um banco com todas as migrations aplicadas, rode:

   ```bash
   npm run db:docs
   ```

4. Confira o diff e inclua os documentos no mesmo PR da migration.

## Como validar o script SQL

O script cria o banco `atelier_bureau` do zero. Para testá-lo num MySQL de desenvolvimento sem tocar no banco real, troque o nome do banco:

```bash
sed 's/`atelier_bureau`/`atelier_script`/g' docs/banco-de-dados/06-script.sql | mysql -u root -p
```

O resultado esperado são 52 tabelas e 20 gatilhos. Depois, `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, com o `DATABASE_URL` desse banco, deve responder *"This is an empty migration"*.
