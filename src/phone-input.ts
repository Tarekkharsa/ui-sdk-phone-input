import {
  createChange,
  definePrimitive,
  type ChangeDetails,
} from "@ui-sdk/core"
import { applyEdit } from "./edit"
import {
  flagOf,
  plainEngine,
  significant,
  type CountryCode,
  type PhoneEngine,
  type PhoneSnapshot,
} from "./engine"

type PhoneValueChangeReason =
  | "input-change"
  | "item-press"
  | "reset"
  | "imperative"

type PhoneCountryChangeReason = "input-change" | "item-press" | "imperative"

type PhoneInputOptions = {
  /** The number as E.164, like "+966512345678". Pass it to control the field. */
  value?: string
  /** The number at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: string
  /** Runs when typing, choosing a country or a reset wants to change the number. */
  onValueChange?: (
    value: string,
    details: ChangeDetails<PhoneValueChangeReason>
  ) => void
  /** The selected country. Pass it to control it. */
  country?: CountryCode | null
  /** The country selected at first, when uncontrolled. */
  defaultCountry?: CountryCode | null
  /** Runs when a typed calling code or the country list wants to change the country. */
  onCountryChange?: (
    country: CountryCode | null,
    details: ChangeDetails<PhoneCountryChangeReason>
  ) => void
  /**
   * Formats and validates the number. Until one is passed, the field keeps
   * the typed digits as they are, so the engine can load after the page.
   */
  engine?: PhoneEngine
  /** The name the E.164 value submits under. Without one, nothing is submitted. */
  name?: string
  /** The id of a form to belong to, when the field isn't inside it. */
  form?: string
  /** Blocks form submission until there is a number. */
  required?: boolean
  /** Disables the field and leaves it out of the submission. */
  disabled?: boolean
  /** Keeps the field focusable and submitted, but stops changes. */
  readOnly?: boolean
  /**
   * What the browser says when a form is submitted with a number that isn't
   * valid. Set it in the page's language. An empty string turns the check off.
   */
  validationMessage?: string
}

type PhoneInputState = {
  value: string
  country: CountryCode | null
  text: string
  valid: boolean
  touched: boolean
  ready: boolean
  name: string | undefined
  form: string | undefined
  required: boolean
  disabled: boolean
  readOnly: boolean
}

const DEFAULT_MESSAGE = "Enter a valid phone number."

function settings(options: PhoneInputOptions) {
  return {
    ready: options.engine !== undefined,
    name: options.name,
    form: options.form,
    required: !!options.required,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
  }
}

function initial(options: PhoneInputOptions): PhoneInputState {
  const engine = options.engine ?? plainEngine
  const country =
    options.country !== undefined
      ? options.country
      : (options.defaultCountry ?? null)
  const value = options.value ?? options.defaultValue ?? ""
  const snapshot = engine.format(significant(value), country)
  return {
    value: snapshot.value || value,
    country: snapshot.country ?? country,
    text: displayOf(engine, snapshot, country),
    valid: snapshot.valid,
    touched: false,
    ...settings(options),
  }
}

/**
 * A value set from outside arrives as E.164. With its country selected, the
 * field shows the national number, since the calling code sits beside it.
 */
function displayOf(
  engine: PhoneEngine,
  snapshot: PhoneSnapshot,
  selected: CountryCode | null
): string {
  const country = snapshot.country ?? selected
  if (!country || !snapshot.national || !snapshot.value.startsWith("+")) {
    return snapshot.text
  }
  const national = engine.format(snapshot.national, country)
  return national.value === snapshot.value ? national.text : snapshot.text
}

const phoneInput = definePrimitive({
  name: "phone-input",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    country: "string",
    defaultCountry: "string",
    onCountryChange: "callback",
    engine: "value",
    name: "string",
    form: "string",
    required: "boolean",
    disabled: "boolean",
    readOnly: "boolean",
    validationMessage: "string",
  },
  controlled: ["value", "country"],
  state: (options: PhoneInputOptions): PhoneInputState => initial(options),
  sync: (options) => ({
    ...settings(options),
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.country === undefined ? {} : { country: options.country }),
  }),
  api: (context) => {
    const change = createChange(context)
    const engine = () => context.options().engine ?? plainEngine
    const field = () =>
      context.element("input") as HTMLInputElement | null | undefined

    // What the field's text was last derived from, to tell an outside change
    // of the value, the country or the engine from an echo of our own.
    let shown = {
      value: context.store.get().value,
      country: context.store.get().country,
      engine: context.options().engine,
    }

    function show(text: string, caret?: number) {
      const el = field()
      if (!el) return
      if (el.value !== text) el.value = text
      if (caret !== undefined && el.ownerDocument.activeElement === el) {
        el.setSelectionRange(caret, caret)
      }
    }

    function isControlled(key: "value" | "country") {
      return context.options()[key] !== undefined
    }

    /**
     * Asks for the snapshot's country and value, then shows its text. Returns
     * false when the value's callback canceled the change.
     */
    function commit(
      snapshot: PhoneSnapshot,
      text: string,
      reason: PhoneValueChangeReason,
      event?: Event,
      caret?: number
    ): boolean {
      const state = context.store.get()
      const country = snapshot.country
      if (country !== null && country !== state.country) {
        change("country", country, {
          reason: reason === "reset" ? "imperative" : reason,
          event,
        })
      }
      if (snapshot.value !== state.value) {
        const accepted = change("value", snapshot.value, { reason, event })
        if (!accepted) {
          show(state.text)
          return false
        }
      }
      const next = context.store.get()
      shown = {
        value: isControlled("value") ? snapshot.value : next.value,
        country: next.country,
        engine: context.options().engine,
      }
      context.store.set({ text, valid: snapshot.valid })
      show(text, caret)
      return true
    }

    // Whether the text came from typing. Typed text keeps the form it was
    // typed in; text derived from a value shows the national number.
    let edited = false

    context.onOptions((options) => {
      const state = context.store.get()
      const value = options.value ?? state.value
      const country =
        options.country !== undefined ? options.country : state.country
      const valueChanged = value !== shown.value
      const countryChanged = country !== shown.country
      if (!valueChanged && !countryChanged && options.engine === shown.engine) {
        return
      }
      const current = options.engine ?? plainEngine
      const previous = shown.engine ?? plainEngine
      let snapshot: PhoneSnapshot
      let text: string
      let moved: CountryCode | null = null

      if (valueChanged) {
        // A value from outside replaces the text.
        snapshot = current.format(significant(value), country)
        edited = false
        if (snapshot.country !== null && snapshot.country !== country) {
          moved = snapshot.country
        }
        text =
          moved && options.country !== undefined
            ? snapshot.text
            : displayOf(current, snapshot, snapshot.country ?? country)
      } else if (countryChanged) {
        // Another country reads the same digits as its own national number.
        const typed = significant(state.text)
        const national =
          previous.format(typed, shown.country).national ||
          typed.replace(/^\+/, "")
        snapshot = current.format(national, country)
        text = snapshot.text
      } else {
        // The engine arrived, or changed: format what's there.
        snapshot = current.format(
          significant(edited ? state.text : state.value || state.text),
          country
        )
        if (snapshot.country !== null && snapshot.country !== country) {
          moved = snapshot.country
        }
        text = edited ? snapshot.text : displayOf(current, snapshot, country)
      }

      shown = { value, country, engine: options.engine }
      const patch: Partial<PhoneInputState> = { text, valid: snapshot.valid }
      if (moved) {
        if (options.country === undefined) {
          patch.country = moved
          shown.country = moved
        } else {
          change("country", moved, { reason: "imperative" })
        }
      }
      if (!valueChanged && snapshot.value !== value) {
        // The same digits under another country or engine are another number.
        change("value", snapshot.value, { reason: "imperative" })
        shown.value =
          options.value === undefined
            ? context.store.get().value
            : snapshot.value
      }
      context.store.set(patch)
      show(text)
    })

    return {
      /** The E.164 value. */
      getValue: () => context.store.get().value,
      /** Sets the number, as E.164 or as a national number of the selected country. */
      setValue(value: string, reason: PhoneValueChangeReason = "imperative") {
        const state = context.store.get()
        const snapshot = engine().format(significant(value), state.country)
        return commit(
          snapshot,
          displayOf(engine(), snapshot, state.country),
          reason
        )
      },
      /** Selects a country and reads the typed digits as its national number. */
      setCountry(
        country: CountryCode,
        reason: PhoneCountryChangeReason = "imperative",
        event?: Event
      ) {
        const state = context.store.get()
        if (country === state.country) return false
        if (!change("country", country, { reason, event })) return false
        const typed = significant(state.text)
        const national =
          engine().format(typed, state.country).national ||
          typed.replace(/^\+/, "")
        const snapshot = engine().format(national, country)
        if (snapshot.value !== state.value) {
          change("value", snapshot.value, {
            reason: reason === "input-change" ? "imperative" : reason,
            event,
          })
        }
        const next = context.store.get()
        shown = {
          value: isControlled("value") ? snapshot.value : next.value,
          country: isControlled("country") ? country : next.country,
          engine: context.options().engine,
        }
        context.store.set({ text: snapshot.text, valid: snapshot.valid })
        show(snapshot.text)
        return true
      },
      /** Moves focus to the field. */
      focus: () => field()?.focus(),
      /** The selected country's calling code without the plus, or "". */
      callingCode: (country: CountryCode | null) =>
        country ? engine().callingCode(country) : "",
      /** A national number to show as a placeholder, when the engine has one. */
      example: (country: CountryCode | null) =>
        country ? engine().example?.(country) : undefined,
      internal: {
        typed(el: HTMLInputElement, event: Event) {
          const input = event as InputEvent
          if (input.isComposing) return
          const state = context.store.get()
          if (el.value === state.text) return
          const result = applyEdit(engine(), state.country, {
            text: el.value,
            caret: el.selectionStart ?? el.value.length,
            previous: state.text,
            inputType: input.inputType,
          })
          if (result.refused) {
            show(result.text, result.caret)
            return
          }
          edited = true
          commit(result, result.text, "input-change", event, result.caret)
        },
        blurred(event: FocusEvent) {
          // Focus moving to the country button isn't leaving the field.
          const root = context.element("root")
          const next = event.relatedTarget
          if (next instanceof Node && root?.contains(next)) return
          if (!context.store.get().touched) {
            context.store.set({ touched: true })
          }
        },
        reset() {
          const options = context.options()
          const state = context.store.get()
          const country =
            options.country !== undefined
              ? options.country
              : (options.defaultCountry ?? state.country)
          const target = options.defaultValue ?? ""
          const snapshot = engine().format(significant(target), country)
          if (
            options.country === undefined &&
            country !== null &&
            country !== state.country &&
            snapshot.country === null
          ) {
            change("country", country, { reason: "imperative" })
          }
          commit(snapshot, displayOf(engine(), snapshot, country), "reset")
          context.store.set({ touched: false })
        },
        validity(el: HTMLInputElement) {
          const state = context.store.get()
          const message =
            context.options().validationMessage ?? DEFAULT_MESSAGE
          const invalid = state.ready && state.text !== "" && !state.valid
          el.setCustomValidity(invalid ? message : "")
        },
      },
    }
  },
  slots: (slot) => ({
    root: slot<
      {},
      {
        value: string
        country: CountryCode | null
        valid: boolean
        filled: boolean
        disabled: boolean
        ready: boolean
      }
    >({
      role: "group",
      state: (state) => ({
        value: state.value,
        country: state.country,
        valid: state.valid,
        filled: state.text !== "",
        disabled: state.disabled,
        ready: state.ready,
      }),
      attrs: (state) => ({
        "data-country": state.country ?? undefined,
        "data-filled": state.text !== "" ? "" : undefined,
        "data-valid": state.valid ? "" : undefined,
        "data-invalid":
          state.touched && state.text !== "" && !state.valid ? "" : undefined,
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
        "data-loading": state.ready ? undefined : "",
      }),
    }),
    input: slot<{}, { valid: boolean; filled: boolean }>({
      state: (state) => ({ valid: state.valid, filled: state.text !== "" }),
      attrs: (state) => ({
        type: "tel",
        inputmode: "tel",
        autocomplete: "tel",
        // A phone number reads left to right in every language. Without this,
        // a right-to-left page reorders its groups.
        dir: "ltr",
        required: state.required ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        "aria-invalid":
          state.touched && state.text !== "" && !state.valid
            ? "true"
            : undefined,
        "data-filled": state.text !== "" ? "" : undefined,
        "data-valid": state.valid ? "" : undefined,
        "data-invalid":
          state.touched && state.text !== "" && !state.valid ? "" : undefined,
      }),
      bind: (el, part) => {
        const input = el as HTMLInputElement
        const { internal } = part.api
        if (input.value !== part.store.get().text) {
          input.value = part.store.get().text
        }
        internal.validity(input)
        const typed = (event: Event) => internal.typed(input, event)
        const reset = (event: Event) => {
          if (event.target !== input.form) return
          // After the browser has put its own defaults back.
          queueMicrotask(() => internal.reset())
        }
        input.addEventListener("input", typed)
        input.addEventListener("compositionend", typed)
        input.addEventListener("blur", internal.blurred)
        input.ownerDocument.addEventListener("reset", reset, true)
        const stop = part.store.subscribe(() => {
          const text = part.store.get().text
          if (input.value !== text) input.value = text
          internal.validity(input)
        })
        return () => {
          stop()
          input.removeEventListener("input", typed)
          input.removeEventListener("compositionend", typed)
          input.removeEventListener("blur", internal.blurred)
          input.ownerDocument.removeEventListener("reset", reset, true)
        }
      },
    }),
    "dial-code": slot<{}, { callingCode: string; country: CountryCode | null }>({
      state: (state, part) => ({
        callingCode: part.api.callingCode(state.country),
        country: state.country,
      }),
      // "+966" inside right-to-left text would otherwise show as "966+".
      attrs: () => ({ dir: "ltr" }),
    }),
    country: slot<
      {},
      { country: CountryCode | null; callingCode: string; flag: string }
    >({
      state: (state, part) => ({
        country: state.country,
        callingCode: part.api.callingCode(state.country),
        flag: state.country ? flagOf(state.country) : "",
      }),
    }),
    value: slot({
      present: (state) => state.name !== undefined && !state.disabled,
      attrs: (state) => ({
        type: "hidden",
        name: state.name,
        form: state.form,
        value: state.value,
      }),
    }),
  }),
})

export {
  phoneInput,
  type PhoneCountryChangeReason,
  type PhoneInputOptions,
  type PhoneInputState,
  type PhoneValueChangeReason,
}
