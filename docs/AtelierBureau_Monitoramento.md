# Monitoramento de disponibilidade e alertas — Atelier Bureau

Issue #80 · RNF01 (disponibilidade) e RNF16 (servidor). Complementa as seções 5.1 (servidor local) e 5.2 (VPS de entrega, #206) do `ARCHITECTURE.md`.

## 1. Visão geral

O monitoramento tem três camadas:

| Camada | O que faz | Onde |
|---|---|---|
| Healthcheck e `restart: unless-stopped` | Todo container tem um healthcheck e volta sozinho se o processo cair ou a máquina reiniciar | `docker-compose.yml` |
| Rota de saúde | `GET /api/health` roda `SELECT 1` no MySQL e responde `200 {"status":"ok"}` ou `503 {"status":"unavailable"}`, sem detalhe interno | `app/api/health/route.ts` |
| Painel e alertas | Uptime Kuma checa o site, o app e o banco a cada minuto, guarda o histórico de disponibilidade e manda e-mail quando algo cai | serviço `uptime-kuma`: na VPS, `http://localhost:3001` por túnel SSH; no servidor local, `https://<SITE_HOST>:3001` |

### Healthcheck de cada container

| Serviço | Healthcheck |
|---|---|
| `proxy` | API de administração do Caddy em `127.0.0.1:2019` |
| `app` | `wget http://127.0.0.1:3000/api/health` (também consulta o banco) |
| `db` | `mysqladmin ping` |
| `backup` | `backup.sh --health`: o laço diário está vivo e o último backup não falhou |
| `uptime-kuma` | requisição HTTP local na porta 3001 |
| `webhook-gate` (perfil `tunnel`, só no servidor local) | listener local `127.0.0.1:8081`, fora do alcance do túnel |
| `tunnel` (perfil `tunnel`, só no servidor local) | `cloudflared tunnel ready`, que pergunta ao servidor de métricas se o túnel está conectado |

> O `restart: unless-stopped` reinicia o container quando o processo termina, mas o Docker **não** reinicia um container só por ele estar `unhealthy`. Quem avisa nesse caso é o alerta do Uptime Kuma. Para ver o estado: `docker compose ps` (coluna `STATUS`).

## 2. Acesso ao painel

### Na VPS (entrega)

- O `docker-compose.vps.yml` publica a 3001 só no `127.0.0.1` da VPS, e o Caddy da VPS não serve o painel. Abra um túnel SSH a partir do seu computador e acesse `http://localhost:3001`:

  ```bash
  ssh -L 3001:127.0.0.1:3001 deploy@<ip-da-vps>
  ```

- **Primeiro acesso:** crie o usuário administrador logo depois do `docker compose up -d`, com uma senha forte guardada no gerenciador de senhas da equipe.

### No servidor local

- Endereço: `https://<SITE_HOST>:3001` (ex.: `https://192.168.0.50:3001`). Usa o mesmo certificado raiz do site (`deploy/certs/root.crt`).
- O Caddy só deixa passar endereços privados (rede local). Qualquer outro cliente tem a conexão encerrada.
- Libere a porta **3001** no Firewall do Windows **só no perfil Privado**, como as portas 80 e 443.
- **Primeiro acesso:** o Uptime Kuma pede para criar o usuário administrador. Faça isso logo depois do `docker compose up -d`, a partir da máquina servidora, com uma senha forte guardada no gerenciador de senhas da equipe. Até lá, qualquer pessoa da rede poderia criar esse usuário.
- Os dados do painel (monitores, histórico e usuário) ficam no volume `uptime-kuma-data`.

## 3. Monitores a cadastrar

No painel, **Adicionar novo monitor**:

| Nome | Tipo | Alvo | Intervalo | Tentativas antes do alerta |
|---|---|---|---|---|
| Loja — app e banco | HTTP(s) | `http://app:3000/api/health` | 60 s | 2 |
| Loja — HTTPS pela rede | HTTP(s) | `https://<SITE_HOST>/api/health`. Na VPS, o domínio, com o certificado válido. No servidor local, o IP fixo da máquina, com **Ignorar erro de TLS** marcado (o certificado é da CA local) | 60 s | 2 |
| MySQL | TCP Port | host `db`, porta `3306` | 60 s | 2 |
| Backup diário | Push | copie a URL gerada para `BACKUP_PUSH_URL` (ver abaixo) | 90000 s (25 h) | 1 |

O monitor **Backup diário** é passivo: o container `backup` chama a URL depois de cada backup completo. Se passar 25 horas sem chamada (backup falhou ou o container parou), o alerta dispara.

1. Crie o monitor do tipo **Push** e copie a URL. Troque o host público pelo nome interno: `http://uptime-kuma:3001/api/push/<token>?status=up&msg=OK`.
2. Cole no `.env` do servidor: `BACKUP_PUSH_URL="http://uptime-kuma:3001/api/push/<token>?status=up&msg=OK"`.
3. `docker compose up -d backup` para o container ler a variável.
4. Se a imagem do MySQL não tiver `curl`, o log do backup mostra `curl not found, monitor push skipped` e o monitor Push fica vermelho. Nesse caso, apague o monitor Push e acompanhe o backup pelo healthcheck do container (`docker compose ps backup`).

## 4. Alerta por e-mail

O alerta usa o mesmo SMTP do e-mail transacional (`SMTP_*` no `.env`, RF53).

1. No painel: **Configurações → Notificações → Configurar notificação**.
2. Tipo: **Email (SMTP)**.
3. Preencha com os valores do `.env`:
   - Hostname: `SMTP_HOST`
   - Porta: `SMTP_PORT`
   - Segurança: `SSL/TLS` se `SMTP_SECURE="true"` (porta 465); senão `STARTTLS`
   - Usuário e senha: `SMTP_USER` e `SMTP_PASSWORD`
   - Remetente: `EMAIL_FROM`
   - Destinatário: e-mail da equipe responsável pelo servidor
4. Marque **Padrão habilitado** e **Aplicar em todos os monitores existentes**.
5. Clique em **Testar** e confira se o e-mail chegou. Depois, **Salvar**.

Sem SMTP configurado, use outro canal suportado pelo Uptime Kuma (ex.: Telegram ou Discord), seguindo o mesmo caminho.

## 5. Teste do alerta (roteiro)

Feito por uma pessoa no servidor, com o `docker compose up -d` rodando:

| Passo | Comando ou ação | Resultado esperado |
|---|---|---|
| 1 | `docker compose ps` | Todos os serviços `healthy` |
| 2 | Abrir o painel (na VPS, pelo túnel SSH; no servidor local, `https://<SITE_HOST>:3001` de outro dispositivo da rede) | Painel abre com os monitores verdes |
| 3 | `docker compose stop app` | Em até 2 min, monitores "Loja" vermelhos e e-mail de alerta recebido |
| 4 | `docker compose start app` | Monitores voltam a verde e chega o e-mail de recuperação |
| 5 | `docker compose stop db` | `/api/health` responde 503; monitores "Loja — app e banco" e "MySQL" vermelhos e e-mail recebido |
| 6 | `docker compose start db` | Tudo verde de novo |

| Data | Responsável | Tempo até o e-mail de alerta | Observações |
|---|---|---|---|
| | | | |

## 6. Painel de disponibilidade

- O painel principal mostra o histórico de cada monitor (24 h, 30 dias) e a porcentagem de disponibilidade.
- Opcional: **Status Pages → Nova página de status** com os monitores "Loja" para mostrar a disponibilidade na apresentação final. A página também fica fechada como o painel (túnel SSH na VPS, rede local no servidor local). Para mostrá-la na apresentação, abra pelo túnel no notebook da apresentação.
