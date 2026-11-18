# Atelier Bureau — Guia de documentação de código

Padrão de documentação do código (issue #12, RNF08). Vale para todo arquivo `.ts` e `.tsx` do projeto.

## Regra

**Toda função, componente, classe, interface e tipo exportado tem um comentário JSDoc.** O ESLint cobra a regra (`eslint-plugin-jsdoc`, em `eslint.config.mjs`) e o `npm run lint` falha quando falta documentação. Código não exportado só leva comentário quando a intenção não for óbvia.

Os comentários ficam em **inglês**, como o resto do código (CLAUDE.md, seção 3).

## O que escrever

1. **Descrição:** uma frase dizendo o que a função faz e, quando houver, a regra de negócio que ela aplica (RF, RN ou RNF).
2. **`@param`:** um por parâmetro, com o significado e as restrições. Sem tipo entre chaves: o tipo vem do TypeScript.
3. **`@returns`:** o que retorna. Em Server Actions, descreva o formato `{ success, ... }`.
4. **`@throws`:** só quando a função lança exceção de propósito (Server Actions não lançam para a UI).
5. **`@example`:** opcional, para utilitários com uso não óbvio.

## Exemplos

Server Action:

```ts
/**
 * Reserves stock for every item of a new order (RN14). Runs in a
 * transaction with SELECT ... FOR UPDATE so two orders never reserve
 * the same unit.
 *
 * @param input - Order id and items, validated with `reserveStockSchema`.
 * @returns `{ success: true }` or `{ success: false, error }` when an item
 * has no available stock.
 */
export async function reserveStock(input: ReserveStockInput) {}
```

Componente:

```tsx
/**
 * Product card used in the catalog, search and favorites lists.
 *
 * @param props - Product summary and the optional compare toggle.
 * @returns The rendered card.
 */
export function ProductCard(props: ProductCardProps) {}
```

Tipo:

```ts
/** Result returned by every Server Action. */
export type ActionResult<T> =
  | ({ success: true } & T)
  | { success: false; error: string }
```

## Documentação por módulo

- Cada pasta de feature (`features/<dominio>/<feature>/`) pode ter um `README.md` curto quando o fluxo envolver mais de uma action ou integração (ex.: checkout, frete).
- As integrações em `features/shared/lib/<integracao>/` sempre têm `README.md` com: o que a API faz, variáveis de ambiente, timeout, fallback e como testar em sandbox.
- Decisões de arquitetura ficam no `ARCHITECTURE.md`. Regras de negócio ficam no documento de requisitos.

## Checagem

```bash
npm run lint
```
