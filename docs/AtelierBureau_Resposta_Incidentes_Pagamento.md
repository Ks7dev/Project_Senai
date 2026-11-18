# Atelier Bureau — Plano de resposta a incidentes de pagamento

Plano de resposta a incidentes de segurança que afetem o pagamento ou os dados pessoais dos clientes (issue #182, pendência P10 do [checklist PCI-DSS SAQ A](AtelierBureau_PCI_DSS_SAQ_A.md)). Atende ao requisito 12.10.1 do PCI DSS v4.0.1 e ao art. 48 da LGPD. Complementa a [política de segurança da informação](AtelierBureau_Politica_Seguranca.md).

> **Status: aprovação pendente do responsável.** O plano só passa a valer depois de aprovado pelo responsável pela segurança e de preenchidos os contatos da seção 10. Projeto acadêmico em sandbox e homologação: enquanto não houver dados reais, os passos de comunicação externa são executados apenas como simulação no teste anual (seção 11).

## 1. Controle de versão

| Versão | Data | Autor | Alteração |
|---|---|---|---|
| 1.0 | 17/11/2026 | Equipe Atelier Bureau | Primeira versão, para aprovação (#182) |

| Aprovação | Nome | Data | Assinatura |
|---|---|---|---|
| Responsável pela segurança | _a preencher_ | _a preencher_ | _a preencher_ |

## 2. Escopo e premissas

- **O que é incidente de pagamento:** qualquer evento, confirmado ou suspeito, que comprometa a página de pagamento, as credenciais do Mercado Pago, a confirmação de pagamentos e estornos, ou os dados pessoais ligados a pedidos e pagamentos.
- **Premissa do SAQ A:** o site não captura, processa nem armazena dados de cartão. O cartão é digitado nos campos do Payment Brick, servidos pelo Mercado Pago, e o servidor recebe só o token (RN19, RF35). Por isso, o risco principal **não é** vazamento de cartão do banco, e sim:
  - alteração da página de pagamento para capturar o cartão antes do Brick (skimming, "Magecart");
  - vazamento do `MERCADOPAGO_ACCESS_TOKEN` ou do `MERCADOPAGO_WEBHOOK_SECRET`;
  - fraude na confirmação de pagamento ou no estorno (pedido liberado sem `approved`, estorno indevido);
  - vazamento de dados pessoais (cadastro, endereço, documento, backups).

## 3. Equipe de resposta

| Papel | Responsabilidade no incidente |
|---|---|
| Coordenador (responsável pela segurança) | Declara o incidente, classifica, decide a contenção e as comunicações, e encerra o incidente |
| Administrador do servidor | Executa a contenção técnica, preserva as evidências e restaura o ambiente |
| Desenvolvedor de plantão | Investiga o código, os logs e a auditoria, e prepara a correção |
| Encarregado de dados (DPO) | Avalia o risco aos titulares e conduz a comunicação à ANPD e aos titulares |

Os nomes e contatos ficam na seção 10. Na ausência do coordenador, o administrador do servidor assume a coordenação.

## 4. Detecção

| Fonte | Sinal | Onde ver |
|---|---|---|
| Webhook do Mercado Pago | `mercadopago webhook with invalid signature` em volume ou repetido; `mercadopago webhook secret not configured` | `docker compose logs app` (`app/api/webhooks/mercadopago/route.ts`) |
| Sincronização de pagamento | `mercadopago amount does not match the order`; `payment approved for an order not awaiting payment`; `mercadopago payment not found in the store` | `docker compose logs app` (`features/shared/lib/payments/payment-sync.ts`) |
| Reconciliação | `payment reconciliation failed` recorrente | `docker compose logs app` |
| Log de auditoria | `payment.status_sync`, `refund.request`, `refund.approve` ou `refund.complete` fora do padrão (horário, usuário, IP, valor) | `/admin/auditoria` (permissão `audit:read`) |
| Página de pagamento | Script, iframe ou cabeçalho diferente do inventário do checklist SAQ A (seção 5); CSP alterada | `sh deploy/check-headers.sh <ip>` e revisão do código-fonte da página |
| Repositório | Segredo commitado; mudança não revisada em `features/payment/`, `features/shared/lib/mercadopago/`, `features/shared/lib/security/` ou `deploy/` | GitHub (histórico e PRs) |
| Mercado Pago | Aviso de fraude, chargebacks em sequência, pagamentos que o painel mostra e a loja não conhece | Painel do Mercado Pago e e-mail da conta |
| Pessoas | Cliente relata cobrança indevida, página estranha ou e-mail suspeito; usuário interno relata acesso que não fez | Atendimento (SAC) e comunicação direta ao coordenador |

Quem detectar **qualquer** sinal comunica o coordenador na hora, por telefone, e registra o horário. Não tente investigar sozinho apagando ou alterando arquivos.

## 5. Classificação

| Nível | Critério | Exemplos | Tempo de resposta |
|---|---|---|---|
| **Crítico** | Comprometimento confirmado da página de pagamento, de credencial do Mercado Pago ou do servidor, ou vazamento confirmado de dados pessoais | Script estranho na página de pagamento; access token exposto; acesso de terceiro ao servidor ou ao banco | Imediato (até 1 h) |
| **Alto** | Suspeita forte de fraude em pagamento ou estorno, ou de acesso indevido a conta interna | Pedido liberado sem `approved`; estorno aprovado por quem não deveria; login interno de IP desconhecido | Até 4 h |
| **Médio** | Anomalia sem evidência de comprometimento | Pico de assinaturas inválidas no webhook; divergência de valor isolada | Até 24 h |
| **Baixo** | Evento sem impacto em pagamento nem em dados pessoais | Varredura de portas bloqueada; falha pontual de reconciliação | Próximo dia útil |

Na dúvida, classifique no nível acima. A classificação pode mudar durante a investigação, e cada mudança é registrada.

## 6. Contenção

Ações por cenário, na ordem. Registre cada ação com horário e autor.

**Página de pagamento alterada (skimming):**

1. Suspender os pagamentos: tirar o site do ar (`docker compose stop proxy`) ou, se possível, bloquear só `/conta/pedidos/*/pagamento`.
2. Preservar as evidências (seção 7) **antes** de corrigir.
3. Voltar o código para o último commit revisado da `master` e reconstruir a imagem (`docker compose build --no-cache app`).

**Credencial vazada (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `CLOUDFLARE_TUNNEL_TOKEN`, senhas do MySQL, `BETTER_AUTH_SECRET`):**

1. Revogar e gerar nova credencial no painel do provedor (Mercado Pago, Cloudflare) ou no MySQL.
2. Atualizar o `.env` e reiniciar os containers afetados (`docker compose up -d`).
3. Trocar o `BETTER_AUTH_SECRET` encerra todas as sessões; avise os usuários internos.
4. Se o segredo estiver no histórico do Git, considere-o exposto mesmo depois de removido.

**Fraude em pagamento ou estorno:**

1. Suspender o acesso do usuário interno envolvido: remover os perfis dele em `/admin/usuarios` e redefinir a senha, o que encerra as sessões abertas.
2. Segurar a expedição dos pedidos suspeitos e conferir cada `payment_id` no painel do Mercado Pago.
3. Cortar o webhook, se a origem for ele: na VPS, desativar o webhook no painel do Mercado Pago; no servidor local, desligar o túnel (`docker compose --profile tunnel stop tunnel`); a reconciliação por `GET /v1/payments/{id}` continua confirmando os pagamentos legítimos.

**Servidor ou banco comprometido:**

1. Isolar a máquina da rede (desligar o cabo ou o Wi-Fi), sem desligá-la, para não perder a memória.
2. Bloquear as portas no firewall do Windows.
3. Trocar todas as credenciais do `.env` a partir de outra máquina.

## 7. Preservação de evidências

Antes de corrigir, o administrador do servidor guarda, numa pasta fora do repositório e com acesso restrito:

- **Logs dos containers:** `docker compose logs --no-color --timestamps > incidente-<data>-logs.txt`.
- **Auditoria:** exportação de `audit_logs` e `payment_notifications` do período, com o usuário de migração.
- **Banco:** um dump completo no estado atual (`deploy/backup/backup.sh`, executado à mão) e os backups diários do período, que **não podem ser apagados** pela retenção de 30 dias: copie-os para a pasta do incidente.
- **Código:** o commit em produção (`git rev-parse HEAD`), o `git status` e o diff de qualquer arquivo alterado fora do Git; o HTML e os scripts servidos na página de pagamento.
- **Configuração:** os cabeçalhos (`deploy/check-headers.sh`), o `docker-compose.yml` e os Caddyfiles em uso. O `.env` **não** é copiado; registre só quais variáveis mudaram.

Para cada arquivo, registre data, hora (UTC), quem coletou e o hash SHA-256 (`sha256sum <arquivo>`). Os logs de auditoria são imutáveis no banco (gatilhos `trg_audit_logs_before_update` e `trg_audit_logs_before_delete`).

## 8. Comunicação

| Destinatário | Quando | Como e prazo | Quem |
|---|---|---|---|
| **Mercado Pago** | Suspeita ou confirmação de comprometimento da página de pagamento, de credencial ou de fraude em pagamento | Imediato, pelo canal de suporte ou de segurança da conta (seção 10). O Mercado Pago, como adquirente/subadquirente, aciona as bandeiras | Coordenador |
| **Bandeiras de cartão** | Comprometimento de dados de cartão | Pelo Mercado Pago, que é o responsável pela relação com as bandeiras. A loja fornece as informações e as evidências pedidas | Coordenador |
| **ANPD** | Incidente com dado pessoal que possa causar risco ou dano relevante aos titulares (LGPD, art. 48) | Em até **3 dias úteis** do conhecimento, pelo formulário de comunicação de incidente no site da ANPD (Resolução CD/ANPD nº 15/2024; conferir a norma vigente) | DPO |
| **Titulares** | Mesmo critério da ANPD | Em até **3 dias úteis**, por e-mail, em linguagem clara: o que aconteceu, quais dados, riscos, medidas tomadas e o que o titular deve fazer, com o contato do DPO | DPO |
| **Equipe e professores (SENAI)** | Todo incidente crítico ou alto | No mesmo dia | Coordenador |
| **Autoridade policial** | Crime confirmado (invasão, fraude) | Boletim de ocorrência, com as evidências da seção 7 | Coordenador |

- Nenhuma comunicação externa sai sem aprovação do coordenador.
- Nunca envie segredos, dados de cartão ou dados pessoais completos por e-mail ou chat durante o incidente.
- Ambiente de sandbox: as comunicações à ANPD, às bandeiras e aos titulares só são simuladas no teste anual.

## 9. Recuperação e lições aprendidas

### 9.1 Recuperação

1. Corrigir a causa por PR revisado, com teste que reproduza o problema.
2. Se o banco foi alterado, restaurar o backup anterior ao incidente (`ARCHITECTURE.md`, seção 5; procedimento da issue #81) e reconciliar os pagamentos do período com o Mercado Pago (`GET /v1/payments/{id}`).
3. Conferir os cabeçalhos (`deploy/check-headers.sh`), o inventário de scripts da página de pagamento e as credenciais novas.
4. Religar o site e o webhook (painel do Mercado Pago na VPS, túnel no servidor local), monitorando os logs e a auditoria com atenção redobrada por 7 dias.
5. O coordenador declara o incidente encerrado e registra a data.

### 9.2 Lições aprendidas

Em até **5 dias úteis** depois do encerramento, a equipe faz uma reunião sem caça a culpados e registra numa issue (label `segurança`):

- linha do tempo (detecção, classificação, contenção, comunicação, recuperação);
- causa raiz e por que não foi detectada antes;
- o que funcionou e o que falhou neste plano;
- ações corretivas, cada uma com issue, responsável e prazo;
- atualização deste plano, da política de segurança e do checklist SAQ A, se necessário.

## 10. Contatos

Preencher antes da aprovação e revisar a cada seis meses. Não registrar senhas aqui.

| Papel ou órgão | Nome | Telefone | E-mail | Observação |
|---|---|---|---|---|
| Coordenador (responsável pela segurança) | _a preencher_ | _a preencher_ | _a preencher_ |  |
| Administrador do servidor | _a preencher_ | _a preencher_ | _a preencher_ |  |
| Desenvolvedor de plantão | _a preencher_ | _a preencher_ | _a preencher_ |  |
| Encarregado de dados (DPO) | _a preencher_ | _a preencher_ | _a preencher_ |  |
| Professor orientador (SENAI) | _a preencher_ | _a preencher_ | _a preencher_ |  |
| Mercado Pago — suporte e segurança | — | _a preencher_ | _a preencher_ | Canal de suporte do painel de desenvolvedores da conta |
| Hostinger — suporte | — | — | _a preencher_ | Painel da conta (VPS, snapshots, firewall) |
| Cloudflare — suporte | — | — | _a preencher_ | Painel da conta (túnel, só no servidor local) |
| ANPD — comunicação de incidente | — | — | — | Formulário em `gov.br/anpd` (conferir o endereço vigente) |

## 11. Teste anual

- O plano é testado **uma vez por ano** e depois de mudanças relevantes no checkout ou na infraestrutura (PCI DSS 12.10.2).
- Formato: simulação de mesa de um cenário (ex.: script estranho na página de pagamento, ou access token commitado), percorrendo detecção, classificação, contenção, preservação de evidências, comunicação (simulada) e recuperação, com cronômetro.
- O teste confere também: os contatos da seção 10, o acesso aos painéis do Mercado Pago e da Cloudflare, a restauração de um backup e a exportação da auditoria.
- O resultado é registrado numa issue, com as falhas encontradas e as correções deste plano.

| Data do teste | Cenário | Participantes | Resultado e issue |
|---|---|---|---|
| _a preencher_ | _a preencher_ | _a preencher_ | _a preencher_ |
