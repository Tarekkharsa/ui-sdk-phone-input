// Drives the demo in a real browser. Start it first with `pnpm dev`.
import assert from "node:assert/strict"
import { chromium } from "playwright"

const url = process.env.DEMO_URL ?? "http://localhost:5199/"
const shots = process.env.SHOTS_DIR

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 520, height: 900 } })
const errors = []
page.on("pageerror", (error) => errors.push(String(error)))
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    errors.push(`${message.type()}: ${message.text()}`)
  }
})

const results = []
async function check(name, run) {
  try {
    await run()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) })
  }
}

const digits = (text) => text.replace(/[^\d+]/g, "")

await page.goto(url)
await page.waitForSelector('[data-testid="en"] [data-slot="phone-input"]')
await page.waitForFunction(
  () => !document.querySelector('[data-slot="phone-input"][data-loading]')
)

function form(id) {
  const section = page.locator(`[data-testid="${id}"]`)
  return {
    section,
    root: section.locator('[data-slot="phone-input"]'),
    field: section.locator(`#${id}-field`),
    trigger: section.locator(".country"),
    live: section.locator(`[data-testid="${id}-live"]`),
    submitted: section.locator(`[data-testid="${id}-submitted"]`),
    submit: section.locator('button[type="submit"]'),
    reset: section.locator('button[type="reset"]'),
    hidden: section.locator('input[type="hidden"][name="phone"]'),
  }
}

const en = form("en")
const ar = form("ar")

await check("formats a national number while typing", async () => {
  await en.field.click()
  await page.keyboard.type("2025551234")
  assert.equal(await en.field.inputValue(), "(202) 555-1234")
  assert.equal(await en.live.textContent(), "+12025551234")
  assert.equal(await en.hidden.inputValue(), "+12025551234")
  assert.equal(await en.root.getAttribute("data-valid"), "")
})

await check("keeps the caret at the end while separators appear", async () => {
  const caret = await en.field.evaluate((el) => el.selectionStart)
  assert.equal(caret, "(202) 555-1234".length)
})

await check("Backspace over a separator deletes the digit before it", async () => {
  // Caret after ") ", then Backspace: the "2" before the bracket goes.
  await en.field.evaluate((el) => el.setSelectionRange(6, 6))
  await page.keyboard.press("Backspace")
  const value = await en.field.inputValue()
  const caret = await en.field.evaluate((el) => el.selectionStart)
  assert.equal(digits(value), "205551234")
  assert.equal(digits(value.slice(0, caret)), "20")
})

await check("typing in the middle keeps the caret after the new digit", async () => {
  await page.keyboard.type("2")
  const value = await en.field.inputValue()
  const caret = await en.field.evaluate((el) => el.selectionStart)
  assert.equal(value, "(202) 555-1234")
  assert.equal(digits(value.slice(0, caret)), "202")
})

await check("refuses a key past the longest number", async () => {
  await page.keyboard.press("End")
  await page.keyboard.type("9")
  assert.equal(await en.field.inputValue(), "(202) 555-1234")
})

await check("a typed calling code changes the country", async () => {
  await en.field.fill("")
  await page.keyboard.type("+442079460958")
  assert.equal(await en.field.inputValue(), "+44 20 7946 0958")
  assert.equal(await en.root.getAttribute("data-country"), "GB")
  assert.equal((await en.trigger.textContent()).includes("+44"), true)
})

await check("submits the E.164 value", async () => {
  await en.submit.click()
  assert.equal(await en.submitted.textContent(), "+442079460958")
})

await check("a form reset empties the field and restores the country", async () => {
  await en.reset.click()
  await page.waitForFunction(
    () => document.querySelector("#en-field").value === ""
  )
  assert.equal(await en.root.getAttribute("data-country"), "US")
  assert.equal(await en.hidden.inputValue(), "")
})

await check("blocks submission of an invalid number with the given message", async () => {
  await en.field.click()
  await page.keyboard.type("202")
  await en.submit.click()
  const message = await en.field.evaluate((el) => el.validationMessage)
  assert.equal(message, "Enter a valid phone number.")
  assert.equal(await en.submitted.textContent(), "")
})

await check("choosing a country reformats the digits and returns focus", async () => {
  await en.field.fill("")
  await page.keyboard.type("512345678")
  await en.trigger.click()
  await page.keyboard.type("966")
  await page.keyboard.press("Enter")
  await page.waitForFunction(
    () => document.activeElement?.id === "en-field"
  )
  assert.equal(await en.root.getAttribute("data-country"), "SA")
  assert.equal(await en.field.inputValue(), "51 234 5678")
  assert.equal(await en.live.textContent(), "+966512345678")
})

await check("opening the country list doesn't mark the number invalid", async () => {
  // A reset makes the field untouched again.
  await en.reset.click()
  await page.waitForFunction(
    () => document.querySelector("#en-field").value === ""
  )
  await en.field.click()
  await page.keyboard.type("20")
  await en.trigger.click()
  await page.waitForSelector('[role="listbox"]')
  const invalid = await en.root.getAttribute("data-invalid")
  await page.keyboard.press("Escape")
  await page.waitForSelector('[role="listbox"]', { state: "detached" })
  assert.equal(invalid, null)
  await en.submit.focus()
  assert.equal(await en.root.getAttribute("data-invalid"), "")
  assert.equal(await en.field.getAttribute("aria-invalid"), "true")
})

await check("the field stays left to right on a right-to-left page", async () => {
  await ar.field.click()
  await page.keyboard.type("0512345678")
  assert.equal(await ar.field.inputValue(), "051 234 5678")
  const direction = await ar.field.evaluate(
    (el) => getComputedStyle(el).direction
  )
  assert.equal(direction, "ltr")
  assert.equal(
    await ar.section.evaluate((el) => getComputedStyle(el).direction),
    "rtl"
  )
})

await check("the dial code reads +966, not 966+", async () => {
  const code = ar.section.locator('[data-slot="phone-input-dial-code"]')
  assert.equal(await code.textContent(), "+966")
  assert.equal(await code.evaluate((el) => getComputedStyle(el).direction), "ltr")
})

await check("reads digits typed on an Arabic keyboard", async () => {
  await ar.field.fill("")
  await page.keyboard.insertText("٠")
  await page.keyboard.insertText("٥")
  await page.keyboard.insertText("١")
  await page.keyboard.insertText("٢")
  assert.equal(await ar.field.inputValue(), "051 2")
  assert.equal(await ar.live.textContent(), "+966512")
})

await check("names countries in Arabic and finds them by calling code", async () => {
  await ar.trigger.click()
  await page.keyboard.type("971")
  const first = page.locator('[role="option"]:visible').first()
  assert.match(await first.textContent(), /الإمارات/)
  if (shots) await page.screenshot({ path: `${shots}/ar-open.png` })
  await page.keyboard.press("Escape")
})

const controlled = {
  section: page.locator('[data-testid="controlled"]'),
  root: page.locator('[data-testid="controlled"] [data-slot="phone-input"]'),
  field: page.locator("#controlled-field"),
  code: page.locator(
    '[data-testid="controlled"] [data-slot="phone-input-dial-code"]'
  ),
  value: page.locator('[data-testid="controlled-value"]'),
  country: page.locator('[data-testid="controlled-country"]'),
  button: (name) =>
    page.locator('[data-testid="controlled"] button', { hasText: name }),
}

await check("shows a controlled value as its national number", async () => {
  assert.equal(await controlled.field.inputValue(), "51 234 5678")
  assert.equal(await controlled.code.textContent(), "+966")
  assert.equal(await controlled.root.getAttribute("data-valid"), "")
})

await check("typing reports the new value to the app", async () => {
  await controlled.field.click()
  await page.keyboard.press("End")
  await page.keyboard.press("Backspace")
  assert.equal(await controlled.value.textContent(), "+96651234567")
  assert.equal(await controlled.field.inputValue(), "51 234 567")
})

await check("a value set by the app replaces the text and asks for its country", async () => {
  await controlled.button("Set a US number").click()
  await page.waitForFunction(
    () => document.querySelector("#controlled-field").value === "(415) 555-2671"
  )
  assert.equal(await controlled.country.textContent(), "US")
  assert.equal(await controlled.code.textContent(), "+1")
  assert.equal(await controlled.value.textContent(), "+14155552671")
})

await check("a country set by the app reads the same digits as its own", async () => {
  await controlled.button("Set country to GB").click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="controlled-value"]').textContent ===
      "+444155552671"
  )
  assert.equal(await controlled.code.textContent(), "+44")
  assert.equal(await controlled.country.textContent(), "GB")
})

await check("disabled blocks typing", async () => {
  await controlled.button("Toggle disabled").click()
  assert.equal(await controlled.field.isDisabled(), true)
  assert.equal(await controlled.root.getAttribute("data-disabled"), "")
  await controlled.button("Toggle disabled").click()
  assert.equal(await controlled.field.isDisabled(), false)
})

await check("exposes a group and a named country button to assistive tech", async () => {
  assert.equal(await en.root.getAttribute("role"), "group")
  assert.equal(await en.trigger.getAttribute("aria-label"), "Country")
  assert.equal(await en.field.getAttribute("type"), "tel")
  assert.equal(await en.field.getAttribute("autocomplete"), "tel")
})

if (shots) await page.screenshot({ path: `${shots}/page.png`, fullPage: true })

await browser.close()

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}`)
  if (!result.ok) console.log(`      ${result.error.split("\n").join("\n      ")}`)
}
if (errors.length) {
  console.log("\nBrowser console:")
  for (const error of [...new Set(errors)]) console.log(`  ${error}`)
}
const failed = results.filter((result) => !result.ok).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed || errors.length ? 1 : 0)
