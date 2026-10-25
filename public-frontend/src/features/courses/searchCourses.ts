/** Forgiving course search that runs in the browser: partial words, typos, Hebrew variants. */

import Fuse from "fuse.js";

import type { Course } from "../../shared/api/chat";

const NIQQUD = /[֑-ׇ]/g; // vowel points and cantillation marks
const FINAL_LETTERS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
// Quote marks (as in ״ or ') and characters that Fuse's extended search treats as operators.
const PUNCTUATION = /["'׳״`!^=$|.,\-–()]/g;

/** Reduces a name to a search form in which common spelling variants are equal. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(NIQQUD, "")
    .replace(/[ךםןףץ]/g, (letter) => FINAL_LETTERS[letter] ?? letter)
    .replace(PUNCTUATION, " ")
    // Spelling variants: full vs. defective spelling (קוונטית / קוואנטית) and ז/ס (פיזיקה / פיסיקה).
    .replace(/[אוי]/g, "")
    .replace(/ז/g, "ס")
    .replace(/\s+/g, " ")
    .trim();
}

interface Entry {
  course: Course;
  name: string; // normalized
}

/** Builds the index once; the returned function is called on every keystroke. */
export function createCourseSearch(courses: Course[]): (query: string) => Course[] {
  const entries: Entry[] = courses.map((course) => ({ course, name: normalize(course.name) }));
  const fuse = new Fuse(entries, {
    keys: ["name"],
    threshold: 0.3, // 0 = exact only, 1 = anything; this allows about one typo per word
    ignoreLocation: true, // a match may be anywhere in the name, not only at the start
    useExtendedSearch: true, // words in the query are matched separately (in any order)
  });

  return (query: string) => {
    const q = normalize(query);
    if (q === "") {
      return courses;
    }
    // Digits: match the course number from its start ("202" finds 20237).
    if (/^\d+$/.test(q)) {
      return courses.filter((course) => String(course.id).startsWith(q));
    }
    return fuse.search(q).map((result) => result.item.course);
  };
}