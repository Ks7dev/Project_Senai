/**
 * Gera o DER, o MER e o dicionário de dados de docs/banco-de-dados a
 * partir do banco criado pelas migrations (information_schema), com as
 * descrições de descriptions.ts. Uso, com o DATABASE_URL de um banco
 * já migrado: `npm run db:docs`.
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../generated/prisma/client"
import { mariaDbConfig } from "../../features/shared/lib/db/connection-config"
import * as d from "./descriptions"

type Column = {
  t: string
  c: string
  type: string
  n: string
  def: string | null
}
type ForeignKey = {
  t: string
  c: string
  rt: string
  rc: string
  del: string
  upd: string
}
type Stat = { t: string; i: string; nu: number; c: string; it: string }
type Trigger = { name: string; t: string; timing: string; ev: string }
type TableInfo = { t: string; eng: string; coll: string }
type Index = {
  t: string
  i: string
  unique: boolean
  type: string
  cols: string[]
}

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")
const database = new URL(url).pathname.slice(1)
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(mariaDbConfig(url)),
})

/**
 * Runs a query on information_schema for the current database.
 *
 * @param sql - Query with one `?` for the schema name.
 * @returns The rows.
 */
async function query<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql, database)
}

const columns = await query<Column>(`SELECT table_name t, column_name c,
  column_type type, is_nullable n, column_default def
  FROM information_schema.columns WHERE table_schema = ?
  AND table_name <> '_prisma_migrations'
  ORDER BY table_name, ordinal_position`)
const fks = await query<ForeignKey>(`SELECT k.table_name t, k.column_name c,
  k.referenced_table_name rt, k.referenced_column_name rc,
  r.delete_rule del, r.update_rule upd
  FROM information_schema.key_column_usage k
  JOIN information_schema.referential_constraints r
    ON r.constraint_name = k.constraint_name
   AND r.constraint_schema = k.table_schema
  WHERE k.table_schema = ? AND k.referenced_table_name IS NOT NULL
  ORDER BY k.table_name, k.column_name`)
const stats = await query<Stat>(`SELECT table_name t, index_name i,
  non_unique nu, column_name c, index_type it
  FROM information_schema.statistics WHERE table_schema = ?
  AND table_name <> '_prisma_migrations'
  ORDER BY table_name, index_name, seq_in_index`)
const triggers = await query<Trigger>(`SELECT trigger_name name,
  event_object_table t, action_timing timing, event_manipulation ev
  FROM information_schema.triggers WHERE trigger_schema = ?
  ORDER BY event_object_table, trigger_name`)
const tableInfo = await query<TableInfo>(`SELECT table_name t, engine eng,
  table_collation coll FROM information_schema.tables
  WHERE table_schema = ? AND table_name <> '_prisma_migrations'`)
await prisma.$disconnect()

/**
 * Groups rows by their table name.
 *
 * @param rows - Rows with a `t` field.
 * @returns Rows by table.
 */
function byTable<T extends { t: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    if (!map.has(row.t)) map.set(row.t, [])
    map.get(row.t)!.push(row)
  }
  return map
}

const colsBy = byTable(columns)
const fksBy = byTable(fks)
const trgBy = byTable(triggers)
const indexes = new Map<string, Index>()
for (const row of stats) {
  const key = `${row.t}.${row.i}`
  if (!indexes.has(key)) {
    indexes.set(key, {
      t: row.t,
      i: row.i,
      unique: !Number(row.nu),
      type: row.it,
      cols: [],
    })
  }
  indexes.get(key)!.cols.push(row.c)
}
const idxBy = byTable([...indexes.values()])
const uniqueSingle = new Set(
  [...indexes.values()]
    .filter((x) => x.unique && x.cols.length === 1)
    .map((x) => `${x.t}.${x.cols[0]}`)
)
const primary = [...indexes.values()].filter((x) => x.i === "PRIMARY")
const pkCols = new Set(primary.flatMap((x) => x.cols.map((c) => `${x.t}.${c}`)))
const singlePk = new Set(
  primary.filter((x) => x.cols.length === 1).map((x) => `${x.t}.${x.cols[0]}`)
)
const fkSet = new Set(fks.map((f) => `${f.t}.${f.c}`))

const allTables = [...colsBy.keys()]
const inDomains = d.domains.flatMap((x) => x.tables)
const missing = allTables.filter((t) => !inDomains.includes(t))
const extra = inDomains.filter((t) => !colsBy.has(t))
if (missing.length || extra.length) {
  throw new Error(`Domains out of date: missing ${missing}, extra ${extra}`)
}

/**
 * Description of a column; fails when it is missing, so a new column
 * cannot reach the dictionary without one.
 *
 * @param t - Table.
 * @param c - Column.
 * @returns The description.
 */
function describe(t: string, c: string): string {
  const text = d.columns[`${t}.${c}`] ?? d.columns[c]
  if (!text) throw new Error(`Missing description: ${t}.${c}`)
  return text
}

/**
 * Domain of a table.
 *
 * @param t - Table.
 * @returns The domain.
 */
function domainOf(t: string) {
  return d.domains.find((x) => x.tables.includes(t))!
}

/**
 * Conceptual entity name of a table.
 *
 * @param t - Table.
 * @returns The entity name.
 */
function entity(t: string): string {
  const info = d.tables[t]
  if (!info) throw new Error(`Missing table description: ${t}`)
  return info[0]
}

/**
 * Keys of a column: PK, FK and UK.
 *
 * @param t - Table.
 * @param c - Column.
 * @returns The key labels.
 */
function keysOf(t: string, c: string): string[] {
  const id = `${t}.${c}`
  const out: string[] = []
  if (pkCols.has(id)) out.push("PK")
  if (fkSet.has(id)) out.push("FK")
  if (uniqueSingle.has(id) && !pkCols.has(id)) out.push("UK")
  return out
}

/**
 * Whether a foreign key column is nullable and whether it points one to
 * one (unique column or single-column primary key).
 *
 * @param f - Foreign key.
 * @returns Optionality and one-to-one flag.
 */
function shape(f: ForeignKey) {
  const id = `${f.t}.${f.c}`
  const nullable = colsBy.get(f.t)!.find((c) => c.c === f.c)!.n === "YES"
  return { nullable, oneToOne: uniqueSingle.has(id) || singlePk.has(id) }
}

const esc = (s: string) => s.replace(/\|/g, "\\|")
const header = (what: string) =>
  `> Gerado por \`npm run db:docs\` a partir do banco criado pelas migrations (\`prisma/migrations\`)${what}. Fonte da verdade: [\`prisma/schema.prisma\`](../../prisma/schema.prisma). Não edite à mão: altere o schema ou \`scripts/db-docs/descriptions.ts\` e gere de novo.`

// ---------- MER (modelo lógico, pé de galinha) ----------
const merType = (type: string) =>
  type.startsWith("enum(")
    ? "enum"
    : type.replace(/[(,]/g, "_").replace(/\)/g, "").replace(/\s+/g, "_")

let mer = `# Atelier Bureau — MER (modelo lógico)

${header("")}

Notação pé de galinha: \`||\` exatamente um, \`|o\` zero ou um, \`o{\` zero ou muitos e \`o|\` zero ou um do lado filho (relação 1:1). O rótulo da linha é a coluna de chave estrangeira. Tipos abreviados: \`varchar_191\` = \`VARCHAR(191)\`, \`decimal_12_2\` = \`DECIMAL(12,2)\` e \`datetime_3\` = \`DATETIME(3)\`.

Tabelas de outros domínios aparecem sem atributos, só para mostrar a ligação. O detalhe de cada coluna está no [dicionário de dados](04-dicionario-de-dados.md).

`
for (const dom of d.domains) {
  mer += `## ${dom.name}\n\n\`\`\`mermaid\nerDiagram\n`
  for (const f of fks.filter((x) => dom.tables.includes(x.t))) {
    const { nullable, oneToOne } = shape(f)
    mer += `  ${f.rt} ${nullable ? "|o" : "||"}--${oneToOne ? "o|" : "o{"} ${f.t} : "${f.c}"\n`
  }
  for (const t of dom.tables) {
    mer += `  ${t} {\n`
    for (const c of colsBy.get(t)!) {
      const k = keysOf(t, c.c)
      mer += `    ${merType(c.type)} ${c.c}${k.length ? " " + k.join(", ") : ""}\n`
    }
    mer += "  }\n"
  }
  mer += "```\n\n"
}

// ---------- DER (modelo conceitual, notação de Chen) ----------
const nodeId = (t: string) => "e_" + t
let der = `# Atelier Bureau — DER (modelo conceitual)

${header(", pelas chaves estrangeiras")}

Notação de Chen: retângulos são entidades, losangos são relacionamentos e o rótulo das linhas é a cardinalidade (1, N ou 0..1 quando a participação é opcional). Entidades com borda tracejada pertencem a outro domínio e aparecem só para mostrar a ligação.

O modelo tem ${allTables.length} entidades, ${fks.length} relacionamentos por chave estrangeira e ${d.domains.length} domínios. Os atributos estão no [MER](03-mer.md) e no [dicionário de dados](04-dicionario-de-dados.md).

## Visão geral dos domínios

| Domínio | Entidades |
|---|---|
${d.domains.map((x) => `| ${x.name} | ${x.tables.map(entity).join(", ")} |`).join("\n")}

`
const cross = new Map<string, number>()
for (const f of fks) {
  const a = domainOf(f.rt).key
  const b = domainOf(f.t).key
  if (a !== b) cross.set(`${a}>${b}`, (cross.get(`${a}>${b}`) ?? 0) + 1)
}
der += "```mermaid\nflowchart LR\n"
for (const x of d.domains) der += `  ${x.key}["${x.name}"]\n`
for (const [key, n] of cross) {
  const [a, b] = key.split(">")
  der += `  ${a} -- "${n} FK" --> ${b}\n`
}
der +=
  "```\n\nA seta vai do domínio referenciado para o domínio que guarda a chave estrangeira.\n\n"

for (const dom of d.domains) {
  der += `## ${dom.name}\n\n\`\`\`mermaid\nflowchart LR\n`
  const rels = fks.filter((f) => dom.tables.includes(f.t))
  const outside = new Set(
    rels.map((f) => f.rt).filter((t) => !dom.tables.includes(t))
  )
  for (const t of dom.tables) der += `  ${nodeId(t)}["${entity(t)}"]\n`
  for (const t of outside) der += `  ${nodeId(t)}["${entity(t)}"]:::ext\n`
  rels.forEach((f, i) => {
    const verb = d.verbs[`${f.t}.${f.c}`] ?? "relaciona"
    const { nullable, oneToOne } = shape(f)
    der += `  r${i}{"${verb}"}\n`
    der += `  ${nodeId(f.rt)} -- "${nullable ? "0..1" : "1"}" --- r${i}\n`
    der += `  r${i} -- "${oneToOne ? "1" : "N"}" --- ${nodeId(f.t)}\n`
  })
  der += "  classDef ext stroke-dasharray: 4 3\n```\n\n"
}

// ---------- Dicionário de dados ----------
/**
 * Default value of a column as shown in the dictionary.
 *
 * @param c - Column.
 * @returns The formatted default.
 */
function fmtDefault(c: Column): string {
  if (c.def === null || c.def === undefined) return c.n === "YES" ? "NULL" : "—"
  let v = String(c.def)
  if (/^'.*'$/.test(v)) v = v.slice(1, -1)
  if (/CURRENT_TIMESTAMP/i.test(v)) return "`CURRENT_TIMESTAMP(3)`"
  if (c.type === "tinyint(1)") return v === "1" ? "`true`" : "`false`"
  return "`" + v + "`"
}

/**
 * SQL type of a column as shown in the dictionary.
 *
 * @param c - Column.
 * @returns The formatted type.
 */
function fmtType(c: Column): string {
  if (c.type.startsWith("enum(")) return "ENUM"
  if (c.type === "tinyint(1)") return "BOOLEAN"
  return c.type.toUpperCase()
}

let indexCount = 0
for (const list of idxBy.values()) indexCount += list.length

let dd = `# Atelier Bureau — Dicionário de dados

${header("")}

Banco **MySQL 8** (InnoDB), charset \`utf8mb4\` e collation \`utf8mb4_0900_ai_ci\` em todas as tabelas. Datas em UTC (\`DATETIME(3)\`) e dinheiro em \`DECIMAL(12,2)\`. Chaves: **PK** primária, **FK** estrangeira e **UK** única. A coluna "Nulo" diz se o campo aceita \`NULL\`.

Totais: ${allTables.length} tabelas, ${columns.length} colunas, ${fks.length} chaves estrangeiras, ${indexCount} índices (contando as chaves primárias) e ${triggers.length} gatilhos.

## Sumário

${d.domains.map((x) => `- **${x.name}:** ${x.tables.map((t) => `[\`${t}\`](#${t})`).join(", ")}`).join("\n")}

`
for (const dom of d.domains) {
  dd += `## ${dom.name}\n\n`
  for (const t of dom.tables) {
    const info = tableInfo.find((x) => x.t === t)!
    if (info.coll !== "utf8mb4_0900_ai_ci" || info.eng !== "InnoDB") {
      throw new Error(`${t} uses ${info.eng} / ${info.coll}`)
    }
    dd += `### ${t}\n\n**Entidade:** ${entity(t)}. ${d.tables[t][1]}\n\n`
    dd +=
      "| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |\n|---|---|---|---|---|---|\n"
    for (const c of colsBy.get(t)!) {
      let desc = describe(t, c.c)
      if (c.type.startsWith("enum(")) {
        const values = c.type
          .slice(5, -1)
          .split(",")
          .map((v) => "`" + v.replace(/'/g, "") + "`")
          .join(", ")
        desc += `. Valores: ${values}`
      }
      const fk = fks.find((f) => f.t === t && f.c === c.c)
      if (fk) desc += `. Referencia \`${fk.rt}.${fk.rc}\``
      dd += `| \`${c.c}\` | ${fmtType(c)} | ${c.n === "YES" ? "Sim" : "Não"} | ${esc(fmtDefault(c))} | ${keysOf(t, c.c).join(", ") || "—"} | ${esc(desc)} |\n`
    }
    const idx = (idxBy.get(t) ?? []).filter((x) => x.i !== "PRIMARY")
    if (idx.length) {
      dd += "\n**Índices**\n\n| Nome | Tipo | Colunas |\n|---|---|---|\n"
      for (const x of idx) {
        const kind =
          x.type === "FULLTEXT" ? "FULLTEXT" : x.unique ? "UNIQUE" : "INDEX"
        dd += `| \`${x.i}\` | ${kind} | ${x.cols.map((c) => "`" + c + "`").join(", ")} |\n`
      }
    }
    const tf = fksBy.get(t) ?? []
    if (tf.length) {
      dd +=
        "\n**Chaves estrangeiras**\n\n| Coluna | Referência | Ao excluir | Ao alterar |\n|---|---|---|---|\n"
      for (const f of tf) {
        dd += `| \`${f.c}\` | \`${f.rt}.${f.rc}\` | ${f.del} | ${f.upd} |\n`
      }
    }
    const tt = trgBy.get(t) ?? []
    if (tt.length) {
      dd +=
        "\n**Gatilhos:** " +
        tt.map((x) => `\`${x.name}\` (${x.timing} ${x.ev})`).join(", ") +
        ". Ver [gatilhos](05-gatilhos.md).\n"
    }
    dd += "\n"
  }
}

// ---------- Script SQL completo ----------
/**
 * Builds the standalone creation script: the final DDL from the Prisma
 * schema plus every trigger of the migrations, wrapped in DELIMITER for
 * the mysql client and MySQL Workbench.
 *
 * @returns The SQL script.
 */
function buildScript(): string {
  const ddl = execSync(
    "npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script",
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  )
  const migrations = path.join(process.cwd(), "prisma", "migrations")
  const triggerSql = fs
    .readdirSync(migrations)
    .sort()
    .map((dir) => path.join(migrations, dir, "migration.sql"))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .flatMap((sql) => sql.match(/CREATE TRIGGER[\s\S]*?\nEND;/g) ?? [])
    // A function, so "$$" is not read as a replacement pattern
    .map((trigger) => trigger.replace(/\nEND;$/, () => "\nEND$$"))
  return `-- Atelier Bureau: script de criação do banco (MySQL 8.4)
-- Gerado por \`npm run db:docs\` a partir de prisma/schema.prisma e dos
-- gatilhos das migrations. Não edite à mão. No servidor, o banco é
-- criado pelas migrations (\`prisma migrate deploy\`); este script serve
-- para estudo, para o MySQL Workbench e para criar um banco avulso:
--   mysql -u root -p < docs/banco-de-dados/06-script.sql
-- Com binlog ligado, o usuário sem SUPER precisa de
-- log_bin_trust_function_creators=1 para criar os gatilhos.

CREATE DATABASE IF NOT EXISTS \`atelier_bureau\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE \`atelier_bureau\`;

-- ================================================================
-- Tabelas, índices e chaves estrangeiras
-- ================================================================
${ddl.trim().replace(/utf8mb4_unicode_ci/g, "utf8mb4_0900_ai_ci")}

-- ================================================================
-- Gatilhos (docs/banco-de-dados/05-gatilhos.md)
-- ================================================================
DELIMITER $$

${triggerSql.join("\n\n")}

DELIMITER ;
`
}

const out = path.join(process.cwd(), "docs", "banco-de-dados")
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "06-script.sql"), buildScript())
fs.writeFileSync(path.join(out, "02-der.md"), der)
fs.writeFileSync(path.join(out, "03-mer.md"), mer)
fs.writeFileSync(path.join(out, "04-dicionario-de-dados.md"), dd)
console.log(
  `${allTables.length} tables, ${columns.length} columns, ${fks.length} foreign keys, ${triggers.length} triggers`
)
