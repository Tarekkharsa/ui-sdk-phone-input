import { describe, expect, it } from "vitest"
import { applyEdit, caretAfter } from "../src/edit"
import { countryOptions, flagOf, plainEngine, significant } from "../src/engine"
import { createLibphonenumberEngine } from "../src/engines/libphonenumber"

const engine = createLibphonenumberEngine()

/** Types `text` at the end of `previous`, one edit, like a paste or a key. */
function type(previous: string, added: string, country: string | null) {
  const text = previous + added
  return applyEdit(engine, country, {
    text,
    caret: text.length,
    previous,
    inputType: "insertText",
  })
}

describe("significant", () => {
  it("keeps digits and a leading plus", () => {
    expect(significant("+966 (51) 234-5678")).toBe("+966512345678")
    expect(significant("051 234 5678")).toBe("0512345678")
  })

  it("drops a plus that follows a digit", () => {
    expect(significant("1+2")).toBe("12")
  })

  it("reads Arabic-Indic and Persian digits", () => {
    expect(significant("٠٥١٢٣٤٥٦٧٨")).toBe("0512345678")
    expect(significant("۰۹۱۲")).toBe("0912")
  })
})

describe("caretAfter", () => {
  it("lands just after the digit, before a separator", () => {
    expect(caretAfter("051 234 5678", 3)).toBe(3)
    expect(caretAfter("051 234 5678", 4)).toBe(5)
  })

  it("lands at the end once every digit is counted", () => {
    expect(caretAfter("(202)", 3)).toBe(5)
  })

  it("counts a leading plus", () => {
    expect(caretAfter("+44 20", 1)).toBe(1)
    expect(caretAfter("+44 20", 3)).toBe(3)
  })
})

describe("applyEdit", () => {
  it("formats a national number as it is typed", () => {
    const result = type("051 234 567", "8", "SA")
    expect(result.text).toBe("051 234 5678")
    expect(result.value).toBe("+966512345678")
    expect(result.valid).toBe(true)
    expect(result.caret).toBe(12)
  })

  it("keeps the caret among the digits when a separator appears before it", () => {
    // "051" with the caret at the end; typing "2" adds a space before it.
    const result = type("051", "2", "SA")
    expect(result.text).toBe("051 2")
    expect(result.caret).toBe(5)
  })

  it("keeps the caret in place for an edit in the middle", () => {
    // "051 234 5678" with "9" typed after "05".
    const result = applyEdit(engine, "SA", {
      text: "059 234 567",
      caret: 3,
      previous: "05 234 567",
      inputType: "insertText",
    })
    expect(significant(result.text)).toBe("059234567")
    expect(significant(result.text.slice(0, result.caret))).toBe("059")
  })

  it("deletes the digit before a separator on Backspace", () => {
    // The caret sat after the space in "051 234"; Backspace removed the space.
    const result = applyEdit(engine, "SA", {
      text: "051234",
      caret: 3,
      previous: "051 234",
      inputType: "deleteContentBackward",
    })
    expect(significant(result.text)).toBe("05234")
    expect(significant(result.text.slice(0, result.caret))).toBe("05")
  })

  it("deletes the digit after a separator on Delete", () => {
    const result = applyEdit(engine, "SA", {
      text: "051234",
      caret: 3,
      previous: "051 234",
      inputType: "deleteContentForward",
    })
    expect(significant(result.text)).toBe("05134")
    expect(significant(result.text.slice(0, result.caret))).toBe("051")
  })

  it("formats a national number typed without its national prefix", () => {
    const result = type("", "512345678", "SA")
    expect(result.text).toBe("51 234 5678")
    expect(result.value).toBe("+966512345678")
    expect(result.valid).toBe(true)
  })

  it("finds the country of a pasted international number", () => {
    const result = type("", "+44 20 7946 0958", "SA")
    expect(result.country).toBe("GB")
    expect(result.value).toBe("+442079460958")
    expect(result.valid).toBe(true)
  })

  it("reads digits typed on an Arabic keyboard", () => {
    const result = type("", "٠٥١٢٣٤٥٦٧٨", "SA")
    expect(result.text).toBe("051 234 5678")
    expect(result.value).toBe("+966512345678")
  })

  it("refuses a key past the longest number of the country", () => {
    // Saudi numbers have up to ten national digits.
    const longest = engine.format("05123456789", "SA")
    expect(longest.tooLong).toBe(false)
    const result = type(longest.text, "9", "SA")
    expect(result.refused).toBe(true)
    expect(result.text).toBe(longest.text)
    expect(result.caret).toBe(longest.text.length)
  })

  it("lets a too-long paste through rather than dropping it", () => {
    // Nothing shorter to go back to, so the text is kept for the user to fix.
    const result = type("", "0512345678999", "SA")
    expect(result.refused).toBe(false)
    expect(result.valid).toBe(false)
  })

  it("empties the value with the text", () => {
    const result = applyEdit(engine, "SA", {
      text: "",
      caret: 0,
      previous: "0",
      inputType: "deleteContentBackward",
    })
    expect(result.text).toBe("")
    expect(result.value).toBe("")
  })
})

describe("plainEngine", () => {
  it("keeps the digits while the real engine loads", () => {
    const result = applyEdit(plainEngine, "SA", {
      text: "0512",
      caret: 4,
      previous: "051",
      inputType: "insertText",
    })
    expect(result.text).toBe("0512")
    expect(result.country).toBe("SA")
    expect(result.valid).toBe(false)
  })
})

describe("countryOptions", () => {
  it("names countries in the requested language", () => {
    const english = countryOptions(engine, "en")
    const arabic = countryOptions(engine, "ar")
    expect(english.find((option) => option.value === "SA")?.label).toBe(
      "Saudi Arabia"
    )
    expect(arabic.find((option) => option.value === "SA")?.label).toBe(
      "المملكة العربية السعودية"
    )
  })

  it("lets a search match the calling code", () => {
    const option = countryOptions(engine, "en").find(
      (entry) => entry.value === "SA"
    )
    expect(option?.keywords).toEqual(["SA", "966", "+966"])
    expect(option?.flag).toBe(flagOf("SA"))
  })
})
