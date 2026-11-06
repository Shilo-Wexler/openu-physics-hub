/** Text measured the way the server measures it. */

/** Length in characters (code points), not UTF-16 units, so an emoji counts once.
    Spaces at the ends do not count: the server trims them too. */
export function charLength(text: string): number {
  return [...text.trim()].length;
}

// The first letter of the text, and whether it belongs to a right-to-left script.
const FIRST_LETTER = /\p{L}/u;
const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;

/** The direction of a text field, decided here and not by dir="auto": Safari judges dir="auto" on a
    textarea once, while it is still empty (left-to-right), and does not judge it again as text is typed.
    The first letter decides, like dir="auto" would. With no letter yet the field is right-to-left,
    so the cursor starts on the right like the rest of the page. */
export function fieldDir(value: string): "rtl" | "ltr" {
  const letter = FIRST_LETTER.exec(value)?.[0];
  if (letter === undefined) return "rtl";
  return RTL_LETTER.test(letter) ? "rtl" : "ltr";
}