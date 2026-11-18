import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildContentSecurityPolicy,
  securityHeaders,
} from "@/features/shared/lib/security/headers"

describe("Content-Security-Policy (#11)", () => {
  const production = buildContentSecurityPolicy(false)

  it("blocks plugins, framing and foreign form targets", () => {
    expect(production).toContain("object-src 'none'")
    expect(production).toContain("frame-ancestors 'none'")
    expect(production).toContain("form-action 'self'")
    expect(production).toContain("base-uri 'self'")
  })

  it("allows the Mercado Pago SDK and upgrades insecure requests", () => {
    expect(production).toContain("https://sdk.mercadopago.com")
    expect(production).toContain("upgrade-insecure-requests")
  })

  it("lists only concrete Mercado Pago hosts, without wildcards (#174)", () => {
    expect(production).not.toContain("*")
    for (const host of [
      "https://http2.mlstatic.com",
      "https://api.mercadopago.com",
      "https://secure-fields.mercadopago.com",
    ]) {
      expect(production).toContain(host)
    }
  })

  it("only allows eval in development", () => {
    expect(production).not.toContain("'unsafe-eval'")
    expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'")
  })

  it("sends nosniff and denies framing", () => {
    const headers = Object.fromEntries(
      securityHeaders().map((h) => [h.key, h.value])
    )
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["X-Frame-Options"]).toBe("DENY")
  })
})

describe("local server configuration (#7, #11)", () => {
  const caddy = readFileSync(
    join(process.cwd(), "deploy/caddy/Caddyfile"),
    "utf8"
  )
  const compose = readFileSync(
    join(process.cwd(), "docker-compose.yml"),
    "utf8"
  )
  const users = readFileSync(
    join(process.cwd(), "deploy/mysql/init/01-users.sh"),
    "utf8"
  )

  it("uses a local CA and sends HSTS", () => {
    expect(caddy).toContain("tls internal")
    expect(caddy).toMatch(/Strict-Transport-Security "max-age=31536000/)
  })

  it("only redirects port 80 to HTTPS, for every host (RNF06)", () => {
    const httpSite = caddy.match(/^http:\/\/ \{\n([\s\S]*?)^\}/m)
    expect(httpSite).not.toBeNull()
    expect(httpSite![1].trim()).toBe("redir https://{host}{uri} 308")
    expect(caddy).not.toMatch(/^http:\/\/\S/m)
  })

  it("hides the server technology", () => {
    expect(caddy).toContain("-Server")
    expect(caddy).toContain("-X-Powered-By")
  })

  it("ships the root certificate export and the header check", () => {
    for (const file of [
      "deploy/export-root-cert.sh",
      "deploy/export-root-cert.ps1",
    ]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toContain(
        "/data/caddy/pki/authorities/local/root.crt"
      )
    }
    const check = readFileSync(
      join(process.cwd(), "deploy/check-headers.sh"),
      "utf8"
    )
    for (const header of [
      "Strict-Transport-Security",
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]) {
      expect(check).toContain(header)
    }
  })

  it("starts proxy, app, db and backup", () => {
    for (const service of ["proxy:", "app:", "db:", "backup:"]) {
      expect(compose).toContain(`  ${service}`)
    }
    expect(compose).toContain("image: mysql:8.4")
  })

  it("keeps root local and gives the app user no DDL", () => {
    expect(compose).toContain("MYSQL_ROOT_HOST: localhost")
    expect(users).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON atelier_bureau\.\* TO 'atelier_app'/
    )
    expect(users).toMatch(/'dev'@'\$\{LAN_SUBNET\}'.*REQUIRE SSL/)
  })
})

describe("public VPS configuration (#206)", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8")
  const caddy = read("deploy/caddy/Caddyfile.vps")
  const override = read("docker-compose.vps.yml")
  const nodeTask = read("deploy/vps/node-task.sh")

  it("redirects port 80 to the HTTPS domain for every host (RNF06)", () => {
    const httpSite = caddy.match(/^http:\/\/ \{\n([\s\S]*?)^\}/m)
    expect(httpSite).not.toBeNull()
    expect(httpSite![1].trim()).toBe("redir https://{$SITE_HOST}{uri} 308")
    expect(caddy).toMatch(/Strict-Transport-Security "max-age=31536000/)
    expect(caddy).toContain("-Server")
  })

  it("only adds the alias host when it is configured", () => {
    expect(caddy).not.toMatch(/^www\./m)
    expect(caddy).toContain("{$SITE_HOST} {$SITE_ALIAS_HOST} {")
    expect(override).toContain("SITE_ALIAS_HOST: ${SITE_ALIAS_HOST:-}")
  })

  it("keeps MySQL and the uptime panel on the loopback", () => {
    expect(override).toContain('"127.0.0.1:3306:3306"')
    expect(override).toContain('"127.0.0.1:3001:3001"')
    expect(override).not.toMatch(/"3001:3001"/)
  })

  it("refuses to seed without a strong SEED_PASSWORD", () => {
    expect(nodeTask).toContain('"${SEED_PASSWORD:?')
    expect(nodeTask).toContain('"${#SEED_PASSWORD}" -lt 16')
    expect(nodeTask).toContain("atelier-demo-2026")
  })

  it("keeps the database passwords off the docker command line", () => {
    expect(nodeTask).not.toMatch(/^\s*-e /m)
    expect(nodeTask).toContain("sslaccept=accept_invalid_certs")
  })
})
