/** Remembers the first page of each inquiry list opened (by its filters), so going back to a view shows it at
    once while a fresh copy loads. Kept in memory only, for this page load. */

import type { InquiryPage } from "../../shared/api/inquiries";

const pages = new Map<string, InquiryPage>();
// The admin context's version when the pages were stored: it goes up after every change to an inquiry.
let storedVersion = -1;

/** The remembered first page for this key, or undefined. A new version empties the cache, so a list
    from before a change is never shown as if it were current. */
export function cachedPage(key: string, version: number): InquiryPage | undefined {
  if (version !== storedVersion) {
    pages.clear();
    storedVersion = version;
  }
  return pages.get(key);
}

export function rememberPage(key: string, version: number, page: InquiryPage): void {
  if (version === storedVersion) pages.set(key, page);
}