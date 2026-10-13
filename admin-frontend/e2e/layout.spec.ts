/** Page-level behaviour: tabs, direction, title, small screens. */

import { expect, tab, test } from "./fixtures";

test.describe("layout", () => {
  test("the page is Hebrew and right-to-left", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("the title names the admin console and search engines are told to stay away", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page).toHaveTitle(/קונסולת ניהול/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });

  test("there are five tabs, and the requests tab is selected first", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page.getByRole("tab")).toHaveText(["פניות", "סטטיסטיקה", "חסימות פניות", "ניהול הצ'אט", "מנהלים"]);
    await expect(page.getByRole("tab", { name: "פניות", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  for (const name of ["סטטיסטיקה", "חסימות פניות", "ניהול הצ'אט", "מנהלים"] as const) {
    test(`switching to "${name}" selects that tab only`, async ({ page, api, open }) => {
      void api;
      await open();
      await tab(page, name);
      await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText(name);
    });
  }

  test("counters stay visible on every tab", async ({ page, api, open }) => {
    void api;
    await open();
    for (const name of ["סטטיסטיקה", "חסימות פניות", "ניהול הצ'אט", "מנהלים", "פניות"] as const) {
      await tab(page, name);
      await expect(page.locator(".counters")).toBeVisible();
    }
  });

  test("on a phone the counters wrap to two columns", async ({ page, api, open }) => {
    void api;
    await page.setViewportSize({ width: 390, height: 800 });
    await open();
    const columns = await page.locator(".counters").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(2);
  });

  test("on a wide screen the request panel sits beside the list", async ({ page, api, open }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    api.addRequest();
    await open();
    await page.locator(".requests-table tbody tr").first().click();
    await expect(page.locator(".requests-layout.with-detail")).toBeVisible();
    const cols = await page.locator(".requests-layout").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(2);
  });

  test("dark mode changes the page background", async ({ page, api, open }) => {
    void api;
    await open();
    const light = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(dark).not.toBe(light);
  });

  test("no request goes to Google when already signed in", async ({ page, api, open }) => {
    void api;
    const google: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("accounts.google.com")) google.push(r.url());
    });
    await open();
    await expect(page.locator(".counters")).toBeVisible();
    expect(google).toHaveLength(0);
  });
});
