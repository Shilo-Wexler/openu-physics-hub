/** Signing in, access check (/me), signing out and expired sessions. */

import { ADMIN, counter, expect, identity, test } from "./fixtures";

test.describe("sign-in and access", () => {
  test("without an identity the sign-in card is shown, not the console", async ({ page, api }) => {
    void api;
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "כניסת חברי ועדה" })).toBeVisible();
    await expect(page.getByText("הכניסה לחברי הוועדה בלבד")).toBeVisible();
    await expect(page.locator(".counters")).toHaveCount(0);
  });

  test("dev sign-in with an admin email opens the console", async ({ page, api }) => {
    void api;
    await page.goto("/");
    const form = page.locator(".dev-signin");
    test.skip((await form.count()) === 0, "not the dev server, so there is no dev sign-in form");
    await form.getByLabel("מייל").fill(ADMIN);
    await form.getByRole("button", { name: "התחברות (פיתוח)" }).click();
    await expect(page.locator(".counters")).toBeVisible();
  });

  test("dev sign-in checks the email with the standard message", async ({ page, api }) => {
    void api;
    await page.goto("/");
    const form = page.locator(".dev-signin");
    test.skip((await form.count()) === 0, "not the dev server, so there is no dev sign-in form");
    await form.getByLabel("מייל").fill("admin");
    await form.getByRole("button", { name: "התחברות (פיתוח)" }).click();
    await expect(form.locator(".field-error")).toHaveText("כתובת המייל לא תקינה. לדוגמה: name@gmail.com");
    await expect(page.locator(".counters")).toHaveCount(0);
  });

  test("the signed-in email and a sign-out button are in the header", async ({ page, open }) => {
    await open();
    await expect(page.locator(".admin-bar")).toContainText(ADMIN);
    await expect(page.getByRole("button", { name: "התנתקות" })).toBeVisible();
  });

  test('there is no "קונסולת הוועדה" heading', async ({ page, open }) => {
    await open();
    await expect(page.locator(".counters")).toBeVisible();
    await expect(page.getByText("קונסולת הוועדה")).toHaveCount(0);
  });

  test("the console checks /me before showing anything", async ({ page, api, open }) => {
    await open();
    await expect(page.locator(".counters")).toBeVisible();
    expect(api.called("GET", /^\/me$/).length).toBeGreaterThan(0);
  });

  test("a signed-in non-admin sees the no-permission screen with their email", async ({ page, open }) => {
    await open("student@test.com");
    await expect(page.getByRole("heading", { name: "אין הרשאה" })).toBeVisible();
    await expect(page.getByText("student@test.com")).toBeVisible();
    await expect(page.locator(".counters")).toHaveCount(0);
  });

  test('"sign in with another account" from the no-permission screen goes back to sign-in', async ({ page, open }) => {
    await open("student@test.com");
    await page.getByRole("button", { name: "התחברות עם חשבון אחר" }).click();
    await expect(page.getByRole("heading", { name: "כניסת חברי ועדה" })).toBeVisible();
  });

  test("a server error on /me shows a clear message, not the console", async ({ page, api, open }) => {
    api.fail({ path: /^\/me$/, status: 500 });
    await open();
    await expect(page.getByText("לא הצלחנו לבדוק את ההרשאות שלך, כי השרת לא זמין. נסו לרענן את הדף.")).toBeVisible();
  });

  test("a 401 on /me signs out with an expired-session notice", async ({ page, api, open }) => {
    api.fail({ path: /^\/me$/, status: 401, detail: "invalid or expired token" });
    await open();
    await expect(page.getByText("ההתחברות פגה. התחברו שוב.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "כניסת חברי ועדה" })).toBeVisible();
  });

  test("a 401 later (on the counters) also signs out with the notice", async ({ page, api, open }) => {
    api.fail({ path: /^\/inquiries\/counts$/, status: 401 });
    await open();
    await expect(page.getByText("ההתחברות פגה. התחברו שוב.")).toBeVisible();
  });

  test("sign-out returns to the sign-in card and clears the stored identity", async ({ page, open }) => {
    await open();
    await page.getByRole("button", { name: "התנתקות" }).click();
    await expect(page.getByRole("heading", { name: "כניסת חברי ועדה" })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("identity:admin"))).toBeNull();
  });

  test("a stored identity is picked up after a reload (no sign-in again)", async ({ page, api }) => {
    void api;
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "כניסת חברי ועדה" })).toBeVisible();
    await page.evaluate((value) => sessionStorage.setItem("identity:admin", value), identity(ADMIN));
    await page.reload();
    await expect(page.locator(".counters")).toBeVisible();
  });

  test("every admin call carries the Bearer token", async ({ page, api, open }) => {
    let header = "";
    page.on("request", (r) => {
      if (r.url().includes("/api/admin/inquiries/counts")) header = r.headers()["authorization"] ?? "";
    });
    await open();
    await expect(counter(page, "חדשות")).toHaveText("0");
    expect(header).toBe(`Bearer dev:${ADMIN}`);
    void api;
  });

  test("unknown paths redirect to the console", async ({ page, api }) => {
    void api;
    await page.addInitScript((value) => sessionStorage.setItem("identity:admin", value), identity(ADMIN));
    await page.goto("/something/else");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".counters")).toBeVisible();
  });
});
