# Checklist de lançamento — Atelier Bureau

Issues #82 (deploy e checklist de lançamento) e #179 (contas fictícias do seed) · RNF01, RNF06, RNF16, RN19 · PCI 2.2.2 (pendência P7 do [checklist SAQ A](AtelierBureau_PCI_DSS_SAQ_A.md)).

Roteiro para subir o servidor local de entrega (seção 5.1 do `ARCHITECTURE.md`) e conferir tudo antes da apresentação final. Execute na ordem, na máquina servidora, a partir da pasta do projeto na branch `master`. Marque cada item, com data e responsável, na tabela de registro (seção 12).

> Comandos para PowerShell ou Git Bash. Onde houver diferença, os dois aparecem.

## 1. Preparação da máquina

- [ ] Docker Desktop instalado, iniciando com o Windows, e Git instalado.
- [ ] Repositório clonado e atualizado: `git checkout master && git pull`.
- [ ] IP fixo reservado para a máquina no roteador (ex.: `192.168.0.50`).
- [ ] A rede Wi-Fi/cabeada está no perfil **Privado** do Windows (Configurações → Rede e Internet → Propriedades da rede).
- [ ] Energia: a máquina não entra em suspensão durante a apresentação (Configurações → Sistema → Energia).

## 2. Arquivo `.env` do servidor

Copie o modelo (`cp .env.example .env`) e preencha. Nenhum valor real é versionado.

- [ ] `SITE_HOST` com o IP fixo da máquina e `LAN_SUBNET` com a sub-rede (ex.: `192.168.0.%`).
- [ ] Senhas do MySQL fortes e diferentes entre si: `MYSQL_ROOT_PASSWORD`, `MYSQL_APP_PASSWORD`, `MYSQL_MIGRATE_PASSWORD`, `MYSQL_BACKUP_PASSWORD` (e `MYSQL_DEV_PASSWORD` só se o banco for aberto à rede, seção 5). Gere com `openssl rand -base64 24`.
- [ ] `DATABASE_URL` e `MIGRATION_DATABASE_URL` com as mesmas senhas, apontando para `localhost:3306` (usados pelo seed e pelos scripts que rodam fora do container).
- [ ] `BETTER_AUTH_SECRET` aleatório (`openssl rand -base64 32`) e `BETTER_AUTH_URL="https://<SITE_HOST>"`.
- [ ] **`DATA_ENCRYPTION_KEY` (#75, PR #185):** `openssl rand -base64 32`, incluída **antes** do primeiro `docker compose up -d`. Sem ela o compose não sobe. **Guarde uma cópia fora do servidor** (gerenciador de senhas da equipe): sem a chave, os CPFs e telefones gravados não podem ser lidos. Ao iniciar, o app cifra as linhas antigas que estiverem em texto.
- [ ] `SEED_PASSWORD` preenchida com uma senha forte (nunca vazia: vazia, o seed usa a senha de desenvolvimento conhecida). Ela só vale até a troca da seção 7.
- [ ] Mercado Pago só com credenciais de **sandbox** (`TEST-...`) e `MERCADOPAGO_ALLOW_PRODUCTION="false"`: a trava da #7 recusa credencial que não começa com `TEST-` (`features/shared/lib/mercadopago/mercadopago.ts`).
- [ ] Correios, transportadora e NF-e só com credenciais de homologação/sandbox, ou vazias (as regras de fallback RN20 e RN21 assumem).
- [ ] SMTP (`SMTP_*`, `EMAIL_FROM`) preenchido, se houver servidor de e-mail; senão os e-mails vão para `./storage/outbox`.
- [ ] Conferência: `git status` não mostra o `.env` (ele está no `.gitignore`).

## 3. Subida e banco de dados

- [ ] `docker compose up -d` sobe `proxy`, `app`, `db`, `backup` e `uptime-kuma`. O `webhook-gate` e o `tunnel` só sobem com `docker compose --profile tunnel up -d`, quando o webhook do Mercado Pago for usado.
- [ ] `docker compose ps`: todos os serviços como `running (healthy)`.
- [ ] **Migrations na subida:** `docker compose logs app` mostra `Applying database migrations...` seguido de `Starting Atelier Bureau...`, sem erro. O `prisma migrate deploy` roda a cada início do app.
- [ ] **Gatilhos (#8, PR #172):** o compose passa `--log-bin-trust-function-creators=1` ao MySQL. Num servidor que já existia, o `up -d` recria o container do banco e mantém os dados no volume. Confira os 20 gatilhos:

  ```sh
  docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = \"atelier_bureau\";"'
  ```

- [ ] Seed (só na primeira subida): `npm ci` e `npm run db:seed` na máquina servidora (fora do container, conforme o `README.md`).
- [ ] `https://<SITE_HOST>/api/health` responde `{"status":"ok"}`.

## 4. Rede, firewall e HTTPS

- [ ] **Firewall do Windows, só no perfil Privado** (PowerShell como administrador):

  ```powershell
  New-NetFirewallRule -DisplayName "Atelier Bureau HTTP/HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Private
  # Só se o painel de monitoramento estiver no compose (#80):
  New-NetFirewallRule -DisplayName "Atelier Bureau monitoramento" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
  # Só se o banco for aberto à rede (seção 5):
  New-NetFirewallRule -DisplayName "Atelier Bureau MySQL" -Direction Inbound -Protocol TCP -LocalPort 3306 -Action Allow -Profile Private
  ```

  Confira que nenhuma regra libera essas portas no perfil Público: `Get-NetFirewallRule -DisplayName "Atelier Bureau*" | Select-Object DisplayName, Profile, Enabled`.

- [ ] **Certificado raiz:** exporte com `powershell -ExecutionPolicy Bypass -File deploy\export-root-cert.ps1` (ou `sh deploy/export-root-cert.sh`) e instale o `deploy/certs/root.crt` em **cada dispositivo** da apresentação (Windows: Autoridades de Certificação Raiz Confiáveis; Android/iOS: instalar e habilitar a confiança no certificado).
- [ ] **Acesso HTTPS de outro dispositivo:** abra `https://<SITE_HOST>` num notebook e num celular da mesma rede. A página carrega sem aviso de certificado.
- [ ] `http://<SITE_HOST>` redireciona para `https://` (308).
- [ ] Headers de segurança, a partir de outro dispositivo: `sh deploy/check-headers.sh <SITE_HOST>` sai sem erro.

## 5. MySQL na rede

- [ ] O `root` não tem acesso remoto (`MYSQL_ROOT_HOST=localhost` no compose).
- [ ] O app usa o `atelier_app`, sem DDL; as migrations usam o `atelier_migrate`.
- [ ] **Decisão pendente do responsável do produto:** abrir ou não o MySQL à rede (`MYSQL_PUBLISH_ADDR`). O padrão é `127.0.0.1` (só esta máquina), porque no Docker Desktop o MySQL vê toda conexão da LAN com o IP do gateway do Docker e não consegue aplicar a restrição por sub-rede do usuário `dev`. Se a decisão for abrir:
  - `MYSQL_PUBLISH_ADDR="0.0.0.0"` e `MYSQL_DEV_PASSWORD` forte no `.env`;
  - regra do firewall da porta 3306 só no perfil Privado (seção 4);
  - teste de outro dispositivo: `mysql -h <SITE_HOST> -u dev -p --ssl-mode=REQUIRED atelier_bureau` conecta, e o mesmo comando com `--ssl-mode=DISABLED` é recusado.
  - Registre a decisão na #82 e na #7.

## 6. Segurança das contas do backoffice (2FA)

- [ ] Cada conta interna usada na apresentação (administração, comercial, financeiro) tem a autenticação em dois fatores ativada em **Minha conta → Segurança** (`/conta/seguranca`), com o aplicativo autenticador do responsável.
- [ ] Os códigos de recuperação foram guardados no gerenciador de senhas da equipe.

## 7. Contas fictícias do seed (#179)

O seed cria seis contas fictícias (`prisma/seed-data.ts`): `admin@`, `comercial@`, `financeiro@` e `cliente.pf@atelierbureau.test`, e `solicitante@` e `aprovador@empresa-ficticia.test`. Todas usam a `SEED_PASSWORD`, que está no `.env` e, se ficou vazia, é a senha de desenvolvimento publicada no repositório. No servidor de entrega, essa senha não pode continuar valendo (PCI 2.2.2).

O script `scripts/rotate-seed-accounts.ts` troca a senha de cada conta do seed por uma aleatória forte (32 caracteres, cerca de 192 bits), encerra as sessões abertas e grava o log de auditoria na mesma transação (RNF12). Ele usa o `DATABASE_URL` do `.env` (`localhost:3306`).

1. [ ] Veja o que vai mudar, sem alterar nada:

   ```sh
   npm run accounts:rotate-seed -- --dry-run
   ```

2. [ ] Escolha o modo:
   - **Trocar a senha** (contas que serão usadas na apresentação):

     ```sh
     npm run accounts:rotate-seed
     ```

     As novas senhas aparecem **uma única vez** no terminal. Guarde-as no gerenciador de senhas da equipe na hora; elas não ficam gravadas em lugar nenhum.

   - **Desativar** (contas que não serão usadas): a senha é trocada por uma aleatória que é descartada, e ninguém consegue entrar com ela:

     ```sh
     npm run accounts:rotate-seed -- --disable
     ```

   - Os dois modos podem ser combinados com `--keep <e-mail>` (repetível), para deixar uma conta de fora. Ex.: desativar todas menos o administrador e o cliente da demonstração, e depois trocar só a senha dessas duas:

     ```sh
     npm run accounts:rotate-seed -- --disable --keep admin@atelierbureau.test --keep cliente.pf@atelierbureau.test
     npm run accounts:rotate-seed -- --keep comercial@atelierbureau.test --keep financeiro@atelierbureau.test --keep solicitante@empresa-ficticia.test --keep aprovador@empresa-ficticia.test
     ```

     Atenção: rodar o modo de troca sem `--keep` gera senhas novas também para as contas desativadas, que voltam a poder entrar.

3. [ ] Tente entrar em `https://<SITE_HOST>/entrar` com a `SEED_PASSWORD` antiga numa conta do seed: o login é recusado.
4. [ ] Apague a `SEED_PASSWORD` do `.env` do servidor (deixe a linha vazia). Rodar o seed de novo não volta a senha antiga: ele só cria a senha de contas que ainda não têm uma.
5. [ ] Ative o 2FA nas contas internas que continuarem em uso (seção 6).
6. [ ] Registre a execução na tabela da seção 12 e na #179.

## 8. Backup e restauração (#81)

- [ ] O container `backup` está `healthy` e há um dump do dia em `./backups` (ou gere um: `docker compose exec backup sh /usr/local/bin/backup.sh`).
- [ ] O teste de restauração foi feito e registrado, dentro do RTO de 4 h, conforme `docs/AtelierBureau_Backup_Restauracao.md` (scripts `deploy/backup/restore.sh` e `restore.ps1`).
- [ ] Cópia fora do servidor do último dump, da pasta `./storage` e do `.env` (com a `DATA_ENCRYPTION_KEY`).

## 9. Monitoramento (#80)

- [ ] Painel de disponibilidade acessível em `https://<SITE_HOST>:3001`, com o usuário administrador criado logo na primeira abertura.
- [ ] Monitores e alerta por e-mail configurados e testados, conforme `docs/AtelierBureau_Monitoramento.md`.

## 10. Pagamento e webhook (opcional)

- [ ] Se o webhook do Mercado Pago for demonstrado: `docker compose --profile tunnel up -d`, `CLOUDFLARE_TUNNEL_TOKEN`, `MERCADOPAGO_NOTIFICATION_URL` e `MERCADOPAGO_WEBHOOK_SECRET` preenchidos. Sem o túnel, a reconciliação a cada 5 minutos confirma os pagamentos.
- [ ] Uma compra de teste com cartão de teste do Mercado Pago termina com o pagamento aprovado.

## 11. Apresentação final

- [ ] Roteiro da demonstração definido: vitrine e busca → produto → carrinho e frete → checkout e pagamento sandbox → pedido B2B com aprovação → backoffice (pedidos, estoque, NF-e em homologação) → painel de disponibilidade.
- [ ] Contas da demonstração com as senhas novas (seção 7) à mão, no gerenciador de senhas.
- [ ] Dispositivos da plateia com o certificado raiz instalado e testados na rede do local.
- [ ] Plano B: dump recente, cópia do `.env` e vídeo curto do fluxo principal, caso a rede do local falhe.
- [ ] Slides e documentação (requisitos, banco de dados, arquitetura) prontos.

## 12. Registro de execução

| Seção | Item | Data | Responsável | Observações |
|---|---|---|---|---|
| 2 | `.env` completo, `DATA_ENCRYPTION_KEY` guardada fora do servidor | | | |
| 3 | `docker compose up -d`, migrations e 20 gatilhos | | | |
| 4 | Firewall (perfil Privado) e certificado raiz nos dispositivos | | | |
| 4 | Acesso HTTPS de outro dispositivo | | | |
| 5 | Decisão sobre `MYSQL_PUBLISH_ADDR` | | | |
| 6 | 2FA nas contas internas | | | |
| 7 | Contas do seed trocadas ou desativadas (#179) | | | |
| 8 | Teste de restauração (tempo medido) | | | |
| 9 | Alerta de monitoramento testado | | | |
| 11 | Apresentação final preparada | | | |
