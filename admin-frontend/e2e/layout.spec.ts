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

  test("there are four tabs, and the inquiries tab is selected first", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page.getByRole("tab")).toHaveText(["פניות", "ניהול הצ'אט", "הכרזות", "מנהלים"]);
    await expect(page.getByRole("tab", { name: "פניות", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  for (const name of ["ניהול הצ'אט", "הכרזות", "מנהלים"] as const) {
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
    for (const name of ["ניהול הצ'אט", "הכרזות", "מנהלים", "פניות"] as const) {
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

  test("on a wide screen the inquiry panel sits beside the list", async ({ page, api, open }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    api.addInquiry();
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
});
