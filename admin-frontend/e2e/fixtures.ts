/** Shared test setup: a fresh fake API per test, and helpers to open the console signed in. */

import { test as base, expect, type Page } from "@playwright/test";

import { ADMIN, FakeApi } from "./fake-api";

export { expect };
export * from "./fake-api";

/** The value the console keeps in sessionStorage after a dev sign-in (see src/auth/identity.ts). */
export function identity(email: string) {
  return JSON.stringify({ token: `dev:${email}`, email });
}

export const test = base.extend<{ api: FakeApi; open: (email?: string) => Promise<void> }>({
  api: async ({ page }, use) => {
    const api = new FakeApi();
    await api.install(page);
    await use(api);
  },
  /** Opens the console already signed in as `email` (default: the test admin). */
  open: async ({ page, api }, use) => {
    void api; // make sure the fake API is installed first
    await use(async (email = ADMIN) => {
      await page.addInitScript((value) => sessionStorage.setItem("identity:admin", value), identity(email));
      await page.goto("/");
    });
  },
});

/** The number shown in a counter box ("חדשות", "בטיפול", "סגורות", 'סה"כ'). */
export function counter(page: Page, label: string) {
  return page.locator(".counter-box", { hasText: label }).locator(".counter-value");
}

/** Rows of the inquiries table. */
export function rows(page: Page) {
  return page.locator(".requests-table tbody tr");
}

/** The open inquiry's side panel. */
export function panel(page: Page) {
  return page.locator("aside.detail");
}

/** Switches the console tab. */
export async function tab(page: Page, name: "פניות" | "ניהול הצ'אט" | "הכרזות" | "מנהלים") {
  await page.getByRole("tab", { name, exact: true }).click();
}

/** Switches the view inside the inquiries tab. */
export async function view(page: Page, name: "חדשות" | "בטיפול" | "סגורות" | "הכל") {
  await page.locator(".segmented button", { hasText: name }).click();
}
