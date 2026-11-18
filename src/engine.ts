/** An ISO 3166-1 alpha-2 code in upper case, like "SA" or "GB". */
type CountryCode = string

/** What a phone engine makes of the text in the field. */
type PhoneSnapshot = {
  /** The text the field shows. Holds the same digits as the input, in order. */
  text: string
  /** E.164, like "+966512345678". Partial while typing, "" without digits. */
  value: string
  /** The number's country, or null while it can't be told. */
  country: CountryCode | null
  /** The digits after the calling code, without a national prefix. */
  national: string
  /** Whether the number is complete and valid for its country. */
  valid: boolean
  /** Whether the number already has more digits than its country allows. */
  tooLong: boolean
}

/**
 * Formats and validates phone numbers. The phone input takes one as an option,
 * so the data behind it can load after the page does.
 */
interface PhoneEngine {
  /** Every country the engine knows. */
  readonly countries: readonly CountryCode[]
  /** A country's calling code without the plus, like "966". */
  callingCode(country: CountryCode): string
  /**
   * Formats typed text. `input` holds ASCII digits and an optional leading "+".
   * A leading "+" means an international number; anything else is read as a
   * national number of `country`.
   */
  format(input: string, country: CountryCode | null): PhoneSnapshot
  /** A national number to show as a placeholder. */
  example?(country: CountryCode): string | undefined
}

const ZERO = 48
const ARABIC_INDIC_ZERO = 0x0660
const PERSIAN_ZERO = 0x06f0

/** The ASCII digit a character stands for, or undefined. Reads Arabic-Indic and Persian digits. */
function toDigit(char: string): string | undefined {
  const code = char.charCodeAt(0)
  if (code >= ZERO && code <= ZERO + 9) return char
  if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
    return String(code - ARABIC_INDIC_ZERO)
  }
  if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
    return String(code - PERSIAN_ZERO)
  }
  return undefined
}

/**
 * The characters of `text` that are part of a number: its digits, as ASCII,
 * and a "+" when it comes before every digit.
 */
function significant(text: string): string {
  let out = ""
  for (const char of text) {
    const digit = toDigit(char)
    if (digit !== undefined) out += digit
    else if (char === "+" && out === "") out = "+"
  }
  return out
}

/** Used until an engine is passed: keeps the digits and knows nothing else. */
const plainEngine: PhoneEngine = {
  countries: [],
  callingCode: () => "",
  format: (input, country) => ({
    text: input,
    value: input.startsWith("+") && input.length > 1 ? input : "",
    country,
    national: input.startsWith("+") ? "" : input,
    valid: false,
    tooLong: false,
  }),
}

/** A country's flag as an emoji, from its two letters. */
function flagOf(country: CountryCode): string {
  if (!/^[A-Za-z]{2}$/.test(country)) return ""
  const base = 0x1f1e6 - 65
  const upper = country.toUpperCase()
  return String.fromCodePoint(
    base + upper.charCodeAt(0),
    base + upper.charCodeAt(1)
  )
}

type CountryOption = {
  /** The country code, like "SA". */
  value: CountryCode
  /** The country's name in the requested language. */
  label: string
  /** The calling code without the plus, like "966". */
  callingCode: string
  /** The flag as an emoji. */
  flag: string
  /** More words a search should match: the code and the calling code. */
  keywords: string[]
}

/**
 * The engine's countries as options for a list, named and sorted in `locale`.
 * Names come from the browser's `Intl.DisplayNames`, so no name data ships.
 */
function countryOptions(
  engine: PhoneEngine,
  locale?: string | string[]
): CountryOption[] {
  let names: Intl.DisplayNames | undefined
  try {
    names = new Intl.DisplayNames(locale, { type: "region" })
  } catch {
    names = undefined
  }
  const options = engine.countries.map((country) => {
    const callingCode = engine.callingCode(country)
    let label = country
    try {
      label = names?.of(country) ?? country
    } catch {
      label = country
    }
    return {
      value: country,
      label,
      callingCode,
      flag: flagOf(country),
      keywords: [country, callingCode, `+${callingCode}`],
    }
  })
  const collator = new Intl.Collator(locale)
  return options.sort((a, b) => collator.compare(a.label, b.label))
}

export {
  countryOptions,
  flagOf,
  plainEngine,
  significant,
  toDigit,
  type CountryCode,
  type CountryOption,
  type PhoneEngine,
  type PhoneSnapshot,
}
