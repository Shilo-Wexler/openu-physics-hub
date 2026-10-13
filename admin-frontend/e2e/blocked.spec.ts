/** The "חסימות פניות" tab: blocking and unblocking emails from the request system. */

import { expect, tab, test } from "./fixtures";

const list = (page: import("@playwright/test").Page) => page.locator(".card", { hasText: "מיילים חסומים" }).locator("tbody tr");

test.describe("request blocks", () => {
  test("an empty list says so", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "חסימות פניות");
    await expect(page.getByText("אין מיילים חסומים.")).toBeVisible();
  });

  test("blocking an email with a reason adds it to the list", async ({ page, api, open }) => {
    await open();
    await tab(page, "חסימות פניות");
    await page.getByLabel("מייל").fill("spam@test.com");
    await page.getByLabel("סיבה (לא חובה)").fill("הצפה");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(list(page)).toHaveCount(1);
    await expect(list(page).first()).toContainText("spam@test.com");
    await expect(list(page).first()).toContainText("הצפה");
    expect(api.blocked).toMatchObject([{ email: "spam@test.com", reason: "הצפה" }]);
  });

  test("the form is cleared after a successful block", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "חסימות פניות");
    await page.getByLabel("מייל").fill("spam@test.com");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(page.getByLabel("מייל")).toHaveValue("");
  });

  test("blocking without a reason shows a dash", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "חסימות פניות");
    await page.getByLabel("מייל").fill("spam@test.com");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(list(page).first().locator("td").nth(1)).toHaveText("–");
  });

  test("the email is stored lowercase", async ({ page, api, open }) => {
    await open();
    await tab(page, "חסימות פניות");
    await page.getByLabel("מייל").fill("Spam@Test.com");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(list(page)).toHaveCount(1);
    expect(api.blocked[0]?.email).toBe("spam@test.com");
  });

  test("an empty email is not sent, and a standard message says so", async ({ page, api, open }) => {
    await open();
    await tab(page, "חסימות פניות");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(page.locator(".field-error")).toHaveText("יש להזין כתובת מייל.");
    expect(api.called("POST", /^\/blocked$/)).toHaveLength(0);
  });

  test("an email without @ gets the standard message, not the browser's", async ({ page, api, open }) => {
    await open();
    await tab(page, "חסימות פניות");
    await expect(page.locator("form.form")).toHaveAttribute("novalidate", "");
    await page.getByLabel("מייל").fill("spam");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(page.locator(".field-error")).toHaveText("כתובת המייל לא תקינה. לדוגמה: name@gmail.com");
    await expect(page.getByLabel("מייל")).toHaveAttribute("aria-invalid", "true");
    expect(api.called("POST", /^\/blocked$/)).toHaveLength(0);
  });

  test("unblocking asks first and removes the email", async ({ page, api, open }) => {
    api.blocked.push({ email: "spam@test.com", reason: null, blocked_at: new Date().toISOString() });
    await open();
    await tab(page, "חסימות פניות");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "ביטול חסימה" }).click();
    await expect(page.getByText("אין מיילים חסומים.")).toBeVisible();
    expect(api.blocked).toHaveLength(0);
  });

  test("cancelling the unblock keeps the email", async ({ page, api, open }) => {
    api.blocked.push({ email: "spam@test.com", reason: null, blocked_at: new Date().toISOString() });
    await open();
    await tab(page, "חסימות פניות");
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "ביטול חסימה" }).click();
    await expect(list(page)).toHaveCount(1);
    expect(api.blocked).toHaveLength(1);
  });

  test("a server error is shown and nothing is added", async ({ page, api, open }) => {
    api.fail({ method: "POST", path: /^\/blocked$/, status: 500 });
    await open();
    await tab(page, "חסימות פניות");
    await page.getByLabel("מייל").fill("spam@test.com");
    await page.getByRole("button", { name: "חסימה", exact: true }).click();
    await expect(page.locator(".error")).toHaveText("משהו השתבש בשרת. נסו שוב בעוד רגע.");
    await expect(page.getByText("אין מיילים חסומים.")).toBeVisible();
  });

  test("unblocking an email someone else already unblocked explains it", async ({ page, api, open }) => {
    api.blocked.push({ email: "spam@test.com", reason: null, blocked_at: new Date().toISOString() });
    await open();
    await tab(page, "חסימות פניות");
    api.blocked = []; // someone else unblocked it meanwhile
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "ביטול חסימה" }).click();
    await expect(page.locator(".error")).toHaveText("המייל הזה כבר לא חסום. רעננו את הדף.");
  });
});
