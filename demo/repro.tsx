import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@ui-sdk/react/combobox"
import * as React from "react"
import { createRoot } from "react-dom/client"

const items = [
  { value: "AF", label: "Afghanistan", code: "93" },
  { value: "IQ", label: "Iraq", code: "964" },
  { value: "SA", label: "Saudi Arabia", code: "966" },
]

function Box({ id, controlled, data }: { id: string; controlled: boolean; data: boolean }) {
  const [query, setQuery] = React.useState("")
  const [value, setValue] = React.useState<string | null>(null)
  const control = controlled ? { query, onQueryChange: setQuery } : {}
  return (
    <section data-testid={id}>
      <h2>{id}</h2>
      <Combobox autoHighlight value={value} onValueChange={(next) => setValue(next as string | null)} {...control}>
        <ComboboxInput aria-label={id} />
        <ComboboxContent>
          <ComboboxList>
            {items.map((item) => (
              <ComboboxItem key={item.value} value={item.value} label={item.label} keywords={[item.code]}>
                {item.label} +{item.code}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <output data-testid={`${id}-value`}>{value}</output>
    </section>
  )
}

createRoot(document.getElementById("root")!).render(
  <>
    <Box id="uncontrolled" controlled={false} data={false} />
    <Box id="controlled" controlled data={false} />
  </>
)
