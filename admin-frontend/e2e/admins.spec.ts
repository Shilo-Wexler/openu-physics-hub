/**
 * The "מנהלים" tab and the two admin levels:
 * "מנהל ראשי" (role admin) can do everything, including adding, changing and removing admins;
 * "מנהל" (roles announcements, inquiries, moderator) can do everything except managing admins.
 */

import { ADMIN, FULL, STAFF, STANDARD, expect, identity, tab, test } from "./fixtures";

type Page = import("@playwright/test").Page;
const NEW = "new.admin@test.com";
const adminRows = (page: Page) => page.locator(".admins-table tbody tr");
/** The row whose email cell is exactly `email` (other rows may mention it as "added by"). */
const rowOf = (page: Page, email: string) =>
  adminRows(page).filter({
    has: page.locator("td:first-child", { hasText: new RegExp(`^${email.replace(/[.]/g, "\\.")}$`) }),
  });

async function addViaForm(page: Page, email: string, level: "מנהל" | "מנהל ראשי" = "מנהל") {
  await page.getByLabel("מייל").fill(email);
  await page.locator(".levels label", { has: page.locator("strong", { hasText: new RegExp(`^${level}$`) }) }).click();
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
}

test.describe("the list", () => {
  test("lists the admins with their level, and marks you", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await tab(page, "מנהלים");
    await expect(adminRows(page)).toHaveCount(2);
    await expect(rowOf(page, ADMIN).locator(".level-badge")).toHaveText("מנהל ראשי");
    await expect(rowOf(page, STAFF).locator(".level-badge")).toHaveText("מנהל");
    await expect(rowOf(page, ADMIN)).toContainText("(את/ה)");
  });

  test("you have no buttons on your own row", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "מנהלים");
    await expect(rowOf(page, ADMIN).getByRole("button")).toHaveCount(0);
  });

  test("an admin added in the DB shows a dash as 'added by'", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "מנהלים");
    await expect(rowOf(page, ADMIN).locator("td").nth(2)).toHaveText("–");
  });

  test("the header shows your level", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await expect(page.locator(".admin-bar .level-badge")).toHaveText("מנהל ראשי");
    await page.evaluate((v) => sessionStorage.setItem("identity:admin", v), identity(STAFF));
    await page.addInitScript((v) => sessionStorage.setItem("identity:admin", v), identity(STAFF));
    await page.reload();
    await expect(page.locator(".admin-bar .level-badge")).toHaveText("מנהל");
  });
});

test.describe("a full admin (מנהל ראשי)", () => {
  test("sees the add form with both levels, standard selected by default", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "מנהלים");
    await expect(page.getByRole("heading", { name: "הוספת מנהל" })).toBeVisible();
    const radios = page.locator(".levels input[type=radio]");
    await expect(radios).toHaveCount(2);
    await expect(radios.first()).toBeChecked();
    await expect(page.locator(".levels")).toContainText("הכול חוץ מניהול מנהלים");
    await expect(page.locator(".levels")).toContainText("כולל הוספה, שינוי והסרה של מנהלים");
  });

  test("adds a standard admin by default", async ({ page, api, open }) => {
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, NEW);
    await expect(rowOf(page, NEW).locator(".level-badge")).toHaveText("מנהל");
    expect(api.admins.find((a) => a.email === NEW)).toMatchObject({ roles: STANDARD, added_by: ADMIN });
  });

  test("adds a full admin when chosen", async ({ page, api, open }) => {
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, NEW, "מנהל ראשי");
    await expect(rowOf(page, NEW).locator(".level-badge")).toHaveText("מנהל ראשי");
    expect(api.admins.find((a) => a.email === NEW)?.roles).toEqual(FULL);
  });

  test("after adding: a Google test-users reminder, the form cleared and back to standard", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, NEW, "מנהל ראשי");
    await expect(page.locator(".notice")).toContainText("Test users");
    await expect(page.getByLabel("מייל")).toHaveValue("");
    await expect(page.locator(".levels input[type=radio]").first()).toBeChecked();
  });

  test("the email is stored lowercase", async ({ page, api, open }) => {
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, "New.Admin@Test.COM");
    await expect(adminRows(page)).toHaveCount(2);
    expect(api.admins[1]?.email).toBe(NEW);
  });

  test("adding an existing admin explains it and changes nothing", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, STAFF, "מנהל ראשי");
    await expect(page.locator(".error")).toHaveText("המייל הזה כבר ברשימת המנהלים.");
    expect(api.admins.find((a) => a.email === STAFF)?.roles).toEqual(STANDARD);
  });

  test("an empty email is not sent, and a standard message says so", async ({ page, api, open }) => {
    await open();
    await tab(page, "מנהלים");
    await page.getByRole("button", { name: "הוספה", exact: true }).click();
    await expect(page.locator(".field-error")).toHaveText("יש להזין כתובת מייל.");
    expect(api.called("POST", /^\/admins$/)).toHaveLength(0);
  });

  const badEmails = ["admin", "admin@", "@gmail.com", "admin@gmail", "ad min@gmail.com"];
  for (const bad of badEmails) {
    test(`"${bad}" gets the standard invalid-email message, and nothing is sent`, async ({ page, api, open }) => {
      await open();
      await tab(page, "מנהלים");
      await page.getByLabel("מייל").fill(bad);
      await page.getByRole("button", { name: "הוספה", exact: true }).click();
      await expect(page.locator(".field-error")).toHaveText("כתובת המייל לא תקינה. לדוגמה: name@gmail.com");
      expect(api.called("POST", /^\/admins$/)).toHaveLength(0);
    });
  }

  test("the browser's own validation bubble is off", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "מנהלים");
    await expect(page.locator("form.form")).toHaveAttribute("novalidate", "");
  });

  test("the field message disappears as soon as you type", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "מנהלים");
    await page.getByLabel("מייל").fill("admin");
    await page.getByRole("button", { name: "הוספה", exact: true }).click();
    await expect(page.locator(".field-error")).toBeVisible();
    await page.getByLabel("מייל").pressSequentially("@gmail.com");
    await expect(page.locator(".field-error")).toHaveCount(0);
  });

  test("a valid email after a mistake is added", async ({ page, api, open }) => {
    await open();
    await tab(page, "מנהלים");
    await page.getByLabel("מייל").fill("new.admin");
    await page.getByRole("button", { name: "הוספה", exact: true }).click();
    await page.getByLabel("מייל").fill(NEW);
    await page.getByRole("button", { name: "הוספה", exact: true }).click();
    await expect(rowOf(page, NEW)).toHaveCount(1);
    void api;
  });

  test("promotes a standard admin to full after confirming", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await tab(page, "מנהלים");
    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      void d.accept();
    });
    await rowOf(page, STAFF).getByRole("button", { name: "הפיכה למנהל ראשי" }).click();
    await expect(rowOf(page, STAFF).locator(".level-badge")).toHaveText("מנהל ראשי");
    expect(message).toContain("מנהל ראשי");
    expect(api.admins.find((a) => a.email === STAFF)?.roles).toEqual(FULL);
  });

  test("demotes a full admin to standard", async ({ page, api, open }) => {
    api.admins.push({ email: NEW, roles: [...FULL], added_by: ADMIN, created_at: new Date().toISOString() });
    await open();
    await tab(page, "מנהלים");
    page.once("dialog", (d) => d.accept());
    await rowOf(page, NEW).getByRole("button", { name: "הפיכה למנהל", exact: true }).click();
    await expect(rowOf(page, NEW).locator(".level-badge")).toHaveText("מנהל");
    expect(api.admins.find((a) => a.email === NEW)?.roles).toEqual(STANDARD);
  });

  test("cancelling a level change keeps the level", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await tab(page, "מנהלים");
    page.once("dialog", (d) => d.dismiss());
    await rowOf(page, STAFF).getByRole("button", { name: "הפיכה למנהל ראשי" }).click();
    await expect(rowOf(page, STAFF).locator(".level-badge")).toHaveText("מנהל");
    expect(api.called("PUT", /roles$/)).toHaveLength(0);
  });

  test("removes an admin after confirming", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await tab(page, "מנהלים");
    page.once("dialog", (d) => d.accept());
    await rowOf(page, STAFF).getByRole("button", { name: "הסרה" }).click();
    await expect(adminRows(page)).toHaveCount(1);
    expect(api.admins.map((a) => a.email)).toEqual([ADMIN]);
  });

  test("cancelling the removal keeps the admin", async ({ page, api, open }) => {
    api.addStaff();
    await open();
    await tab(page, "מנהלים");
    page.once("dialog", (d) => d.dismiss());
    await rowOf(page, STAFF).getByRole("button", { name: "הסרה" }).click();
    await expect(adminRows(page)).toHaveCount(2);
  });

  test("a full admin added in the console can add admins too", async ({ page, api, open }) => {
    api.admins.push({ email: NEW, roles: [...FULL], added_by: ADMIN, created_at: new Date().toISOString() });
    await open(NEW);
    await tab(page, "מנהלים");
    await addViaForm(page, "third@test.com");
    await expect(adminRows(page)).toHaveCount(3);
    expect(api.admins.find((a) => a.email === "third@test.com")?.added_by).toBe(NEW);
  });

  test("a server error when adding is shown", async ({ page, api, open }) => {
    api.fail({ method: "POST", path: /^\/admins$/, status: 500 });
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, NEW);
    await expect(page.locator(".error")).toHaveText("משהו השתבש בשרת. נסו שוב בעוד רגע.");
  });
});

test.describe("a standard admin (מנהל)", () => {
  test("sees the list but no add form, with an explanation", async ({ page, api, open }) => {
    api.addStaff();
    await open(STAFF);
    await tab(page, "מנהלים");
    await expect(adminRows(page)).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "הוספת מנהל" })).toHaveCount(0);
    await expect(page.locator(".standard-notice")).toContainText("רק מנהל ראשי");
  });

  test("has no change or remove buttons on any row", async ({ page, api, open }) => {
    api.addStaff();
    await open(STAFF);
    await tab(page, "מנהלים");
    await expect(page.locator(".admins-table button")).toHaveCount(0);
  });

  test("still has every other tab and can handle inquiries", async ({ page, api, open }) => {
    api.addStaff();
    const inquiry = api.addInquiry();
    await open(STAFF);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await page.locator(".requests-table tbody tr").first().click();
    await page.locator("aside.detail").getByRole("button", { name: "לקחת לטיפול" }).click();
    // A status change closes the panel, so the result is checked on the server.
    await expect
      .poll(() => api.inquiries.find((x) => x.id === inquiry.id))
      .toMatchObject({ status: "in_progress", handled_by: STAFF });
  });

  test("can moderate the chat", async ({ page, api, open }) => {
    api.addStaff();
    api.addReported();
    await open(STAFF);
    await tab(page, "ניהול הצ'אט");
    await page.getByRole("button", { name: "התעלמות (ההודעה נשארת)" }).click();
    await expect(page.locator("article.report-card")).toHaveCount(0);
    expect(api.actions[0]).toMatchObject({ action: "dismiss", admin_email: STAFF });
  });

  test("the server refuses admin management for them anyway", async ({ page, api, open }) => {
    api.addStaff();
    await open(STAFF);
    const status = await page.evaluate(async () => {
      const id = JSON.parse(sessionStorage.getItem("identity:admin")!);
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { Authorization: `Bearer ${id.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "sneaky@test.com" }),
      });
      return res.status;
    });
    expect(status).toBe(403);
    expect(api.admins.some((a) => a.email === "sneaky@test.com")).toBe(false);
  });
});

test.describe("access changes apply at once", () => {
  test("an admin added in the console can sign in", async ({ page, api, open }) => {
    await open();
    await tab(page, "מנהלים");
    await addViaForm(page, NEW);
    await expect(adminRows(page)).toHaveCount(2);
    await page.evaluate((v) => sessionStorage.setItem("identity:admin", v), identity(NEW));
    await page.addInitScript((v) => sessionStorage.setItem("identity:admin", v), identity(NEW));
    await page.reload();
    await expect(page.locator(".admin-bar")).toContainText(NEW);
    void api;
  });

  test("a removed admin loses access", async ({ page, api, open }) => {
    api.addStaff();
    await open(STAFF);
    await expect(page.locator(".counters")).toBeVisible();
    api.admins = api.admins.filter((a) => a.email !== STAFF);
    await page.reload();
    await expect(page.getByRole("heading", { name: "אין הרשאה" })).toBeVisible();
  });

  test("a promoted admin gets the add form after a reload", async ({ page, api, open }) => {
    api.addStaff();
    await open(STAFF);
    await tab(page, "מנהלים");
    await expect(page.getByRole("heading", { name: "הוספת מנהל" })).toHaveCount(0);
    api.admins.find((a) => a.email === STAFF)!.roles = [...FULL];
    await page.reload();
    await tab(page, "מנהלים");
    await expect(page.getByRole("heading", { name: "הוספת מנהל" })).toBeVisible();
  });
});
