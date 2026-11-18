# Atelier Bureau — Política de segurança da informação

Política de segurança da informação do e-commerce Atelier Bureau (issue #182, pendência P10 do [checklist PCI-DSS SAQ A](AtelierBureau_PCI_DSS_SAQ_A.md)). Base: RN19, RNF03, RNF05, RNF06, RNF11, RNF12, LGPD e PCI DSS v4.0.1 (requisito 12).

> **Status: aprovação pendente do responsável.** Esta versão descreve os controles que o sistema já aplica e as regras que a equipe se compromete a seguir. Ela só passa a valer depois de aprovada e assinada pelo responsável indicado na seção 3. Projeto acadêmico em sandbox e homologação, sem dados reais de clientes nem de pagamento.

## 1. Controle de versão

| Versão | Data | Autor | Alteração |
|---|---|---|---|
| 1.0 | 17/11/2026 | Equipe Atelier Bureau | Primeira versão, para aprovação (#182) |
| 1.1 | 18/11/2026 | Equipe Atelier Bureau | 2FA obrigatório no sistema desde a #177, rate limit das actions de pagamento e estorno (#175), TLS do MySQL e porta 3001 do painel de disponibilidade, conforme a auditoria de documentação de 18/11/2026 (#223) |

| Aprovação | Nome | Data | Assinatura |
|---|---|---|---|
| Responsável (3.1) | _a preencher_ | _a preencher_ | _a preencher_ |

## 2. Objetivo e escopo

Proteger a confidencialidade, a integridade e a disponibilidade dos dados de clientes, pedidos e pagamentos, e manter o checkout elegível ao SAQ A do PCI DSS.

A política vale para:

- **Sistemas:** a aplicação Next.js, o banco MySQL e os containers do servidor (`proxy`, `app`, `db`, `backup`, `uptime-kuma` e, só no servidor local, `tunnel` e `webhook-gate`) e a VPS que os hospeda na entrega (Hostinger), descritos no `ARCHITECTURE.md`, seções 5.1 e 5.2.
- **Código e configuração:** o repositório no GitHub, o CI (`.github/workflows/`) e o arquivo `.env` do servidor.
- **Provedores:** Hostinger (VPS de entrega), registrador do domínio, Let's Encrypt (certificado), Mercado Pago, Cloudflare (túnel do webhook, só no servidor local), ViaCEP, Correios, transportadora, BrasilAPI, provedor de NF-e e servidor SMTP.
- **Pessoas:** a equipe de desenvolvimento e todos os usuários internos do back office (perfis do RF55).

Fora do escopo: dados de cartão. Eles nunca chegam ao servidor nem ao banco (RN19); o Payment Brick do Mercado Pago captura e tokeniza o cartão no navegador.

## 3. Papéis e responsabilidades

| Papel | Quem | Responsabilidades |
|---|---|---|
| 3.1 Responsável pela segurança | _a preencher_ | Aprova esta política e o plano de incidentes, decide sobre exceções, conduz a revisão anual e coordena incidentes |
| 3.2 Encarregado de dados (DPO, LGPD) | _a preencher_ | Recebe as solicitações dos titulares (RF42) e conduz a comunicação à ANPD e aos titulares em incidente com dado pessoal |
| 3.3 Administrador do servidor | _a preencher_ | Mantém a VPS (acesso SSH, atualizações), o servidor local, o `.env`, o firewall, os backups e os certificados |
| 3.4 Desenvolvedores | Equipe do projeto | Seguem o `CLAUDE.md` e o `ARCHITECTURE.md`, revisam PRs, não commitam segredos e mantêm as dependências atualizadas |
| 3.5 Usuários internos (back office) | Administrador, comercial, financeiro e estoque/logística | Usam conta nominal, protegem a senha e o segundo fator e comunicam qualquer suspeita ao responsável (3.1) |
| 3.6 Provedor de pagamento | Mercado Pago | Captura, tokeniza e processa o cartão; mantém a própria certificação PCI DSS (matriz de responsabilidades no checklist SAQ A) |

## 4. Controle de acesso

### 4.1 Aplicação

- **Menor privilégio:** o acesso segue os perfis internos (RF55) e os perfis da conta corporativa (RF10, RN08). Toda Server Action chama `requirePermission("<recurso>:<ação>")` antes de operar, e as consultas passam pela camada `features/shared/lib/db/`, que aplica o escopo do usuário. O id do usuário vem da sessão, nunca do request (`ARCHITECTURE.md`, seção 4). Esconder botão é só UX.
- **Contas nominais:** cada pessoa tem o próprio usuário (`/admin/usuarios`). Contas compartilhadas são proibidas.
- **Entrada e saída de pessoas:** o administrador atribui ao usuário interno só o perfil necessário e remove todos os perfis dele em `/admin/usuarios` no mesmo dia em que a pessoa deixa a função (o sistema ainda não tem desativação de conta; os perfis removidos ficam na auditoria como `user.roles`). Os perfis são revistos na revisão anual (seção 11).
- **2FA:** a autenticação em dois fatores (TOTP) está disponível para todos os usuários pelo Better Auth (`twoFactor`, `features/shared/lib/auth/auth.ts`; tela em `features/access/security/`). **Regra desta política:** todo usuário interno com acesso a pedidos, pagamentos, estornos, usuários ou auditoria deve ativar o 2FA. Desde a #177 (pendência P5), o sistema obriga o 2FA, ativo e verificado na sessão atual, para o usuário interno com acesso a pedidos, pagamentos ou estornos (`order:read`, `order:status:update`, `order:cancel`, `credit:approve` ou `payment:refund`, em `TWO_FACTOR_REQUIRED_PERMISSIONS`, `features/shared/lib/auth/permissions.ts`): sem ele, as telas e actions do back office levam à tela `/conta/seguranca`. Para os perfis só com acesso a usuários ou auditoria, a regra vale por esta política, sem trava no sistema.
- **Bloqueio de tentativas:** as rotas de login e cadastro têm rate limit (`features/shared/lib/rate-limit/rate-limit.ts`). As Server Actions de pagamento e estorno têm limite próprio, gravado no banco (tabela `rate_limit_buckets`, `features/shared/lib/rate-limit/persistent-limit.ts`, #175).

### 4.2 Infraestrutura

- O MySQL aceita só usuários nomeados. O usuário `dev`, para acesso pela rede, tem host restrito à sub-rede e `REQUIRE SSL`, e o app conecta com TLS (`DATABASE_TLS=required`, `features/shared/lib/db/connection-config.ts`). A exigência de TLS pelo servidor em toda conexão é a issue #221. O `root` não tem acesso remoto, o app usa `atelier_app` sem DDL, as migrations usam `atelier_migrate` e o backup usa `atelier_backup` (`deploy/mysql/init/01-users.sh`).
- **VPS (entrega):** só 22, 80 e 443 abertas no `ufw` e no firewall da Hostinger. MySQL (3306) e Uptime Kuma (3001) ficam no `127.0.0.1` da VPS, acessíveis só por túnel SSH, e não há usuário `dev`. SSH só com chave, sem login do `root` nem por senha, com `fail2ban` e atualizações automáticas de segurança.
- **Servidor local:** a porta 3306 é publicada só em `127.0.0.1`, salvo decisão explícita (`MYSQL_PUBLISH_ADDR`). As portas 80, 443 e 3001 (painel de disponibilidade, que o Caddy só atende para endereços privados) ficam liberadas no firewall só no perfil de rede **Privada**.
- No servidor local, o túnel do webhook (`cloudflared`) só alcança o `webhook-gate`, que repassa ao app apenas `POST /api/webhooks/mercadopago` (`deploy/caddy/Caddyfile.webhook`).
- O acesso ao repositório no GitHub é restrito aos membros da equipe. A `master` e a `develop` só recebem PR, sem `push --force` (`CLAUDE.md`, seção 10).

## 5. Senhas e autenticação

- Senhas só como hash, gerado pelo Better Auth. Nenhuma senha é gravada, logada ou enviada em texto claro.
- Tamanho mínimo de **10 caracteres** (`minPasswordLength: 10`). Recomenda-se frase-senha e gerenciador de senhas.
- A redefinição de senha usa link com validade de **1 hora** e encerra todas as sessões do usuário (`revokeSessionsOnPasswordReset`).
- A sessão usa cookie `httpOnly`, emitido só por HTTPS.
- Senhas de serviço (MySQL, SMTP, APIs) são longas, aleatórias e únicas por serviço, e ficam só no `.env` (seção 6).
- As contas fictícias do seed (`SEED_PASSWORD`) não podem ficar ativas com a senha do seed no servidor de entrega (issue #179, pendência P7).

## 6. Segredos e arquivo `.env`

- Todo segredo (`BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, senhas do MySQL, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `CLOUDFLARE_TUNNEL_TOKEN`, tokens de Correios, transportadora e NF-e, senha SMTP) fica **só no `.env`** do servidor, que não é versionado (`.gitignore`).
- O `.env.example` traz só os nomes das variáveis, sem valor real. Variável nova entra nele no mesmo PR.
- Segredo de servidor nunca usa o prefixo `NEXT_PUBLIC_` nem chega ao navegador. No navegador vai só a **chave pública** do Mercado Pago (`MERCADOPAGO_PUBLIC_KEY`).
- Integrações usam credenciais de **sandbox ou homologação**. Credencial de produção não entra neste projeto.
- É proibido commitar `.env`, dumps de banco, a pasta `backups/` ou credenciais, e colar segredos em issues, PRs, chats ou prints.
- **Rotação:** troca imediata do segredo quando houver suspeita de vazamento, saída de pessoa com acesso ao `.env` ou exposição acidental (commit, log, print); fora isso, na revisão anual. Trocar a `DATA_ENCRYPTION_KEY` exige recriptografar os dados pessoais antes de descartar a chave antiga.

## 7. Backup e restauração

- O container `backup` roda `mysqldump` (`--single-transaction --routines --triggers`) uma vez por dia, no horário `BACKUP_HOUR` (UTC), com o usuário `atelier_backup`, e grava `backups/atelier_bureau-<data>.sql.gz` (`deploy/backup/backup.sh`).
- A retenção é de **30 dias** (`BACKUP_RETENTION_DAYS`); os arquivos mais antigos são apagados pelo próprio script.
- Os backups ficam na pasta `backups/` do servidor, fora do Git, e na VPS também numa cópia diária fora dela (`rclone`), com acesso restrito ao administrador do servidor. Eles contêm dados pessoais (documento e telefone criptografados com AES-256-GCM, e-mail e endereço em claro), mas **nenhum dado de cartão** (RN19). O acesso à pasta é restrito ao administrador do servidor (3.3).
- A restauração é feita importando o dump no MySQL (`gunzip -c <arquivo> | mysql ...`) com o usuário de migração. O teste de restauração documentado é a issue #81, ainda aberta; até ela fechar, o responsável (3.1) confere manualmente, ao menos uma vez por mês, que o backup do dia existe e não está vazio.
- **Cópia fora da máquina:** hoje não há. Uma cópia externa criptografada é recomendada antes de qualquer uso com dados reais.

## 8. Logs e auditoria

- **Log de aplicação:** `features/shared/lib/logger/logger.ts` escreve no stdout do container (lido com `docker compose logs app`). Ele mascara recursivamente chaves de senha, segredo, token, cookie, CPF, CNPJ, cartão, CVV, documento, telefone, e-mail e headers (RNF05, LGPD). As integrações registram só a operação e o status HTTP, sem payload.
- **Log de auditoria (RNF12):** as ações sensíveis (pedidos, pagamentos, estornos, aprovações, preços, estoque, usuários, privacidade) gravam na tabela `audit_logs`, **na mesma transação** da mudança, quem fez, quando (UTC), de qual IP e os valores antes e depois (`features/shared/lib/db/audit.ts`). Eventos do sistema (webhook, reconciliação) gravam `user_id` nulo.
- A auditoria é **somente inclusão**: nenhuma tela altera ou apaga registros, e gatilhos do banco recusam `UPDATE` e `DELETE` (`docs/banco-de-dados/05-gatilhos.md`).
- A consulta é feita em `/admin/auditoria`, com a permissão `audit:read`.
- Erros exibidos ao usuário nunca trazem stack trace nem detalhe interno (RNF05).
- **Revisão:** o responsável (3.1) revisa a auditoria de pagamentos, estornos e usuários internos ao menos uma vez por semana durante a operação e sempre que houver suspeita de incidente. O monitoramento com alertas é a issue #80.

## 9. Atualização de dependências e mudanças

- Toda mudança entra por PR revisado, com CI verde (formatação, lint, typecheck, testes com cobertura, build e orçamento de performance, `.github/workflows/ci.yml`).
- Dependência nova só quando nada da stack resolve, com a justificativa no PR (`CLAUDE.md`, seção 4).
- O `package-lock.json` é versionado e o CI instala com `npm ci`.
- **Regra desta política:** as dependências são revisadas com `npm audit` ao menos uma vez por mês e antes de cada release. Vulnerabilidade **crítica** é corrigida em até 7 dias e **alta** em até 30 dias, ou recebe exceção registrada na issue. A verificação automática no CI é a issue #176 (pendência P4).
- As imagens Docker (`caddy:2`, `mysql:8.4`, `node`) são atualizadas a cada release com `docker compose pull` e `docker compose build --pull`.
- Mudanças no checkout, nos cabeçalhos de segurança, no proxy ou nas integrações exigem revisão do [checklist SAQ A](AtelierBureau_PCI_DSS_SAQ_A.md).

## 10. Terceiros

| Provedor | Dados que recebe | Exigência |
|---|---|---|
| Mercado Pago | Cartão (direto no Brick), token, valor, e-mail e documento do pagador | Certificação PCI DSS vigente com AOC arquivada (issue #178); credenciais de sandbox |
| Hostinger (VPS) | Toda a aplicação, o banco e os backups na entrega | SSH só com chave, firewall com 22, 80 e 443, banco no loopback, conta do painel com 2FA |
| Cloudflare (túnel, só no servidor local) | Tráfego do webhook do Mercado Pago | Túnel restrito à rota do webhook; token só no `.env` |
| Correios, transportadora, ViaCEP, BrasilAPI | CEP, endereço e dados de envio | Chamada só no servidor, com timeout, fallback e log sem dados pessoais (`CLAUDE.md`, seção 9) |
| Provedor de NF-e | Dados fiscais do pedido e do destinatário | Homologação; token só no `.env` |
| Servidor SMTP | E-mail e conteúdo das mensagens transacionais | Conexão autenticada; senha só no `.env` |
| GitHub | Código e documentação, sem segredos nem dados de clientes | Acesso restrito à equipe |

- Antes de contratar um provedor novo que receba dados pessoais ou de pagamento, o responsável (3.1) avalia a segurança dele e registra a decisão na issue.
- O Mercado Pago é o único provedor que toca dados de cartão. A AOC dele é conferida **todo ano** (`docs/pci/README.md`, criado na issue #178).

## 11. Incidentes

Qualquer suspeita de incidente (acesso indevido, vazamento de segredo, alteração na página de pagamento, pagamento confirmado sem `approved`, perda de backup) é comunicada **na hora** ao responsável (3.1). Incidentes que envolvam pagamento ou dados pessoais seguem o [plano de resposta a incidentes de pagamento](AtelierBureau_Resposta_Incidentes_Pagamento.md).

## 12. Revisão anual e exceções

- Esta política é revisada **uma vez por ano** e sempre que houver mudança relevante no checkout, na infraestrutura, nos provedores ou depois de um incidente.
- A revisão anual inclui: os perfis e usuários internos ativos, o 2FA dos perfis internos, a rotação de segredos, o teste de restauração do backup, as dependências vulneráveis, a AOC do Mercado Pago, o [checklist SAQ A](AtelierBureau_PCI_DSS_SAQ_A.md) e o teste do plano de incidentes.
- Toda exceção a esta política é aprovada pelo responsável (3.1), com prazo e motivo, e registrada numa issue.
- O descumprimento desta política é tratado pelo responsável (3.1) e pode levar à remoção dos perfis de acesso.
