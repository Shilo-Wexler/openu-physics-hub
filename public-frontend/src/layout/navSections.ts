/** The site's main sections: the header (computer) and the bottom bar (phone) both show these. */

export interface NavSection {
  to: string;
  label: string;
  /** Paths that belong to the section, so /courses/20215 still marks "chat" as current. */
  prefixes: string[];
}

export const MAIN_SECTIONS: NavSection[] = [
  { to: "/", label: "בית", prefixes: [] },
  { to: "/chat", label: "צ'אט", prefixes: ["/chat", "/courses"] },
  { to: "/inquiry", label: "פנייה לוועדה", prefixes: ["/inquiry"] },
];

/** True when the current path is in the section. "/" (no prefixes) matches only the home page itself. */
export function isInSection(pathname: string, section: NavSection): boolean {
  if (section.prefixes.length === 0) return pathname === section.to;
  return section.prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}