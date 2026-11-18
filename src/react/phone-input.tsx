"use client"

import type { StateOf } from "@ui-sdk/core"
import {
  Combobox,
  createComboboxController,
  type ComboboxProps,
} from "@ui-sdk/react/combobox"
import {
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive"
import * as React from "react"
import type { CountryCode } from "../engine"
import { phoneInput, type PhoneInputOptions } from "../phone-input"

type RootState = StateOf<typeof phoneInput, "root">

// Parts that call the api, like the country list, find the instance here.
const PhoneInputContext = React.createContext<
  PrimitiveHandle<typeof phoneInput> | undefined
>(undefined)

type PhoneInputProps = PhoneInputOptions &
  Omit<
    PartProps<"div", RootState>,
    "defaultValue" | "children" | keyof PhoneInputOptions
  > & { children?: React.ReactNode }

/**
 * Groups the country list and the field, and owns the number. Renders a `div`
 * and, with a `name`, a hidden input that submits the E.164 value.
 */
function PhoneInput({
  value,
  defaultValue,
  onValueChange,
  country,
  defaultCountry,
  onCountryChange,
  engine,
  name,
  form,
  required,
  disabled,
  readOnly,
  validationMessage,
  children,
  ...props
}: PhoneInputProps) {
  const handle = usePrimitive(phoneInput, {
    value,
    defaultValue,
    onValueChange,
    country,
    defaultCountry,
    onCountryChange,
    engine,
    name,
    form,
    required,
    disabled,
    readOnly,
    validationMessage,
  })
  return usePart(
    handle,
    "root",
    {},
    {
      ...props,
      children: (
        <PhoneInputContext value={handle}>
          {children}
          <PhoneInputValue />
        </PhoneInputContext>
      ),
    },
    "div"
  )
}

function PhoneInputValue() {
  return usePart(phoneInput, "value", {}, {}, "input")
}

/** The field the number is typed in. Renders an `input`. */
function PhoneInputField(
  props: Omit<
    PartProps<"input", StateOf<typeof phoneInput, "input">>,
    "value" | "defaultValue" | "type" | "name"
  >
) {
  return usePart(phoneInput, "input", {}, props, "input")
}

/**
 * Shows the selected country's calling code, like "+966", kept left to right
 * inside right-to-left text. Renders a `span`.
 */
function PhoneInputDialCode({
  children,
  ...props
}: PartProps<"span", StateOf<typeof phoneInput, "dial-code">>) {
  return usePart(
    phoneInput,
    "dial-code",
    {},
    {
      ...props,
      children:
        children ??
        ((state) => (state.callingCode ? `+${state.callingCode}` : "")),
    },
    "span"
  )
}

type CountryState = StateOf<typeof phoneInput, "country">

type CountryComboboxProps = Omit<
  ComboboxProps<CountryCode>,
  "value" | "defaultValue" | "onValueChange" | "multiple" | "name" | "children"
>

/**
 * A Combobox whose value is the selected country. Put the Combobox parts
 * inside it: a trigger, the content, an input to search and the items.
 * Renders no element of its own.
 */
function PhoneInputCountry({
  children,
  ...props
}: CountryComboboxProps & {
  children?: React.ReactNode | ((state: CountryState) => React.ReactNode)
}) {
  return usePart(
    phoneInput,
    "country",
    {},
    {
      render: (_props, state) => (
        <CountryCombobox {...props} state={state}>
          {typeof children === "function" ? children(state) : children}
        </CountryCombobox>
      ),
    },
    "div"
  )
}

function CountryCombobox({
  state,
  children,
  controller,
  onOpenChange,
  onOpenChangeComplete,
  ...props
}: CountryComboboxProps & {
  state: CountryState
  children?: React.ReactNode
}) {
  const handle = React.use(PhoneInputContext)
  const [own] = React.useState(() => createComboboxController<CountryCode>())
  const list = controller ?? own
  return (
    <Combobox<CountryCode>
      // Enter chooses the first match, so "966" then Enter picks a country.
      autoHighlight
      {...props}
      controller={list}
      value={state.country}
      onValueChange={(next, details) => {
        if (typeof next !== "string") return
        handle?.api.setCountry(next, "item-press", details.event)
      }}
      onOpenChange={(open, details) => {
        onOpenChange?.(open, details)
        // Each search starts empty, not from the selected country's name.
        if (open && !details.canceled) list.setQuery("")
      }}
      onOpenChangeComplete={(open) => {
        onOpenChangeComplete?.(open)
        // Choosing a country is a step on the way to typing the number.
        if (!open) handle?.api.focus()
      }}
    >
      {children}
    </Combobox>
  )
}

export {
  PhoneInput,
  PhoneInputCountry,
  PhoneInputDialCode,
  PhoneInputField,
  type PhoneInputProps,
}
