import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  validatePhoneNumberLength,
  type CountryCode as LibCountryCode,
  type Examples,
} from "libphonenumber-js"
import type { PhoneEngine } from "../engine"

/**
 * A phone engine backed by libphonenumber-js. Import this module with
 * `import()` to keep its metadata out of the first bundle.
 *
 * Pass `examples` from "libphonenumber-js/mobile/examples" for placeholders.
 */
function createLibphonenumberEngine(options?: {
  examples?: Examples
}): PhoneEngine {
  const countries = getCountries()
  const known = new Set<string>(countries)
  const isKnown = (country: string | null): country is LibCountryCode =>
    country !== null && known.has(country)

  return {
    countries,
    callingCode: (country) =>
      isKnown(country) ? getCountryCallingCode(country) : "",
    format(input, country) {
      const fallback = isKnown(country) ? country : undefined
      const typer = new AsYouType(fallback)
      let text = typer.input(input)
      const number = typer.getNumber()
      const international = input.startsWith("+")
      // A national number typed without its national prefix, like
      // "512345678" for "0512345678", comes back unformatted. Its
      // international format without the calling code has the same digits.
      if (!international && fallback && text === input && input.length > 3) {
        const prefix = `+${getCountryCallingCode(fallback)}`
        const spaced = new AsYouType().input(prefix + input)
        const rest = spaced.startsWith(`${prefix} `)
          ? spaced.slice(prefix.length + 1)
          : ""
        if (rest.replace(/\D/g, "") === input) {
          text = rest
        }
      }
      const tooLong =
        input !== "" &&
        input !== "+" &&
        validatePhoneNumberLength(input, fallback) === "TOO_LONG"
      return {
        text,
        value: number?.number ?? "",
        country: typer.getCountry() ?? (international ? null : country),
        national: typer.getNationalNumber(),
        valid: typer.isValid(),
        tooLong,
      }
    },
    example(country) {
      if (!options?.examples || !isKnown(country)) return undefined
      return getExampleNumber(country, options.examples)?.formatNational()
    },
  }
}

export { createLibphonenumberEngine }
