import { expect, test, type Locator, type Page } from "@playwright/test"

/** Fictitious customer created by prisma/seed.ts. */
const CUSTOMER_EMAIL = "cliente.pf@atelierbureau.test"
const CUSTOMER_PASSWORD = process.env.SEED_PASSWORD ?? "atelier-demo-2026"
/** Published product of the seed with stock and no installation. */
const PRODUCT_SLUG = "caneta-tinteiro-heritage"
const PRODUCT_NAME = /Caneta tinteiro/i
/** Fictitious address inside the own delivery region of the seed (SP). */
const ADDRESS = {
  recipient: "Cliente Pessoa Física",
  cep: "01310-100",
  street: "Avenida Paulista",
  number: "1000",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP",
}

/**
 * Signs in with the seed customer through the login form.
 *
 * @param page - Browser page.
 * @param redirect - Path to land on after the login.
 */
async function signIn(page: Page, redirect: string) {
  await page.goto(`/entrar?redirect=${encodeURIComponent(redirect)}`)
  await page.getByLabel("E-mail").fill(CUSTOMER_EMAIL)
  await page.getByLabel("Senha").fill(CUSTOMER_PASSWORD)
  await page.getByRole("button", { name: "Entrar" }).click()
  await page.waitForURL((url) => url.pathname === redirect)
}

/**
 * Saves a delivery address for the customer, with a unique nickname so
 * reruns do not depend on the previous state.
 *
 * @param page - Browser page, signed in.
 * @param label - Address nickname.
 */
async function addAddress(page: Page, label: string) {
  await page.goto("/conta/enderecos")
  await page.getByRole("button", { name: "Adicionar endereço" }).click()
  await page.getByLabel("Apelido").fill(label)
  await page.getByLabel("Quem recebe").fill(ADDRESS.recipient)
  await page.getByLabel("CEP").fill(ADDRESS.cep)
  // The CEP lookup may fill the fields; the values below always win
  await page.getByLabel("Rua").fill(ADDRESS.street)
  await page.getByLabel("Número").fill(ADDRESS.number)
  await page.getByLabel("Bairro").fill(ADDRESS.district)
  await page.getByLabel("Cidade").fill(ADDRESS.city)
  await page.getByLabel("Estado").selectOption(ADDRESS.state)
  await page.getByRole("button", { name: "Salvar endereço" }).click()
  await expect(page.getByText(label)).toBeVisible()
}

/**
 * Presses Tab until the element has the focus, as a keyboard user does.
 *
 * @param page - Browser page.
 * @param target - Element to reach.
 * @param limit - Most Tab presses before giving up.
 */
async function tabTo(page: Page, target: Locator, limit = 120) {
  for (let i = 0; i < limit; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press("Tab")
  }
  await expect(target).toBeFocused()
}

/**
 * Checks a radio with the keyboard only: Tab reaches its group, then the
 * arrow keys move the choice, as in a native radio group.
 *
 * @param page - Browser page.
 * @param radio - Radio to check.
 */
async function chooseRadio(page: Page, radio: Locator) {
  const name = await radio.getAttribute("name")
  for (let i = 0; i < 120; i++) {
    const inGroup = await page.evaluate(
      (group) =>
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.type === "radio" &&
        document.activeElement.name === group,
      name
    )
    if (inGroup) break
    await page.keyboard.press("Tab")
  }
  if (await radio.evaluate((el) => el === document.activeElement)) {
    await page.keyboard.press("Space")
  }
  for (let i = 0; i < 60 && !(await radio.isChecked()); i++) {
    await page.keyboard.press("ArrowDown")
  }
  await expect(radio).toBeChecked()
}

test.describe("purchase flow (RNF07, #77)", () => {
  test("customer finds a product, adds it to the cart and places the order", async ({
    page,
  }) => {
    const label = `E2E ${Date.now()}`
    await signIn(page, "/conta")
    await addAddress(page, label)

    // Catalog: search finds the product and leads to its page
    await page.goto("/busca?q=caneta")
    await page.getByRole("link", { name: PRODUCT_NAME }).first().click()
    await expect(page).toHaveURL(new RegExp(`/produto/${PRODUCT_SLUG}$`))
    await expect(
      page.getByRole("heading", { level: 1, name: PRODUCT_NAME })
    ).toBeVisible()

    // Cart
    await page.getByRole("button", { name: /^(Comprar|Encomendar)$/ }).click()
    await page.waitForURL("**/carrinho")
    await expect(page.getByRole("link", { name: PRODUCT_NAME })).toBeVisible()
    await page.getByRole("link", { name: "Finalizar compra" }).click()
    await page.waitForURL("**/checkout")

    // Checkout: address, shipping (quoted or manual quote, RN20), payment
    await page.getByRole("radio", { name: new RegExp(label) }).check()
    const confirm = page.getByRole("button", { name: "Confirmar pedido" })
    // Enabled once the shipping quote of the address is back
    await expect(confirm).toBeEnabled({ timeout: 30_000 })
    await page.getByRole("radio", { name: /Pix/ }).check()
    await confirm.click()

    // The order is created: payment page, or the order list while the
    // shipping waits for the manual quote of the sales team (RN20)
    await page.waitForURL(/\/conta\/pedidos(\/[^/]+\/pagamento)?$/, {
      timeout: 30_000,
    })
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  })

  test("the whole purchase flow works with the keyboard only (RNF13, #20)", async ({
    page,
  }) => {
    // Setup: the signed-in customer with a delivery address
    const label = `E2E teclado ${Date.now()}`
    await signIn(page, "/conta")
    await addAddress(page, label)

    // Product page: skip link, then Tab to the buy button
    await page.goto(`/produto/${PRODUCT_SLUG}`)
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" })
    await expect(skip).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.locator("main#conteudo")).toBeFocused()
    await tabTo(
      page,
      page.getByRole("button", { name: /^(Comprar|Encomendar)$/ })
    )
    await page.keyboard.press("Enter")
    await page.waitForURL("**/carrinho")

    // Cart: Tab to checkout
    await tabTo(page, page.getByRole("link", { name: "Finalizar compra" }))
    await page.keyboard.press("Enter")
    await page.waitForURL("**/checkout")

    // Checkout: address and payment chosen with the arrow keys
    await chooseRadio(
      page,
      page.getByRole("radio", { name: new RegExp(label) })
    )
    const confirm = page.getByRole("button", { name: "Confirmar pedido" })
    await expect(confirm).toBeEnabled({ timeout: 30_000 })
    await chooseRadio(page, page.getByRole("radio", { name: /Pix/ }))
    await tabTo(page, confirm)
    await page.keyboard.press("Enter")

    await page.waitForURL(/\/conta\/pedidos(\/[^/]+\/pagamento)?$/, {
      timeout: 30_000,
    })
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  })
})
