/** The statistics tab: by course, by week, top senders. */

import { expect, tab, test } from "./fixtures";

const byCourseRows = (page: import("@playwright/test").Page) => page.locator("ul.hbars li");

test.describe("requests by course", () => {
  test("there is no course toggle any more", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.locator(".stats input[type=checkbox]")).toHaveCount(0);
    await expect(page.getByText("קורסים לפי פניות")).toHaveCount(0);
  });

  test("only courses with requests are listed, most first", async ({ page, api, open }) => {
    api.addRequest({ course_name: "כללי" });
    api.addRequest({ course_name: "מכניקה" });
    api.addRequest({ course_name: "מכניקה" });
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(byCourseRows(page).locator(".hbar-label")).toHaveText(["מכניקה", "כללי"]);
  });

  test("each course shows its total and how many are unread", async ({ page, api, open }) => {
    api.addRequest({ course_name: "מכניקה" });
    api.addRequest({ course_name: "מכניקה", is_opened: true });
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(byCourseRows(page).first().locator(".hbar-value")).toHaveText("2 (1 לא נקראו)");
  });

  test("a course with nothing unread shows just the total", async ({ page, api, open }) => {
    api.addRequest({ course_name: "מכניקה", is_opened: true });
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(byCourseRows(page).first().locator(".hbar-value")).toHaveText("1");
  });

  test("the biggest course gets a full bar, the others a proportional one", async ({ page, api, open }) => {
    for (let i = 0; i < 4; i++) api.addRequest({ course_name: "מכניקה", body: `${i}` });
    api.addRequest({ course_name: "כללי" });
    await open();
    await tab(page, "סטטיסטיקה");
    const widths = await byCourseRows(page).locator(".hbar-fill").evaluateAll((els) => els.map((e) => (e as HTMLElement).style.width));
    expect(widths).toEqual(["100%", "25%"]);
  });

  test("with no requests at all it says so", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.getByText("אין עדיין פניות.")).toBeVisible();
  });

  test("a failed load shows an error", async ({ page, api, open }) => {
    api.fail({ path: /^\/stats\/by-course$/, status: 500 });
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.locator(".card", { hasText: "פניות לפי קורס" }).locator(".error")).toBeVisible();
  });

  test("the stats follow changes made in the requests tab", async ({ page, api, open }) => {
    api.addRequest({ course_name: "מכניקה" });
    await open();
    await page.locator(".requests-table tbody tr").first().click(); // marks it read
    await expect(page.locator("aside.detail .body-text")).toBeVisible();
    await tab(page, "סטטיסטיקה");
    await expect(byCourseRows(page).first().locator(".hbar-value")).toHaveText("1");
  });
});

test.describe("requests by week", () => {
  test("shows twelve weeks", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.locator(".vbar")).toHaveCount(12);
    await expect(page.getByRole("heading", { name: "פניות לפי שבוע (12 שבועות אחרונים)" })).toBeVisible();
  });

  test("this week's bar counts this week's requests", async ({ page, api, open }) => {
    api.addMany(3, { created_at: new Date().toISOString() });
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.locator(".vbar").last().locator(".vbar-value")).toHaveText("3");
  });

  test("empty weeks show no number", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.locator(".vbar").first().locator(".vbar-value")).toHaveText("");
  });

  test("every bar has a day/month label", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "סטטיסטיקה");
    const labels = await page.locator(".vbar-label").allTextContents();
    expect(labels).toHaveLength(12);
    for (const l of labels) expect(l).toMatch(/^\d{2}[./]\d{2}$/);
  });
});

test.describe("top senders", () => {
  test("lists senders with their totals, most first", async ({ page, api, open }) => {
    api.addRequest({ email: "a@test.com" });
    api.addRequest({ email: "b@test.com", body: "1" });
    api.addRequest({ email: "b@test.com", body: "2" });
    await open();
    await tab(page, "סטטיסטיקה");
    const table = page.locator(".card", { hasText: "השולחים המובילים" }).locator("tbody tr");
    await expect(table.locator("td:nth-child(1)")).toHaveText(["b@test.com", "a@test.com"]);
    await expect(table.locator("td:nth-child(2)")).toHaveText(["2", "1"]);
  });

  test("blocking from the table asks for a reason and marks the sender blocked", async ({ page, api, open }) => {
    api.addRequest({ email: "a@test.com" });
    await open();
    await tab(page, "סטטיסטיקה");
    page.once("dialog", (d) => d.accept("הצפה"));
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(page.locator(".card", { hasText: "השולחים המובילים" }).getByText("חסום")).toBeVisible();
    expect(api.blocked).toMatchObject([{ email: "a@test.com", reason: "הצפה" }]);
  });

  test("an already blocked sender shows a badge instead of a button", async ({ page, api, open }) => {
    api.addRequest({ email: "a@test.com" });
    api.blocked.push({ email: "a@test.com", reason: null, blocked_at: new Date().toISOString() });
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.getByRole("button", { name: "חסימה", exact: true })).toHaveCount(0);
  });

  test("no requests: a message instead of the table", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "סטטיסטיקה");
    await expect(page.getByText("אין פניות ב-30 הימים האחרונים.")).toBeVisible();
  });
});
