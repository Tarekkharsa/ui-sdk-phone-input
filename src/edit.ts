import {
  significant,
  toDigit,
  type CountryCode,
  type PhoneEngine,
  type PhoneSnapshot,
} from "./engine"

type Edit = {
  /** The field's text after the browser applied the edit. */
  text: string
  /** The caret's position in that text. */
  caret: number
  /** The field's text before the edit. */
  previous: string
  /** The `inputType` of the input event, when there is one. */
  inputType?: string
}

type EditResult = PhoneSnapshot & {
  /** Where the caret belongs in the formatted text. */
  caret: number
  /** Whether the edit was refused, so the field keeps its previous text. */
  refused: boolean
}

/** How many significant characters `text` has before `index`. */
function countBefore(text: string, index: number): number {
  return significant(text.slice(0, index)).length
}

/**
 * The position in `text` just after its `count`-th significant character.
 * With every character counted, that's the end of the text, so the caret
 * stays past a closing bracket.
 */
function caretAfter(text: string, count: number): number {
  if (count <= 0) {
    return 0
  }
  const total = significant(text).length
  if (count >= total) {
    return text.length
  }
  let seen = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (toDigit(char) !== undefined || (char === "+" && seen === 0)) {
      seen++
      if (seen === count) {
        return index + 1
      }
    }
  }
  return text.length
}

/**
 * Formats the field after an edit and says where the caret goes.
 *
 * The caret keeps its place among the digits, whatever separators the
 * formatting adds or removes around it. Deleting a separator deletes the
 * digit beside it, so Backspace never gets stuck. A key that makes the number
 * longer than its country allows is refused.
 */
function applyEdit(
  engine: PhoneEngine,
  country: CountryCode | null,
  edit: Edit
): EditResult {
  let digits = significant(edit.text)
  let before = countBefore(edit.text, edit.caret)
  const previousDigits = significant(edit.previous)

  if (digits === previousDigits && edit.text !== edit.previous) {
    if (edit.inputType === "deleteContentBackward" && before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before)
      before -= 1
    } else if (
      edit.inputType === "deleteContentForward" &&
      before < digits.length
    ) {
      digits = digits.slice(0, before) + digits.slice(before + 1)
    }
  }

  const snapshot = engine.format(digits, country)

  // One more key than the country allows is refused. A paste is kept, even
  // too long, so its text is there to correct.
  if (snapshot.tooLong && digits.length === previousDigits.length + 1) {
    const kept = engine.format(previousDigits, country)
    if (!kept.tooLong) {
      return {
        ...kept,
        caret: caretAfter(kept.text, Math.max(0, before - 1)),
        refused: true,
      }
    }
  }

  return { ...snapshot, caret: caretAfter(snapshot.text, before), refused: false }
}

export { applyEdit, caretAfter, countBefore, type Edit, type EditResult }
