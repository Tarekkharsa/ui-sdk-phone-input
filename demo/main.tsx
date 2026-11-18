import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/react/combobox"
import * as React from "react"
import { createRoot } from "react-dom/client"
import { countryOptions, type PhoneEngine } from "../src/engine"
import {
  PhoneInput,
  PhoneInputCountry,
  PhoneInputDialCode,
  PhoneInputField,
} from "../src/react/phone-input"
import "./styles.css"

/** Loads the engine after the page, so its data stays out of the first bundle. */
function useEngine() {
  const [engine, setEngine] = React.useState<PhoneEngine>()
  React.useEffect(() => {
    let live = true
    void Promise.all([
      import("../src/engines/libphonenumber"),
      import("libphonenumber-js/mobile/examples"),
    ]).then(([module, examples]) => {
      if (live) {
        setEngine(
          module.createLibphonenumberEngine({ examples: examples.default })
        )
      }
    })
    return () => {
      live = false
    }
  }, [])
  return engine
}

type Copy = {
  locale: string
  dir: "ltr" | "rtl"
  heading: string
  label: string
  country: string
  search: string
  empty: string
  submit: string
  reset: string
  message: string
  submitted: string
}

const english: Copy = {
  locale: "en",
  dir: "ltr",
  heading: "English, left to right",
  label: "Phone number",
  country: "Country",
  search: "Search countries",
  empty: "No countries found.",
  submit: "Save",
  reset: "Reset",
  message: "Enter a valid phone number.",
  submitted: "Submitted",
}

const arabic: Copy = {
  locale: "ar",
  dir: "rtl",
  heading: "العربية، من اليمين إلى اليسار",
  label: "رقم الهاتف",
  country: "الدولة",
  search: "ابحث عن دولة",
  empty: "لا توجد نتائج.",
  submit: "حفظ",
  reset: "إعادة ضبط",
  message: "أدخل رقم هاتف صحيحًا.",
  submitted: "تم الإرسال",
}

function PhoneForm({
  copy,
  engine,
  defaultCountry,
  id,
}: {
  copy: Copy
  engine: PhoneEngine | undefined
  defaultCountry: string
  id: string
}) {
  const [group, setGroup] = React.useState<HTMLDivElement | null>(null)
  const [submitted, setSubmitted] = React.useState("")
  const [live, setLive] = React.useState("")
  const [country, setCountry] = React.useState<string | null>(defaultCountry)
  const options = React.useMemo(
    () => (engine ? countryOptions(engine, copy.locale) : []),
    [engine, copy.locale]
  )
  const labels = React.useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options]
  )

  return (
    <section lang={copy.locale} dir={copy.dir} data-testid={id}>
      <h2>{copy.heading}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          setSubmitted(String(data.get("phone") ?? ""))
        }}
        onReset={() => setSubmitted("")}
      >
        <label htmlFor={`${id}-field`}>{copy.label}</label>
        <PhoneInput
          ref={setGroup}
          name="phone"
          required
          engine={engine}
          defaultCountry={defaultCountry}
          validationMessage={copy.message}
          onValueChange={setLive}
          onCountryChange={setCountry}
          className="phone"
          aria-label={copy.label}
        >
          <PhoneInputCountry
            itemToLabel={(value) => labels.get(value) ?? value}
          >
            {(state) => (
              <>
                <ComboboxTrigger aria-label={copy.country} className="country">
                  <span aria-hidden="true">{state.flag}</span>
                  <PhoneInputDialCode />
                </ComboboxTrigger>
                <ComboboxContent anchor={group} align="start" className="list">
                  <ComboboxInput
                    autoFocus
                    aria-label={copy.search}
                    placeholder={copy.search}
                    className="search"
                  />
                  <ComboboxEmpty className="empty">{copy.empty}</ComboboxEmpty>
                  <ComboboxList className="options">
                    {options.map((option) => (
                      <ComboboxItem
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        keywords={option.keywords}
                        className="option"
                      >
                        <span aria-hidden="true">{option.flag}</span>
                        <span className="name">{option.label}</span>
                        <span dir="ltr" className="code">
                          +{option.callingCode}
                        </span>
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </>
            )}
          </PhoneInputCountry>
          <PhoneInputField
            id={`${id}-field`}
            className="field"
            placeholder={(country && engine?.example?.(country)) || undefined}
          />
        </PhoneInput>
        <div className="actions">
          <button type="submit">{copy.submit}</button>
          <button type="reset">{copy.reset}</button>
        </div>
        <dl>
          <dt>onValueChange</dt>
          <dd dir="ltr" data-testid={`${id}-live`}>
            {live}
          </dd>
          <dt>{copy.submitted}</dt>
          <dd dir="ltr" data-testid={`${id}-submitted`}>
            {submitted}
          </dd>
        </dl>
      </form>
    </section>
  )
}

/** The app owns the value and the country, and changes both from outside. */
function ControlledForm({ engine }: { engine: PhoneEngine | undefined }) {
  const [value, setValue] = React.useState("+966512345678")
  const [country, setCountry] = React.useState<string | null>("SA")
  const [disabled, setDisabled] = React.useState(false)
  return (
    <section data-testid="controlled">
      <h2>Controlled from the app</h2>
      <label htmlFor="controlled-field">Phone number</label>
      <PhoneInput
        engine={engine}
        value={value}
        onValueChange={setValue}
        country={country}
        onCountryChange={setCountry}
        disabled={disabled}
        className="phone"
        aria-label="Phone number"
      >
        <span className="country static">
          <PhoneInputDialCode />
        </span>
        <PhoneInputField id="controlled-field" className="field" />
      </PhoneInput>
      <div className="actions">
        <button type="button" onClick={() => setValue("+14155552671")}>
          Set a US number
        </button>
        <button type="button" onClick={() => setCountry("GB")}>
          Set country to GB
        </button>
        <button type="button" onClick={() => setDisabled((on) => !on)}>
          Toggle disabled
        </button>
      </div>
      <dl>
        <dt>value</dt>
        <dd data-testid="controlled-value">{value}</dd>
        <dt>country</dt>
        <dd data-testid="controlled-country">{country}</dd>
      </dl>
    </section>
  )
}

function App() {
  const engine = useEngine()
  return (
    <main>
      <h1>Phone Input</h1>
      <p className="lede">
        A prototype built on UI SDK primitives. The value is always E.164.
      </p>
      <PhoneForm copy={english} engine={engine} defaultCountry="US" id="en" />
      <PhoneForm copy={arabic} engine={engine} defaultCountry="SA" id="ar" />
      <ControlledForm engine={engine} />
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
