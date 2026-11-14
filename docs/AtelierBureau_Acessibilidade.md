# Atelier Bureau — Auditoria de acessibilidade (WCAG 2.1 AA)

Issue #20 · RNF13 · Revisão de código em 14/11/2026.

## Verificação automática

- `tests/a11y/components-a11y.test.tsx` roda o **axe-core** (regras `wcag2a`, `wcag2aa`, `wcag21a` e `wcag21aa`) sobre o HTML renderizado no jsdom, dentro do `npm test` e, portanto, do CI. Qualquer violação falha o teste.
- Componentes cobertos: cabeçalho, rodapé, link "Pular para o conteúdo", card de produto, seletor de material, campo de formulário com erro, resumo do pedido, acordeão de especificações, carrossel da home, página de produto e checkout.
- A regra `color-contrast` fica desligada no jsdom, que não calcula estilos. O contraste mínimo de 4,5:1 dos tokens é verificado em `tests/design/tokens.test.ts`.

## Revisão manual do código

| Critério | Situação |
|---|---|
| 2.4.1 Ignorar blocos | Link "Pular para o conteúdo" como primeiro elemento focável na loja e no back office, apontando para o `<main id="conteudo" tabindex="-1">`. |
| 1.3.1 e 4.1.2 Estrutura e nomes | Landmarks `header`, `nav` com `aria-label`, `main` e `footer`. Botões só de ícone têm `aria-label`. Grupos de opções usam `fieldset` e `legend`. |
| 2.1.1 Teclado | O fluxo de compra (produto → carrinho → checkout → pagamento) usa só controles nativos (`a`, `button`, `input type="radio"`, `select`); não há `onClick` em `div` nem `tabindex` positivo (testado). |
| 2.4.7 Foco visível | Contorno global `:focus-visible` na cor primária; botões, chips e campos têm anel de foco com o token `focus`. O anel dos campos foi reforçado (antes 12% de opacidade). |
| 1.1.1 Texto alternativo | A imagem de produto exige texto alternativo no cadastro (mínimo de 3 caracteres). Miniaturas ao lado do nome do produto (carrinho e gaveta) são decorativas (`alt=""`), para não repetir o nome. |
| 2.2.2 Pausar | O carrossel tem botão de pausar e não avança sozinho com `prefers-reduced-motion`. |
| 3.3.1 e 3.3.2 Erros e rótulos | `FormField` liga o rótulo ao campo e a mensagem de erro por `aria-describedby`, com `role="alert"`. |
| 3.1.1 Idioma | `<html lang="pt-BR">`. |

## Pendente (teste humano)

- Passada com leitor de tela (NVDA no Windows) e navegação só por teclado no servidor local, com banco e Mercado Pago sandbox. O Brick de cartão do Mercado Pago é de terceiros e não entra na verificação automática.
