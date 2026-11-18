# Instalação na VPS (Hostinger) — Atelier Bureau

Issue #206 · RNF06, RNF11, RNF16 · fecha a decisão da #180 (certificado de CA pública ao publicar fora da rede local).

Guia para publicar a loja numa VPS na internet, com domínio próprio e HTTPS válido, sem depender de nenhuma máquina local. Usa o mesmo `docker-compose.yml` do servidor local (`ARCHITECTURE.md`, seção 5.1), mais o override `docker-compose.vps.yml`, o `deploy/caddy/Caddyfile.vps` e o `deploy/vps/node-task.sh` (seção 5.2). Depois da instalação, siga o [checklist de lançamento](AtelierBureau_Checklist_Lancamento.md).

> **Continua sendo ambiente de demonstração.** Mercado Pago em sandbox (credenciais `TEST-`), Correios, transportadora e NF-e em homologação, e só dados fictícios. A trava `MERCADOPAGO_ALLOW_PRODUCTION` fica `false`.

## 1. O que contratar

| Item | Recomendação |
|---|---|
| VPS | Hostinger **VPS KVM 2** (2 vCPU, 8 GB de RAM). O KVM 1 fica no limite no build do Next.js. Não use "Hospedagem de Sites" nem "Cloud Hosting": eles não rodam Docker. |
| Sistema | **Ubuntu 24.04 LTS** (o modelo "Ubuntu com Docker" da Hostinger já traz o Docker) |
| Localização | A mais próxima do Brasil que estiver disponível |
| Domínio | Qualquer registrador (ex.: `atelierbureau.com.br`). No guia, `loja.exemplo.com.br` |
| E-mail (SMTP) | Brevo ou Resend, com o domínio verificado. Porta **587** (muitas VPS bloqueiam a 25) |

## 2. DNS

No painel do domínio, crie:

| Tipo | Nome | Valor |
|---|---|---|
| A | o nome do `SITE_HOST`: `@` para o domínio raiz ou o subdomínio da loja (no exemplo, `loja`) | IP da VPS |
| A (opcional) | o nome alternativo, se quiser um (ex.: `www` para `www.exemplo.com.br`, ou `www.loja` para `www.loja.exemplo.com.br`) | IP da VPS |
| TXT / CNAME | os que o provedor de e-mail pedir | SPF, DKIM e DMARC, para os e-mails não caírem no spam |

O nome alternativo só vale se o registro dele existir **e** se ele for posto em `SITE_ALIAS_HOST` no `.env` (passo 5); o Caddy então tira o certificado dele também e redireciona para o `SITE_HOST`. Sem o registro, deixe `SITE_ALIAS_HOST` vazio: senão o Caddy fica tentando o certificado de um nome que não resolve.

Espere o DNS propagar (`nslookup loja.exemplo.com.br` devolve o IP da VPS) antes do passo 6: sem isso o Caddy não consegue o certificado.

## 3. Primeiro acesso e segurança da VPS

No painel da Hostinger, cadastre a sua **chave SSH pública** e entre como `root`:

```bash
ssh root@<ip-da-vps>
```

Atualize o sistema e crie um usuário para o deploy:

```bash
apt update && apt upgrade -y
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
```

Desligue o login por senha e o login do `root` por SSH. Em `/etc/ssh/sshd_config` (e em qualquer arquivo de `/etc/ssh/sshd_config.d/`), deixe:

```
PermitRootLogin no
PasswordAuthentication no
```

```bash
systemctl restart ssh
```

> Teste `ssh deploy@<ip-da-vps>` **numa segunda janela** antes de fechar a sessão do `root`.

Firewall, atualizações automáticas e bloqueio de força bruta:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
apt install -y unattended-upgrades fail2ban
dpkg-reconfigure -plow unattended-upgrades
```

Ative também o **firewall do painel da Hostinger** com as mesmas três portas. O Docker publica portas por fora do `ufw`, por isso o override só publica 80 e 443 em todas as interfaces; MySQL (3306) e Uptime Kuma (3001) ficam presos ao `127.0.0.1` da VPS.

Swap de 2 GB (folga para o build):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Fuso do sistema em UTC (as datas do banco já são UTC):

```bash
timedatectl set-timezone UTC
```

## 4. Docker

Se o modelo da VPS não trouxe o Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Dê ao usuário `deploy` acesso ao Docker e entre de novo com ele:

```bash
usermod -aG docker deploy
```

```bash
ssh deploy@<ip-da-vps>
docker compose version
```

O override usa `!override`, que exige **Docker Compose 2.24 ou mais novo**.

## 5. Código e `.env`

```bash
git clone https://github.com/Ks7dev/Project_Senai.git ~/atelier-bureau
cd ~/atelier-bureau
git checkout master
cp .env.example .env
chmod 600 .env
```

Gere os segredos, um comando por valor, cada um diferente. Para `BETTER_AUTH_SECRET` e `DATA_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

Para as senhas do MySQL e o `SEED_PASSWORD`, use hexadecimal. O base64 pode gerar `/` e `+`, que quebram a URL de conexão montada pelo Compose:

```bash
openssl rand -hex 24
```

Preencha o `.env`:

| Variável | Valor na VPS |
|---|---|
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.vps.yml` (descomente a linha do modelo; faz o `docker compose` carregar o override sozinho) |
| `SITE_HOST` | `loja.exemplo.com.br` (só o domínio, sem `https://`) |
| `ACME_EMAIL` | e-mail que recebe os avisos do Let's Encrypt |
| `SITE_ALIAS_HOST` | opcional: o nome alternativo do passo 2 (ex.: `www.loja.exemplo.com.br`), só se o registro DNS dele já aponta para a VPS. Senão, vazio |
| `BETTER_AUTH_URL` | `https://loja.exemplo.com.br` |
| `BETTER_AUTH_SECRET` | segredo gerado |
| `DATA_ENCRYPTION_KEY` | segredo gerado. **Guarde uma cópia fora da VPS**: sem ela, CPFs e telefones se perdem |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_APP_PASSWORD`, `MYSQL_MIGRATE_PASSWORD`, `MYSQL_BACKUP_PASSWORD` | senhas geradas, todas diferentes |
| `MYSQL_DEV_PASSWORD` | vazio (sem usuário de desenvolvedor na VPS) |
| `MYSQL_PUBLISH_ADDR` | `127.0.0.1` |
| `SEED_PASSWORD` | senha gerada com `openssl rand -hex 24`. **Obrigatória**: vazia, as contas de teste usariam a senha padrão do repositório, que é pública, e por isso o `deploy/vps/node-task.sh` recusa rodar o seed com ela vazia, igual à senha padrão ou com menos de 16 caracteres |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | dados do Brevo ou Resend (porta `587`, `SMTP_SECURE="false"`) |
| `EMAIL_FROM` | `Atelier Bureau <nao-responda@loja.exemplo.com.br>` |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` | credenciais `TEST-` |
| `MERCADOPAGO_ALLOW_PRODUCTION` | `false` |
| `MERCADOPAGO_NOTIFICATION_URL` | `https://loja.exemplo.com.br/api/webhooks/mercadopago` |
| `MERCADOPAGO_WEBHOOK_SECRET` | chave secreta do webhook (painel do Mercado Pago) |
| `CORREIOS_*`, `CARRIER_API_*`, `NFE_API_*` | credenciais de homologação |
| `CLOUDFLARE_TUNNEL_TOKEN` | vazio (o túnel não é usado na VPS) |
| `LOG_LEVEL` | `info` |

`DATABASE_URL` e `MIGRATION_DATABASE_URL` podem ficar como no exemplo: o `docker-compose.yml` sobrescreve as duas para o app com o host `db`, e o `deploy/vps/node-task.sh` faz o mesmo para o seed e a rotação. O MySQL recusa conexão TCP sem TLS (`--require-secure-transport=ON`, #221), por isso a URL de migração leva `?sslaccept=accept_invalid_certs` e `DATABASE_TLS` não pode ser `disabled`.

## 6. Subir

```bash
docker compose up -d --build
docker compose ps
```

O primeiro build leva alguns minutos. Na subida, o app aplica as migrations sozinho (`deploy/app/entrypoint.sh`), inclusive os 20 gatilhos. Quando todos os serviços estiverem `healthy`:

```bash
curl -s https://loja.exemplo.com.br/api/health
```

A resposta esperada é `{"status":"ok"}`. Se o certificado falhar, veja `docker compose logs proxy` (quase sempre é DNS ainda não propagado ou porta 80 fechada).

## 7. Seed e contas fictícias

O seed grava os valores das regras de negócio, os perfis e permissões, o catálogo e as contas de teste. Sem ele a loja não funciona. A VPS não tem Node e a imagem do app não tem o `tsx`, então o `deploy/vps/node-task.sh` roda o comando num container Node temporário, na rede interna do Compose, com o banco em `db` (o resto vem do `.env`). Cada execução instala as dependências antes e leva alguns minutos.

Seed, uma vez, com o banco novo. O script para antes de rodar se a `SEED_PASSWORD` do `.env` estiver vazia, for a senha padrão do repositório ou tiver menos de 16 caracteres. As senhas do banco chegam ao container por um arquivo temporário (permissão 600), não pela linha de comando:

```bash
sh deploy/vps/node-task.sh npm run db:seed
```

**A rotação é obrigatória, logo depois do seed** (#179, PCI 2.2.2): a `SEED_PASSWORD` fica no `.env` e não pode continuar valendo enquanto o site estiver na internet. Detalhes e combinações (`--keep`) na seção 7 do [checklist de lançamento](AtelierBureau_Checklist_Lancamento.md). O `--dry-run` só mostra o que vai mudar e **não troca nada**:

```bash
sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --dry-run
```

Depois, rode a troca de verdade. Para trocar a senha das contas usadas na apresentação:

```bash
sh deploy/vps/node-task.sh npm run accounts:rotate-seed
```

As novas senhas aparecem **uma única vez** no terminal: guarde-as no gerenciador de senhas da equipe na hora. Para desativar as contas que não serão usadas (a senha é trocada por uma aleatória e descartada):

```bash
sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --disable
```

Por fim:

1. Confira que a `SEED_PASSWORD` antiga é recusada em `https://<domínio>/entrar`.
2. Apague a `SEED_PASSWORD` do `.env` (deixe a linha vazia). Rodar o seed de novo exigiria uma senha nova, e ele não volta a senha das contas que já têm uma.
3. Entre com a conta administrativa (`admin@atelierbureau.test`) e ative o 2FA antes de usar `/admin`.

## 8. Painel de monitoramento (Uptime Kuma)

O painel só escuta no `127.0.0.1` da VPS. Abra um túnel SSH a partir do seu computador:

```bash
ssh -L 3001:127.0.0.1:3001 deploy@<ip-da-vps>
```

E acesse `http://localhost:3001`. Crie o administrador **logo no primeiro acesso** e cadastre os monitores de `docs/AtelierBureau_Monitoramento.md`, trocando o alvo "HTTPS pela rede" por `https://loja.exemplo.com.br/api/health` (sem "Ignorar erro de TLS": o certificado agora é válido). Configure o alerta por e-mail com o mesmo SMTP.

Para ver o banco com um cliente SQL do seu computador, use o mesmo esquema: `ssh -L 3306:127.0.0.1:3306 deploy@<ip-da-vps>` e conecte em `localhost:3306` com um usuário do banco, **com TLS ligado no cliente** (o MySQL recusa conexão TCP sem TLS, #221).

## 9. Mercado Pago

No painel de desenvolvedor do Mercado Pago (aplicação de teste), em **Webhooks**:

- URL: `https://loja.exemplo.com.br/api/webhooks/mercadopago`
- Evento: **Pagamentos**
- Copie a chave secreta para `MERCADOPAGO_WEBHOOK_SECRET` e rode `docker compose up -d` de novo.

## 10. Backup fora da VPS

O container `backup` grava o dump diário em `~/atelier-bureau/backups`, **dentro da VPS**. Se a VPS for perdida, o backup vai junto. Use as duas camadas:

1. **Backup da Hostinger:** ative os backups automáticos e tire um **snapshot** antes de cada atualização.
2. **Cópia diária para outro lugar** com `rclone` (Google Drive, OneDrive, S3 etc.):

```bash
sudo apt install -y rclone
rclone config
```

Crie um remoto (ex.: `drive`) e agende a cópia uma hora depois do dump (`BACKUP_HOUR="03"`, UTC):

```bash
crontab -e
```

```
0 4 * * * rclone copy /home/deploy/atelier-bureau/backups drive:atelier-bureau-backups --max-age 48h
```

A restauração segue `docs/AtelierBureau_Backup_Restauracao.md` (`deploy/backup/restore.sh`).

## 11. Atualizar a loja

```bash
cd ~/atelier-bureau
git pull
docker compose up -d --build
docker image prune -f
```

As migrations novas rodam sozinhas na subida do app. Tire um snapshot na Hostinger antes de atualizar uma versão com mudança de schema.

## 12. Checklist final

- [ ] `https://loja.exemplo.com.br` abre com cadeado válido e `http://` redireciona para `https://`, inclusive `http://<ip-da-vps>`
- [ ] `sh deploy/check-headers.sh loja.exemplo.com.br --system-ca` sai sem erro (sem o `--system-ca`, uma máquina com o `deploy/certs/root.crt` da CA local tenta conferir o certificado Let's Encrypt com ela e falha)
- [ ] `/api/health` responde `{"status":"ok"}`
- [ ] `docker compose ps` mostra todos os serviços `healthy`
- [ ] Portas abertas para fora só 22, 80 e 443 (`nmap <ip-da-vps>` de outra rede)
- [ ] Login com senha e do `root` desligados no SSH
- [ ] Seed rodado com `SEED_PASSWORD` próprio, contas fictícias trocadas ou desativadas com `accounts:rotate-seed` (não só o `--dry-run`) e `SEED_PASSWORD` apagada do `.env` (#179)
- [ ] E-mail de recuperação de senha chega na caixa de entrada (não no spam)
- [ ] Pagamento de teste aprovado no sandbox e pedido confirmado pelo webhook
- [ ] Uptime Kuma com administrador criado, monitores e alerta por e-mail
- [ ] Backup copiado para fora da VPS e `DATA_ENCRYPTION_KEY` guardada no gerenciador de senhas
- [ ] Rodapé avisa que é um projeto acadêmico de demonstração (sem dados reais, LGPD)
