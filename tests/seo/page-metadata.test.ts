import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const STORE = join(process.cwd(), "app", "(store)")

/**
 * Lists the page files under a folder.
 *
 * @param dir - Folder.
 * @returns Page file paths.
 */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pages(path)
    return name === "page.tsx" ? [path] : []
  })
}

describe("public page metadata (#31)", () => {
  // The customer area is behind login and noindex (conta/layout.tsx)
  const publicPages = pages(STORE).filter(
    (path) => !path.includes(join("(store)", "conta"))
  )

  it("finds the public pages", () => {
    expect(publicPages.length).toBeGreaterThan(10)
  })

  it.each(publicPages.map((path) => [path.slice(STORE.length), path]))(
    "%s sets a title and a description",
    (_name, path) => {
      const source = readFileSync(path, "utf8")
      expect(source).toMatch(/\btitle\b/)
      expect(source).toMatch(/\bdescription\b/)
    }
  )
})
