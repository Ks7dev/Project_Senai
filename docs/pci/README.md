# Evidências PCI DSS

Pasta das evidências formais do PCI DSS do Atelier Bureau, citadas no [checklist SAQ A](../AtelierBureau_PCI_DSS_SAQ_A.md) (issue #178, pendência P6; requisitos E2, 12.8.4 e 12.8.5).

> **Situação em 17/11/2026:** a AOC do Mercado Pago ainda **não foi arquivada**. Ela é um documento do provedor e precisa ser obtida por uma pessoa da equipe, como descrito abaixo.

## O que arquivar

| Arquivo | Conteúdo | Validade |
|---|---|---|
| `mercadopago-aoc-<ano>.pdf` | Declaração de Conformidade (Attestation of Compliance, AOC) do Mercado Pago como provedor de serviços, na versão vigente do PCI DSS | 12 meses a partir da data de assinatura da AOC |
| `mercadopago-responsabilidades-<ano>.pdf` (se houver) | Matriz de responsabilidades fornecida pelo Mercado Pago junto com a AOC | A mesma da AOC |

Exemplo: `docs/pci/mercadopago-aoc-2026.pdf`. Não apague a AOC anterior quando chegar a nova: o histórico mostra que a conformidade do provedor foi acompanhada ano a ano.

Não arquive aqui nada com dado de cartão, credenciais, chaves de API ou dados pessoais.

## Como obter a AOC

1. Entre no painel do Mercado Pago com a conta da loja (a conta de teste do projeto).
2. Procure a AOC na central de ajuda ou na documentação de segurança. A página [Bricks — PCI DSS](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/additional-content/security/pci.md) confirma que o Mercado Pago é certificado PCI DSS, mas não traz o arquivo.
3. Se o documento não estiver disponível para download, abra um chamado no suporte do Mercado Pago pedindo a **AOC do PCI DSS como provedor de serviços (Service Provider AOC)** e, se houver, a matriz de responsabilidades para o Checkout Transparente com Bricks.
4. Confira no documento recebido:
   - o nome da empresa avaliada e os serviços cobertos (processamento de pagamentos com cartão, Checkout Transparente e Bricks);
   - a versão do PCI DSS (v4.0.1 ou a vigente);
   - o nível de provedor e o tipo de avaliação (QSA ou ISA);
   - a data de assinatura e a assinatura do QSA.
5. Salve o arquivo nesta pasta com o nome do padrão, abra um PR `docs(payment): archive Mercado Pago AOC <ano>` e atualize a tabela de acompanhamento abaixo, o critério E2 e o item 12.8 do checklist SAQ A.

## Acompanhamento da validade

O PCI DSS (12.8.4) pede que a conformidade do provedor seja conferida **pelo menos uma vez por ano**. Trinta dias antes do vencimento, peça a AOC nova.

| AOC | Data de assinatura | Vence em | Conferida por | Data da conferência |
|---|---|---|---|---|
| _pendente_ | _a preencher_ | _a preencher_ | _a preencher_ | _a preencher_ |

Se a AOC vencer sem renovação, ou se o Mercado Pago deixar de cobrir o serviço usado, o critério E2 volta a **Não atende** e o responsável pela segurança decide se o checkout com cartão continua no ar.
