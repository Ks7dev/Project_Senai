# Checklist de lançamento — Atelier Bureau

Issues #82 (deploy e checklist de lançamento), #179 (contas fictícias do seed) e #206 (VPS pública) · RNF01, RNF06, RNF16, RN19 · PCI 2.2.2 (pendência P7 do [checklist SAQ A](AtelierBureau_PCI_DSS_SAQ_A.md)).

Roteiro para subir o servidor de entrega na **VPS pública** (seção 5.2 do `ARCHITECTURE.md`) e conferir tudo antes da apresentação final. A instalação da VPS, passo a passo, está no [guia de deploy](AtelierBureau_Deploy_VPS.md); este checklist confere o resultado. Os comandos rodam na VPS, por SSH, na pasta do projeto (`~/atelier-bureau`) na branch `master`. Marque cada item, com data e responsável, na tabela de registro (seção 12).

> O servidor local (seção 5.1 do `ARCHITECTURE.md`) continua valendo para desenvolvimento e testes pela rede, mas não é mais o servidor de entrega.

## 1. Preparação da VPS

- [ ] VPS Hostinger KVM 2 (2 vCPU, 8 GB de RAM) com Ubuntu 24.04 LTS, Docker e Docker Compose 2.24 ou mais novo (`docker compose version`).
- [ ] Domínio com registro **A** (e `www`) apontando para o IP da VPS: `nslookup <domínio>` devolve o IP.
- [ ] Usuário `deploy` no grupo `docker`; SSH só com chave, com `PermitRootLogin no` e `PasswordAuthentication no`.
- [ ] `ufw` e firewall do painel da Hostinger com só 22, 80 e 443 abertas; `fail2ban` e `unattended-upgrades` instalados.
- [ ] Fuso da VPS em UTC (`timedatectl`) e swap de 2 GB ativo (`swapon --show`).
- [ ] Repositório clonado e atualizado: `git checkout master && git pull`.

## 2. Arquivo `.env` do servidor

Copie o modelo (`cp .env.example .env && chmod 600 .env`) e preencha, conforme a seção 5 do guia de deploy. Nenhum valor real é versionado.

- [ ] `COMPOSE_FILE="docker-compose.yml:docker-compose.vps.yml"`, `SITE_HOST` com o domínio (sem `https://`) e `ACME_EMAIL` com o e-mail dos avisos do Let's Encrypt.
- [ ] Senhas do MySQL fortes e diferentes entre si: `MYSQL_ROOT_PASSWORD`, `MYSQL_APP_PASSWORD`, `MYSQL_MIGRATE_PASSWORD` e `MYSQL_BACKUP_PASSWORD`. Gere com `openssl rand -hex 24` (o base64 pode gerar `/` e `+`, que quebram a URL de conexão). `MYSQL_DEV_PASSWORD` fica vazio.
- [ ] `BETTER_AUTH_SECRET` aleatório (`openssl rand -base64 32`) e `BETTER_AUTH_URL="https://<domínio>"`.
- [ ] **`DATA_ENCRYPTION_KEY` (#75, PR #185):** `openssl rand -base64 32`, incluída **antes** do primeiro `docker compose up -d`. Sem ela o compose não sobe. **Guarde uma cópia fora do servidor** (gerenciador de senhas da equipe): sem a chave, os CPFs e telefones gravados não podem ser lidos. Ao iniciar, o app cifra as linhas antigas que estiverem em texto.
- [ ] `SEED_PASSWORD` preenchida com uma senha forte (nunca vazia: vazia, o seed usa a senha de desenvolvimento conhecida). Ela só vale até a troca da seção 7.
- [ ] Mercado Pago só com credenciais de **sandbox** (`TEST-...`) e `MERCADOPAGO_ALLOW_PRODUCTION="false"`.
- [ ] Correios, transportadora e NF-e só com credenciais de homologação/sandbox, ou vazias (as regras de fallback RN20 e RN21 assumem).
- [ ] SMTP (`SMTP_*`, `EMAIL_FROM`) de um provedor transacional (Brevo ou Resend), porta 587, com SPF, DKIM e DMARC configurados no domínio.
- [ ] `CLOUDFLARE_TUNNEL_TOKEN` vazio: na VPS o túnel não é usado.
- [ ] Conferência: `git status` não mostra o `.env` (ele está no `.gitignore`).

## 3. Subida e banco de dados

- [ ] `docker compose up -d --build` sobe `proxy`, `app`, `db`, `backup` e `uptime-kuma`.
- [ ] `docker compose ps`: todos os serviços como `running (healthy)`; `tunnel` e `webhook-gate` não aparecem.
- [ ] **Migrations na subida:** `docker compose logs app` mostra `Applying database migrations...` seguido de `Starting Atelier Bureau...`, sem erro. O `prisma migrate deploy` roda a cada início do app.
- [ ] **Gatilhos (#8, PR #172):** o compose passa `--log-bin-trust-function-creators=1` ao MySQL. Confira os 20 gatilhos:

  ```sh
  docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = \"atelier_bureau\";"'
  ```

- [ ] Seed (só na primeira subida): `sh deploy/vps/node-task.sh npm run db:seed`.
- [ ] `https://<domínio>/api/health` responde `{"status":"ok"}`.

## 4. Rede e HTTPS

- [ ] **Portas expostas:** de uma rede de fora da VPS, `nmap <ip-da-vps>` mostra só 22, 80 e 443 abertas. Na VPS, `docker compose ps` mostra o MySQL (3306) e o Uptime Kuma (3001) só em `127.0.0.1`.
- [ ] **Certificado (#180):** `https://<domínio>` abre num notebook e num celular, em qualquer rede, com cadeado válido do Let's Encrypt, sem instalar nenhum certificado.
- [ ] `http://<domínio>` e `https://www.<domínio>` redirecionam para `https://<domínio>` (308).
- [ ] Headers de segurança: `sh deploy/check-headers.sh <domínio>` sai sem erro.
- [ ] Renovação do certificado: `docker compose logs proxy` não mostra erro de ACME.

## 5. MySQL

- [ ] O `root` não tem acesso remoto (`MYSQL_ROOT_HOST=localhost` no compose).
- [ ] O app usa o `atelier_app`, sem DDL; as migrations usam o `atelier_migrate`.
- [ ] A porta 3306 fica só no loopback da VPS (`docker-compose.vps.yml`), sem usuário `dev`. Acesso de um cliente SQL só por túnel SSH: `ssh -L 3306:127.0.0.1:3306 deploy@<ip-da-vps>`.

## 6. Segurança das contas do backoffice (2FA)

- [ ] Cada conta interna usada na apresentação (administração, comercial, financeiro) tem a autenticação em dois fatores ativada em **Minha conta → Segurança** (`/conta/seguranca`), com o aplicativo autenticador do responsável.
- [ ] Os códigos de recuperação foram guardados no gerenciador de senhas da equipe.

## 7. Contas fictícias do seed (#179)

O seed cria seis contas fictícias (`prisma/seed-data.ts`): `admin@`, `comercial@`, `financeiro@` e `cliente.pf@atelierbureau.test`, e `solicitante@` e `aprovador@empresa-ficticia.test`. Todas usam a `SEED_PASSWORD`, que está no `.env` e, se ficou vazia, é a senha de desenvolvimento publicada no repositório. No servidor de entrega, essa senha não pode continuar valendo (PCI 2.2.2).

O script `scripts/rotate-seed-accounts.ts` troca a senha de cada conta do seed por uma aleatória forte (32 caracteres, cerca de 192 bits), encerra as sessões abertas e grava o log de auditoria na mesma transação (RNF12). Na VPS, ele roda pelo `deploy/vps/node-task.sh`, que aponta o `DATABASE_URL` para o banco `db` da rede do Compose. Cada execução instala as dependências antes e leva alguns minutos.

1. [ ] Veja o que vai mudar, sem alterar nada:

   ```sh
   sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --dry-run
   ```

2. [ ] Escolha o modo:
   - **Trocar a senha** (contas que serão usadas na apresentação):

     ```sh
     sh deploy/vps/node-task.sh npm run accounts:rotate-seed
     ```

     As novas senhas aparecem **uma única vez** no terminal. Guarde-as no gerenciador de senhas da equipe na hora; elas não ficam gravadas em lugar nenhum.

   - **Desativar** (contas que não serão usadas): a senha é trocada por uma aleatória que é descartada, e ninguém consegue entrar com ela:

     ```sh
     sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --disable
     ```

   - Os dois modos podem ser combinados com `--keep <e-mail>` (repetível), para deixar uma conta de fora. Ex.: desativar todas menos o administrador e o cliente da demonstração, e depois trocar só a senha dessas duas:

     ```sh
     sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --disable --keep admin@atelierbureau.test --keep cliente.pf@atelierbureau.test
     sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --keep comercial@atelierbureau.test --keep financeiro@atelierbureau.test --keep solicitante@empresa-ficticia.test --keep aprovador@empresa-ficticia.test
     ```

     Atenção: rodar o modo de troca sem `--keep` gera senhas novas também para as contas desativadas, que voltam a poder entrar.

3. [ ] Tente entrar em `https://<domínio>/entrar` com a `SEED_PASSWORD` antiga numa conta do seed: o login é recusado.
4. [ ] Apague a `SEED_PASSWORD` do `.env` do servidor (deixe a linha vazia). Rodar o seed de novo não volta a senha antiga: ele só cria a senha de contas que ainda não têm uma.
5. [ ] Ative o 2FA nas contas internas que continuarem em uso (seção 6).
6. [ ] Registre a execução na tabela da seção 12 e na #179.

## 8. Backup e restauração (#81)

- [ ] O container `backup` está `healthy` e há um dump do dia em `./backups` (ou gere um: `docker compose exec backup sh /usr/local/bin/backup.sh`).
- [ ] O teste de restauração foi feito e registrado, dentro do RTO de 4 h, conforme `docs/AtelierBureau_Backup_Restauracao.md` (scripts `deploy/backup/restore.sh` e `restore.ps1`).
- [ ] Backups automáticos da Hostinger ativos e um snapshot tirado depois da instalação.
- [ ] Cópia diária do `./backups` para fora da VPS (`rclone`, seção 10 do guia de deploy) funcionando: o dump do dia aparece no destino.
- [ ] Cópia fora do servidor da pasta `./storage` e do `.env` (com a `DATA_ENCRYPTION_KEY`).

## 9. Monitoramento (#80)

- [ ] Painel de disponibilidade acessível por túnel SSH (`ssh -L 3001:127.0.0.1:3001 deploy@<ip-da-vps>` e `http://localhost:3001`), com o usuário administrador criado logo na primeira abertura.
- [ ] Monitores e alerta por e-mail configurados e testados, conforme `docs/AtelierBureau_Monitoramento.md`.

## 10. Pagamento e webhook

- [ ] Webhook cadastrado no painel do Mercado Pago (aplicação de teste, evento Pagamentos) em `https://<domínio>/api/webhooks/mercadopago`, com `MERCADOPAGO_NOTIFICATION_URL` e `MERCADOPAGO_WEBHOOK_SECRET` preenchidos. Na VPS não há túnel: o webhook chega direto pelo domínio. Se ele falhar, a reconciliação a cada 5 minutos confirma os pagamentos.
- [ ] Uma compra de teste com cartão de teste do Mercado Pago termina com o pagamento aprovado.

## 11. Apresentação final

- [ ] Roteiro da demonstração definido: vitrine e busca → produto → carrinho e frete → checkout e pagamento sandbox → pedido B2B com aprovação → backoffice (pedidos, estoque, NF-e em homologação) → painel de disponibilidade.
- [ ] Contas da demonstração com as senhas novas (seção 7) à mão, no gerenciador de senhas.
- [ ] Site testado na rede do local da apresentação e no 4G de um celular.
- [ ] Rodapé avisa que é um projeto acadêmico de demonstração, sem dados reais (LGPD).
- [ ] Plano B: hotspot do celular, caso a rede do local bloqueie o site, e vídeo curto do fluxo principal, caso a internet falhe.
- [ ] Slides e documentação (requisitos, banco de dados, arquitetura) prontos.

## 12. Registro de execução

| Seção | Item | Data | Responsável | Observações |
|---|---|---|---|---|
| 2 | `.env` completo, `DATA_ENCRYPTION_KEY` guardada fora do servidor | | | |
| 3 | `docker compose up -d`, migrations e 20 gatilhos | | | |
| 1 | VPS endurecida (SSH, firewall, atualizações) | | | |
| 4 | Só 22, 80 e 443 abertas (`nmap`) | | | |
| 4 | Certificado Let's Encrypt e headers de segurança | | | |
| 6 | 2FA nas contas internas | | | |
| 7 | Contas do seed trocadas ou desativadas (#179) | | | |
| 8 | Teste de restauração (tempo medido) | | | |
| 8 | Cópia do backup fora da VPS | | | |
| 9 | Alerta de monitoramento testado | | | |
| 11 | Apresentação final preparada | | | |
