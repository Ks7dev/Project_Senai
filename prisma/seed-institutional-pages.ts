/**
 * Initial text of the institutional pages (#74, RF57), taken from the
 * commercial policies draft of issue #4 (docs/AtelierBureau_Politicas.md).
 * The seed only creates a page that does not exist yet, so the text
 * edited in the back office is never overwritten. Values still to be
 * defined by the business appear as "a definir".
 */

/** An institutional page seeded with its first text. */
export type InstitutionalPageSeed = {
  /** Route of the page. */
  slug: string
  /** Title. */
  title: string
  /** Body in the small Markdown subset of the store. */
  body: string
}

const DRAFT_NOTE =
  "> Texto de demonstração do projeto acadêmico SENAI, em validação jurídica. Os dados de empresas e pagamentos deste ambiente são fictícios."

/** The four institutional pages of the store. */
export const institutionalPages: InstitutionalPageSeed[] = [
  {
    slug: "termos-de-uso",
    title: "Termos de uso",
    body: `${DRAFT_NOTE}

## Cadastro

- O cadastro deve ser feito com dados verdadeiros e atualizados.
- A conta de pessoa jurídica é responsável pelos usuários que convida e pelos perfis que atribui a cada um (solicitante, aprovador, financeiro e administrador).

## Preços, disponibilidade e frete

- Preços e disponibilidade podem mudar até a confirmação do pedido.
- O valor do frete só é vinculante depois da confirmação do pedido.
- Promoções e cupons valem apenas dentro da vigência informada e nas condições de cada regra.
- O frete grátis é concedido apenas por promoção configurada ou quando o pedido atinge o valor mínimo da região de entrega.

## Cotações

- As cotações valem por 15 dias corridos, contados da solicitação, da resposta do comercial ou da revalidação dos preços.

## Pagamento

- Os dados do cartão são digitados no formulário seguro do Mercado Pago e não passam pelos servidores da Atelier Bureau.
- O pedido só é confirmado depois da aprovação do pagamento.

## Políticas relacionadas

Leia também a **Política de privacidade**, a política de **Trocas e devoluções** e a política de **Garantia**, disponíveis no rodapé da loja.`,
  },
  {
    slug: "politica-de-privacidade",
    title: "Política de privacidade",
    body: `${DRAFT_NOTE}

## Para que usamos os seus dados

Coletamos os dados pessoais **só para viabilizar a compra e o relacionamento com você**: cadastro, pedido, pagamento, entrega, nota fiscal, garantia e atendimento. A Atelier Bureau não vende dados nem os usa para publicidade de terceiros.

## Com quem compartilhamos

Os dados são usados internamente e compartilhados **só** com os parceiros indispensáveis para concluir a compra (LGPD, art. 9º):

| Parceiro | Dados | Finalidade |
|---|---|---|
| Mercado Pago | Nome, CPF/CNPJ, e-mail e valor (o cartão é digitado direto no Mercado Pago) | Processar o pagamento |
| Correios, transportadoras e agregador de frete | Nome, endereço, telefone, peso e dimensões | Calcular o frete e entregar |
| Emissor de NF-e e Sefaz | Nome, CPF/CNPJ, endereço e itens | Emitir a nota fiscal (obrigação legal) |
| BrasilAPI | CNPJ | Consultar dados públicos da empresa no cadastro PJ |

## Bases legais

- Execução de contrato (a compra).
- Cumprimento de obrigação legal (nota fiscal e guarda fiscal).
- Consentimento, para cookies não essenciais e comunicação de marketing, se houver.

## Cookies

Usamos cookies essenciais para manter a sessão, o carrinho e a segurança da loja. Cookies não essenciais só são usados depois do seu consentimento no aviso de cookies, e você pode mudar a escolha a qualquer momento.

## Seus direitos

- Consultar, exportar e corrigir os seus dados na área do cliente.
- Pedir a exclusão dos dados. A exclusão anonimiza o cadastro sem apagar pedidos e notas fiscais, que têm guarda legal.

## Segurança

Os dados ficam protegidos em trânsito e em repouso, com acesso restrito por perfil.

## Retenção e contato

- Dados fiscais: pelo prazo legal. Demais dados: enquanto a conta estiver ativa (prazos a definir).
- Encarregado (DPO) e canal de contato: a definir.`,
  },
  {
    slug: "trocas-e-devolucoes",
    title: "Trocas e devoluções",
    body: `${DRAFT_NOTE}

## Regra geral

Toda troca ou devolução passa por **avaliação técnica** da Atelier Bureau. O produto é recebido, inspecionado e o resultado é comunicado a você, com laudo, antes de qualquer troca, reparo ou reembolso.

## Direito de arrependimento (pessoa física)

Quem compra pelo site como pessoa física pode desistir em até **7 dias corridos do recebimento**, sem justificativa e com **reembolso integral**, incluindo o frete (CDC, art. 49). Esse direito não depende da avaliação.

- A solicitação é aberta na área do cliente em até 7 dias do recebimento.
- O produto passa por conferência no recebimento. A conferência registra o estado do produto, mas não nega o reembolso.
- O reembolso integral sai pelo mesmo meio de pagamento, com o frete de devolução por conta da Atelier Bureau.
- Itens personalizados para pessoa física (gravação, sob medida): tratamento em análise jurídica.

## Pessoa jurídica

- Trocas e devoluções dependem da avaliação técnica e da política comercial.
- Itens sob medida ou personalizados **não** são trocados nem devolvidos, salvo defeito de fabricação confirmado na avaliação.
- O cancelamento de pedido faturado exige aprovação do financeiro e pode gerar multa contratual.

## Troca por defeito (pessoa física e jurídica)

- Prazo para reclamar: **30 dias** para produtos não duráveis (papéis, refis, tintas) e **90 dias** para produtos duráveis, contados da entrega (CDC, art. 26). O defeito oculto conta a partir da descoberta.
- Depois da avaliação, a Atelier Bureau tem até 30 dias para resolver. Se não resolver, você escolhe entre troca, abatimento no preço ou reembolso (CDC, art. 18).

## Itens com personalização

Não podem ser cancelados depois do início da produção, salvo defeito ou o direito de arrependimento descrito acima.`,
  },
  {
    slug: "garantia",
    title: "Garantia",
    body: `${DRAFT_NOTE}

## Prazos

- **Garantia legal:** 90 dias para produtos duráveis e 30 dias para não duráveis (CDC, art. 26), sempre válida.
- **Garantia contratual:** somada à legal, com o prazo de cada categoria na tabela abaixo.
- **Garantia estendida:** produtos acima do valor informado na página do produto já incluem garantia estendida no preço. Qualquer garantia adicional vendida à parte é opcional.

## Requisitos para acionar a garantia

A garantia é coberta quando todos os itens abaixo forem atendidos e confirmados na avaliação técnica:

1. **Integridade do produto:** sem quebra, trinca, amassado, risco profundo ou peça faltando causados depois da entrega.
2. **Sem violação:** sem desmontagem, reparo ou alteração feita por terceiros não autorizados.
3. **Identificação:** número de série, lote ou etiqueta de identificação presentes e legíveis.
4. **Comprovação da compra:** nota fiscal ou número do pedido da Atelier Bureau.
5. **Uso adequado:** uso conforme o manual e a ficha técnica.
6. **Instalação e montagem:** feitas pela Atelier Bureau ou conforme o manual, nos itens com instalação obrigatória.
7. **Armazenamento:** sem exposição a umidade, calor excessivo, sol direto ou produtos químicos fora do indicado.
8. **Chamado dentro do prazo:** aberto na área do cliente, com descrição e fotos do problema.

## O que a garantia não cobre

- Desgaste natural de uso: pátina do couro, marcas de uso na madeira, desbotamento por luz.
- Itens de consumo: refis, cartuchos, tinta, papel, grafite e baterias.
- Danos por queda, impacto, líquidos, animais, mau uso ou transporte feito pelo cliente.
- Variações naturais de veio, cor e textura em madeira, couro e pedra.
- Personalização com erro no texto informado pelo cliente.

## Cobertura por categoria

| Categoria | Coberto | Requisitos específicos | Prazo contratual |
|---|---|---|---|
| Papelaria nobre | Costura, encadernação, fecho, capa e defeitos do papel | Sem umidade nem dobra forçada da lombada | A definir |
| Escrita fina | Mecanismo de acionamento, rosca, clipe, pena e sistema de carga | Tinta e refil compatíveis; sem queda sobre a pena | A definir |
| Objetos e organização de mesa | Estrutura, colagem, dobradiças, fechos e acabamento | Limpeza conforme o manual, sem produtos abrasivos | A definir |
| Iluminação | Parte elétrica, interruptor, dimmer, articulações e driver de LED | Tensão correta, sem troca de componentes por terceiros, certificação INMETRO presente | A definir |
| Cadeiras ergonômicas e executivas | Estrutura, base, mecanismo de reclinação, pistão a gás, rodízios e estofado | Peso máximo respeitado, montagem conforme o manual | A definir |
| Mesas e mobiliário executivo | Estrutura, tampo, ferragens, corrediças e motor de regulagem elétrica | Montagem pela Atelier Bureau ou conforme o manual, carga máxima respeitada | A definir |
| Produtos personalizados | Defeito de fabricação e da personalização em relação à prévia aprovada | Texto e prévia aprovados pelo cliente | Igual à categoria do produto |`,
  },
]
