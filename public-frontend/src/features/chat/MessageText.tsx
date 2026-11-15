/** A message's text with its links made clickable. Links to video and learning sites
    leave the text and show as cards under it; any other link stays in place, shortened. */

import { useMemo, type ReactNode } from "react";

import styles from "./MessageText.module.css";

// A link starts with http(s):// or www. and runs until a space or a character that
// cannot be in an address.
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;

// Punctuation right after a link usually ends the sentence, not the link:
// "see https://x.com/a." -> "https://x.com/a".
const TRAILING_PUNCTUATION = /[.,;:!?'"׳״\]}]+$/;

// A link shown in the text is cut to this many characters (the full address opens).
const SHORT_LINK_LENGTH = 40;

// Sites whose links become a card, by host (without "www." or "m."), with the name shown.
const VIDEO_SITES: Record<string, string> = {
  "youtube.com": "יוטיוב",
  "youtu.be": "יוטיוב",
  "vimeo.com": "Vimeo",
  "khanacademy.org": "Khan Academy",
  "coursera.org": "Coursera",
  "edx.org": "edX",
  "ocw.mit.edu": "MIT OpenCourseWare",
  "ted.com": "TED",
};

// rel: the new tab gets no handle on this page (noopener), the site does not learn which
// page sent the reader (noreferrer), and search engines do not credit links users wrote.
const LINK_REL = "noopener noreferrer nofollow ugc";

type CardKind = "video" | "playlist";

interface Card {
  href: string;
  title: string;
  address: string;
  kind: CardKind;
}

/** The link's address without its trailing punctuation, and the punctuation after it. */
function splitTrailing(raw: string): [string, string] {
  let link = raw.replace(TRAILING_PUNCTUATION, "");
  // A ")" ends the link only if it has no "(" to close: Wikipedia links keep theirs.
  while (link.endsWith(")") && count(link, "(") < count(link, ")")) link = link.slice(0, -1);
  return [link, raw.slice(link.length)];
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

function toUrl(link: string): URL | null {
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Hebrew in an address is kept encoded ("%D7%9E..."): shown back as letters. */
function readable(address: string): string {
  try {
    return decodeURI(address);
  } catch {
    return address; // a broken "%" sequence: show it as it is
  }
}

/** The address as a reader would type it: no "https://", no "www.", no trailing "/". */
function shortAddress(url: URL): string {
  const address = readable(url.host + url.pathname + url.search + url.hash)
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  return address.length > SHORT_LINK_LENGTH
    ? `${address.slice(0, SHORT_LINK_LENGTH - 1)}…`
    : address;
}

function videoSite(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  for (const [site, name] of Object.entries(VIDEO_SITES)) {
    // Also subdomains, like music.youtube.com.
    if (host === site || host.endsWith(`.${site}`)) return name;
  }
  return undefined;
}

function toCard(url: URL, site: string): Card {
  // All these sites work over https: an old http link is upgraded.
  url.protocol = "https:";
  const isYoutube = /(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname);
  const isPlaylist =
    isYoutube && (url.pathname === "/playlist" || (url.searchParams.has("list") && !url.searchParams.has("v")));
  let title = site;
  if (isYoutube) {
    if (isPlaylist) title = "פלייליסט ביוטיוב";
    else if (url.hostname.endsWith("youtu.be") || /^\/(watch|shorts|live)/.test(url.pathname)) {
      title = "סרטון ביוטיוב";
    } else if (/^\/(@|channel\/|c\/|user\/)/.test(url.pathname)) title = "ערוץ ביוטיוב";
  }
  return { href: url.href, title, address: shortAddress(url), kind: isPlaylist ? "playlist" : "video" };
}

/** Takes the video links out of the text as cards. The text keeps what was around them:
    punctuation right after a link joins the word before it, extra spaces and lines go. */
function takeCards(text: string): { rest: string; cards: Card[] } {
  const cards: Card[] = [];
  let rest = "";
  let from = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [link, trailing] = splitTrailing(match[0]);
    const url = toUrl(link);
    const site = url && videoSite(url);
    if (!url || !site) continue;
    const card = toCard(url, site);
    if (!cards.some((c) => c.href === card.href)) cards.push(card);
    rest += text.slice(from, match.index);
    from = match.index + match[0].length;
    if (trailing) rest = rest.trimEnd() + trailing;
    // "see LINK now" -> "see now", not "see  now".
    else if (/[ \t]$/.test(rest)) while (text[from] === " " || text[from] === "\t") from++;
  }
  if (cards.length === 0) return { rest: text, cards };
  rest += text.slice(from);
  rest = rest.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { rest, cards };
}

/** Cuts the text into plain parts and clickable links. */
function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [link, trailing] = splitTrailing(match[0]);
    const url = toUrl(link);
    if (!url) continue;
    parts.push(
      text.slice(from, match.index),
      // dir="ltr": an address reads left to right, even inside a Hebrew sentence.
      <a key={match.index} className={styles.link} href={url.href} target="_blank" rel={LINK_REL} dir="ltr">
        {shortAddress(url)}
      </a>,
      trailing,
    );
    from = match.index + match[0].length;
  }
  parts.push(text.slice(from));
  return parts;
}

function PlayIcon({ kind }: { kind: CardKind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === "playlist" ? (
        <>
          <path className={styles.lines} d="M4 6h11M4 11h11M4 16h7" />
          <path d="M16 13.5v6l5-3z" />
        </>
      ) : (
        <path d="M8 5.5v13l10.5-6.5z" />
      )}
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className={styles.external} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

interface Props {
  text: string;
  /** For the paragraph of text, from the message's own styles. */
  className?: string;
}

export default function MessageText({ text, className }: Props) {
  const { rest, cards } = useMemo(() => takeCards(text), [text]);
  const parts = useMemo(() => linkify(rest), [rest]);
  return (
    <>
      {rest.trim() !== "" && (
        // dir="auto": a message written in English is shown left-to-right.
        <p className={className} dir="auto">
          {parts}
        </p>
      )}
      {cards.map((card) => (
        <a key={card.href} className={styles.card} href={card.href} target="_blank" rel={LINK_REL}>
          <span className={styles.tile}>
            <PlayIcon kind={card.kind} />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{card.title}</span>
            <span className={styles.address} dir="ltr">
              {card.address}
            </span>
          </span>
          <ExternalIcon />
        </a>
      ))}
    </>
  );
}
