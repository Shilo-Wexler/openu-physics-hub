/** One request in the side panel: opening marks it read, and every action changes the state. */

import { counter, expect, rows, test, view, type FakeApi } from "./fixtures";

const panel = (page: import("@playwright/test").Page) => page.locator("aside.detail");

async function openFirst(page: import("@playwright/test").Page) {
  await rows(page).first().click();
  await expect(panel(page).locator(".body-text")).toBeVisible();
}

function stored(api: FakeApi, id: number) {
  return api.requests.find((r) => r.id === id);
}

test.describe("opening a request", () => {
  test("clicking a row opens the panel with the request number", async ({ page, api, open }) => {
    const r = api.addRequest();
    await open();
    await openFirst(page);
    await expect(panel(page).getByRole("heading")).toHaveText(`פנייה #${r.id}`);
  });

  test("opening an unread request marks it read on the server", async ({ page, api, open }) => {
    const r = api.addRequest();
    await open();
    await openFirst(page);
    await expect.poll(() => stored(api, r.id)?.is_opened).toBe(true);
    expect(api.called("POST", new RegExp(`^/requests/${r.id}/read$`)).length).toBeGreaterThan(0);
  });

  test("opening an unread request updates the counters", async ({ page, api, open }) => {
    api.addRequest();
    await open();
    await expect(counter(page, "לא נקראו")).toHaveText("1");
    await openFirst(page);
    await expect(counter(page, "לא נקראו")).toHaveText("0");
    await expect(counter(page, "בטיפול")).toHaveText("1");
  });

  test("the opened request leaves the unread queue but its panel stays open", async ({ page, api, open }) => {
    api.addRequest({ body: "נפתחת" });
    await open();
    await openFirst(page);
    await expect(page.getByText("אין פניות להצגה.")).toBeVisible();
    await expect(panel(page).locator(".body-text")).toHaveText("נפתחת");
  });

  test("opening a request that was already read does not mark it again", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    expect(api.called("POST", new RegExp(`^/requests/${r.id}/read$`))).toHaveLength(0);
  });

  test("the panel shows name, email link, course, date and the full text", async ({ page, api, open }) => {
    api.addRequest({ full_name: "דנה כהן", email: "dana@test.com", course_name: "גלים ואופטיקה", body: "שורה ראשונה\nשורה שנייה" });
    await open();
    await openFirst(page);
    const meta = panel(page).locator("dl.meta");
    await expect(meta).toContainText("דנה כהן");
    await expect(meta).toContainText("גלים ואופטיקה");
    await expect(meta.getByRole("link", { name: "dana@test.com" })).toHaveAttribute("href", "mailto:dana@test.com");
    await expect(panel(page).locator(".body-text")).toHaveText("שורה ראשונה\nשורה שנייה");
  });

  test("line breaks in the text are kept", async ({ page, api, open }) => {
    api.addRequest({ body: "א\nב\nג" });
    await open();
    await openFirst(page);
    expect(await panel(page).locator(".body-text").evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-wrap");
  });

  test("the full text is shown even when longer than the preview", async ({ page, api, open }) => {
    api.addRequest({ body: "ב".repeat(1500) });
    await open();
    await openFirst(page);
    expect((await panel(page).locator(".body-text").textContent())?.length).toBe(1500);
  });

  test("the selected row is outlined", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    await expect(rows(page).first()).toHaveClass(/selected/);
  });

  test("the ✕ button closes the panel", async ({ page, api, open }) => {
    api.addRequest();
    await open();
    await openFirst(page);
    await panel(page).getByRole("button", { name: "סגירת החלון" }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("choosing another row shows the other request", async ({ page, api, open }) => {
    api.addRequest({ body: "ראשונה", is_opened: true, minutesOld: 20 });
    api.addRequest({ body: "שנייה", is_opened: true, minutesOld: 10 });
    await open();
    await view(page, "בטיפול");
    await rows(page).nth(0).click();
    await expect(panel(page).locator(".body-text")).toHaveText("שנייה");
    await rows(page).nth(1).click();
    await expect(panel(page).locator(".body-text")).toHaveText("ראשונה");
  });

  test("a request deleted meanwhile shows a not-found message", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    api.fail({ method: "GET", path: new RegExp(`^/requests/${r.id}$`), status: 404, detail: "request not found" });
    await rows(page).first().click();
    await expect(panel(page).locator(".error")).toHaveText("הפנייה לא נמצאה. ייתכן שמישהו אחר מחק אותה.");
  });
});

test.describe("state swatch and buttons per state", () => {
  test("an opened request shows the in-progress swatch", async ({ page, api, open }) => {
    api.addRequest();
    await open();
    await openFirst(page);
    await expect(panel(page).locator(".state-swatch")).toHaveText("בטיפול");
  });

  test("in progress: close, mark unread, block and delete are offered", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    await expect(panel(page).locator(".actions button")).toHaveText(["סגירת הפנייה", "סימון כלא נקראה", "חסימת השולח", "מחיקה"]);
  });

  test("closed: back to handling, block and delete are offered", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true, status: "closed" });
    await open();
    await view(page, "סגורות");
    await openFirst(page);
    await expect(panel(page).locator(".state-swatch")).toHaveText("סגורה");
    await expect(panel(page).locator(".actions button")).toHaveText(["החזרה לטיפול", "חסימת השולח", "מחיקה"]);
  });
});

test.describe("actions", () => {
  test("close: stored as closed, swatch and counters follow", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    await panel(page).getByRole("button", { name: "סגירת הפנייה" }).click();
    await expect(panel(page).locator(".state-swatch")).toHaveText("סגורה");
    expect(stored(api, r.id)?.status).toBe("closed");
    await expect(counter(page, "נסגרו")).toHaveText("1");
    await expect(counter(page, "בטיפול")).toHaveText("0");
  });

  test("back to handling: a closed request becomes in progress again", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true, status: "closed" });
    await open();
    await view(page, "סגורות");
    await openFirst(page);
    await panel(page).getByRole("button", { name: "החזרה לטיפול" }).click();
    await expect(panel(page).locator(".state-swatch")).toHaveText("בטיפול");
    expect(stored(api, r.id)).toMatchObject({ status: "new", is_opened: true });
    await expect(counter(page, "בטיפול")).toHaveText("1");
    await expect(counter(page, "נסגרו")).toHaveText("0");
  });

  test("after going back to handling, the in-progress buttons return", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true, status: "closed" });
    await open();
    await view(page, "סגורות");
    await openFirst(page);
    await panel(page).getByRole("button", { name: "החזרה לטיפול" }).click();
    await expect(panel(page).getByRole("button", { name: "סגירת הפנייה" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "החזרה לטיפול" })).toHaveCount(0);
  });

  test("the closed request leaves the closed view after going back to handling", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true, status: "closed" });
    await open();
    await view(page, "סגורות");
    await openFirst(page);
    await panel(page).getByRole("button", { name: "החזרה לטיפול" }).click();
    await expect(page.getByText("אין פניות להצגה.")).toBeVisible();
  });

  test("mark unread: stored as unread and back in the queue", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true, body: "חוזרת לתור" });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    await panel(page).getByRole("button", { name: "סימון כלא נקראה" }).click();
    await expect(panel(page).locator(".state-swatch")).toHaveText("חדשה");
    expect(stored(api, r.id)?.is_opened).toBe(false);
    await view(page, "לא נקראו");
    await expect(rows(page).locator(".preview")).toHaveText(["חוזרת לתור"]);
  });

  test("a full cycle: read, close, back to handling, close again", async ({ page, api, open }) => {
    const r = api.addRequest();
    await open();
    await openFirst(page);
    const p = panel(page);
    await p.getByRole("button", { name: "סגירת הפנייה" }).click();
    await p.getByRole("button", { name: "החזרה לטיפול" }).click();
    await p.getByRole("button", { name: "סגירת הפנייה" }).click();
    await expect(p.locator(".state-swatch")).toHaveText("סגורה");
    expect(stored(api, r.id)).toMatchObject({ status: "closed", is_opened: true });
  });

  test("a 409 from the server is explained in Hebrew", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true });
    api.fail({ method: "POST", path: new RegExp(`^/requests/${r.id}/close$`), status: 409, detail: "request must be read before closing" });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    await panel(page).getByRole("button", { name: "סגירת הפנייה" }).click();
    await expect(panel(page).locator(".error")).toHaveText("קודם צריך לפתוח את הפנייה, ורק אחר כך לסגור אותה.");
  });

  test("delete after confirming removes the request and closes the panel", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    page.once("dialog", (d) => d.accept());
    await panel(page).getByRole("button", { name: "מחיקה" }).click();
    await expect(panel(page)).toHaveCount(0);
    expect(stored(api, r.id)).toBeUndefined();
    await expect(counter(page, 'סה"כ')).toHaveText("0");
  });

  test("delete asks first, and cancelling keeps the request", async ({ page, api, open }) => {
    const r = api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      void d.dismiss();
    });
    await panel(page).getByRole("button", { name: "מחיקה" }).click();
    await expect(panel(page)).toBeVisible();
    expect(message).toContain("למחוק את הפנייה לצמיתות");
    expect(stored(api, r.id)).toBeDefined();
  });

  test("block sender asks for a reason and blocks the email", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true, email: "spam@test.com" });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    page.once("dialog", (d) => d.accept("ספאם"));
    await panel(page).getByRole("button", { name: "חסימת השולח" }).click();
    await expect(panel(page).locator(".notice")).toContainText("השולח נחסם");
    expect(api.blocked).toMatchObject([{ email: "spam@test.com", reason: "ספאם" }]);
  });

  test("cancelling the block prompt blocks nothing", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true });
    await open();
    await view(page, "בטיפול");
    await openFirst(page);
    page.once("dialog", (d) => d.dismiss());
    await panel(page).getByRole("button", { name: "חסימת השולח" }).click();
    await expect(panel(page).locator(".notice")).toHaveCount(0);
    expect(api.blocked).toHaveLength(0);
  });
});
