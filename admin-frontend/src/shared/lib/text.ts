/** Text measured the way the server measures it. */

/** Length in characters (code points), not UTF-16 units, so an emoji counts once.
    Spaces at the ends do not count: the server trims them too. */
export function charLength(text: string): number {
  return [...text.trim()].length;
}