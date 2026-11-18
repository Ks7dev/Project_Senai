# Backup e restauração — Atelier Bureau

Issue #81 · RNF11 (backup diário, retenção de 30 dias e restauração testada) e RNF16 (servidor local). Complementa a seção 5.1 do `ARCHITECTURE.md`.

**Objetivo de tempo de recuperação (RTO): 4 horas**, contadas da decisão de restaurar até a loja voltar a atender pela rede.

## 1. Como o backup funciona

- O container `backup` (`deploy/backup/backup.sh --daemon`) roda `mysqldump` uma vez por dia, na hora UTC de `BACKUP_HOUR` (padrão `03`, meia-noite em Brasília).
- O dump inclui tabelas, dados, gatilhos e rotinas do banco `atelier_bureau`, com `--single-transaction` (sem travar a loja).
- Os arquivos ficam em `./backups/atelier_bureau-AAAAMMDD-HHMMSS.sql.gz`, na máquina servidora. Os mais velhos que `BACKUP_RETENTION_DAYS` (padrão 30) são apagados.
- **O que não está no dump:** os usuários do MySQL e as permissões (recriados pelo `deploy/mysql/init/01-users.sh` num volume novo), os arquivos enviados em `./storage` e a `DATA_ENCRYPTION_KEY`.

### Backup manual (a qualquer hora)

```sh
docker compose exec backup sh /usr/local/bin/backup.sh
```

### Cópia fora do servidor

O backup só em `./backups` não protege contra a perda da máquina. Uma vez por semana, e antes da apresentação final, copie para um disco externo ou para o drive da equipe:

- a pasta `./backups` (pelo menos o dump mais recente);
- a pasta `./storage` (imagens de produtos, fichas técnicas e anexos);
- o `.env` do servidor, num local protegido. **Sem a mesma `DATA_ENCRYPTION_KEY`, os CPFs e telefones do dump não podem ser lidos (RNF03).**

## 2. Antes de restaurar

1. Confirme que a restauração é necessária (dados apagados ou corrompidos, banco que não sobe, máquina perdida). Anote a hora: é o início da contagem do RTO.
2. Escolha o dump. Para listar:
   - Linux, macOS ou Git Bash: `sh deploy/backup/restore.sh`
   - Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File deploy\backup\restore.ps1`
3. Os pedidos e cadastros feitos **depois** do dump escolhido se perdem. O script faz antes um dump de segurança do estado atual, que fica em `./backups` e pode ser consultado depois.

## 3. Restauração passo a passo

### 3.1 Servidor funcionando, banco com problema

1. Na pasta do projeto, na máquina servidora, com `docker compose up -d` rodando:

   ```sh
   sh deploy/backup/restore.sh latest
   # ou um arquivo específico:
   sh deploy/backup/restore.sh backups/atelier_bureau-20261116-030000.sql.gz
   ```

   No Windows: `powershell -ExecutionPolicy Bypass -File deploy\backup\restore.ps1 latest`.

2. O script mostra o dump e o banco de destino e pede para **digitar o nome do banco** (`atelier_bureau`) para confirmar. Qualquer outra resposta cancela sem mudar nada.
3. Ele então, nesta ordem:
   1. copia o dump para o container `db` e confere se o `gzip` é válido e se o dump terminou (`-- Dump completed`). Um dump incompleto é recusado antes de qualquer mudança;
   2. faz o dump de segurança do estado atual (pule com `--no-safety-backup` / `-NoSafetyBackup` se o banco nem responde);
   3. para o `app`;
   4. apaga e recria o banco `atelier_bureau` (`utf8mb4`) e importa o dump como `root`, dentro do container (a senha não sai do container);
   5. mostra o número de tabelas, de gatilhos e a última migration;
   6. sobe o `app` de novo. Ao iniciar, o app roda `prisma migrate deploy` e aplica as migrations mais novas que o dump.
4. Ao final, o script mostra o tempo gasto. Registre-o na tabela da seção 5.
5. Confira:
   - `docker compose ps`: `app` e `db` como `healthy`;
   - `https://<SITE_HOST>/api/health` responde `{"status":"ok",...}`;
   - entre com uma conta de teste e abra **Minha conta → Pedidos** e o backoffice de pedidos.

### 3.2 Máquina perdida (servidor novo)

1. Instale o Docker Desktop e o Git, e clone o repositório na branch `master`.
2. Restaure o `.env` guardado fora do servidor (mesma `DATA_ENCRYPTION_KEY` e mesmas senhas do MySQL). Ajuste `SITE_HOST` e `LAN_SUBNET` se o IP mudou.
3. Copie os dumps para `./backups` e os arquivos para `./storage`.
4. `docker compose up -d` e espere tudo ficar `healthy` (o app cria o banco vazio com as migrations).
5. Siga a seção 3.1 a partir do passo 1.
6. Refaça o que é da máquina: firewall no perfil Privado, certificado raiz nos dispositivos (`deploy/export-root-cert.ps1`) e o painel de monitoramento.

### Estimativa do RTO

| Etapa | Tempo estimado |
|---|---|
| Diagnóstico e decisão | até 30 min |
| Servidor novo (só no cenário 3.2) | até 2 h |
| Restauração do dump (base acadêmica, poucos MB) | até 15 min |
| Conferência e liberação | até 30 min |
| **Total** | **até 3 h 15 min**, dentro das 4 h |

## 4. Roteiro do teste de restauração

O teste usa um banco separado, `atelier_bureau_restore_test`, para não parar a loja. Faça uma vez antes da entrega e depois de mudanças grandes no schema.

1. Gere um dump novo: `docker compose exec backup sh /usr/local/bin/backup.sh`.
2. Inicie o cronômetro e restaure no banco de teste:

   ```sh
   sh deploy/backup/restore.sh --target atelier_bureau_restore_test latest
   ```

   No Windows: `... restore.ps1 latest -Target atelier_bureau_restore_test`.

3. Compare a contagem de linhas das tabelas principais nos dois bancos:

   ```sh
   docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "
     SELECT \"producao\" AS banco,
       (SELECT COUNT(*) FROM atelier_bureau.users) AS usuarios,
       (SELECT COUNT(*) FROM atelier_bureau.products) AS produtos,
       (SELECT COUNT(*) FROM atelier_bureau.orders) AS pedidos
     UNION ALL
     SELECT \"restaurado\",
       (SELECT COUNT(*) FROM atelier_bureau_restore_test.users),
       (SELECT COUNT(*) FROM atelier_bureau_restore_test.products),
       (SELECT COUNT(*) FROM atelier_bureau_restore_test.orders);"'
   ```

   As duas linhas devem ter os mesmos números (salvo pedidos criados depois do dump). O resumo do script deve mostrar o mesmo número de tabelas e gatilhos do banco de produção.

4. Pare o cronômetro e registre na tabela abaixo.
5. Apague o banco de teste:

   ```sh
   docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE atelier_bureau_restore_test;"'
   ```

6. Opcional, fora do horário da apresentação: restaure por cima do `atelier_bureau` (seção 3.1) e cronometre também, para medir o tempo com a parada do app.

## 5. Registro dos testes

| Data | Responsável | Dump usado | Banco de destino | Tempo medido | Dentro do RTO (4 h)? | Observações |
|---|---|---|---|---|---|---|
| 17/11/2026 | Equipe de desenvolvimento (#81) | `atelier_bureau-20261117-232936.sql.gz` (25 KB) | `atelier_bureau_restore_test`, com `restore.ps1 latest -Target ... -Yes` | 12 s | Sim | Esquema idêntico (53 tabelas, 20 gatilhos). As contagens batem com as linhas gravadas até o dump. O banco temporário foi apagado depois do teste. No Git Bash, `docker compose exec backup sh /usr/local/bin/backup.sh` precisa de `MSYS_NO_PATHCONV=1`. |
