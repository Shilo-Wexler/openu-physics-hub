/** The requests tab: counters, views, Gmail-style shading, filters and paging. */

import { counter, expect, rows, test, view } from "./fixtures";

test.describe("counters", () => {
  test("show unread, in progress, closed and total from the data", async ({ page, api, open }) => {
    api.addRequest();
    api.addRequest({ is_opened: true });
    api.addRequest({ is_opened: true, status: "closed" });
    api.addRequest({ is_opened: true, status: "closed" });
    await open();
    await expect(counter(page, "לא נקראו")).toHaveText("1");
    await expect(counter(page, "בטיפול")).toHaveText("1");
    await expect(counter(page, "נסגרו")).toHaveText("2");
    await expect(counter(page, 'סה"כ')).toHaveText("4");
  });

  test("all zero when there are no requests", async ({ page, api, open }) => {
    void api;
    await open();
    for (const label of ["לא נקראו", "בטיפול", "נסגרו", 'סה"כ']) await expect(counter(page, label)).toHaveText("0");
  });

  test("the unread box is the highlighted one", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page.locator(".counter-box.highlight")).toContainText("לא נקראו");
    await expect(page.locator(".counter-box.highlight")).toHaveCount(1);
  });
});

test.describe("views", () => {
  test("the default view is the unread queue, oldest first", async ({ page, api, open }) => {
    api.addMany(3);
    await open();
    await expect(rows(page).locator(".preview")).toHaveText(["פנייה 1", "פנייה 2", "פנייה 3"]);
    await expect(page.locator(".segmented button.active")).toHaveText("לא נקראו");
  });

  test("the unread queue leaves out read and closed requests", async ({ page, api, open }) => {
    api.addRequest({ body: "חדשה" });
    api.addRequest({ body: "בטיפול", is_opened: true });
    api.addRequest({ body: "סגורה", is_opened: true, status: "closed" });
    await open();
    await expect(rows(page).locator(".preview")).toHaveText(["חדשה"]);
  });

  const cases = [
    { name: "בטיפול" as const, expected: ["בטיפול"] },
    { name: "סגורות" as const, expected: ["סגורה"] },
    { name: "הכל" as const, expected: ["סגורה", "בטיפול", "חדשה"] }, // newest first
  ];
  for (const c of cases) {
    test(`the "${c.name}" view shows only its requests`, async ({ page, api, open }) => {
      api.addRequest({ body: "חדשה", minutesOld: 30 });
      api.addRequest({ body: "בטיפול", is_opened: true, minutesOld: 20 });
      api.addRequest({ body: "סגורה", is_opened: true, status: "closed", minutesOld: 10 });
      await open();
      await view(page, c.name);
      await expect(rows(page).locator(".preview")).toHaveText(c.expected);
      await expect(page.locator(".segmented button.active")).toHaveText(c.name);
    });
  }

  test("an empty view says there is nothing to show", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page.getByText("אין פניות להצגה.")).toBeVisible();
    await expect(page.locator(".requests-table")).toHaveCount(0);
  });

  test("a failed load shows an error", async ({ page, api, open }) => {
    api.fail({ method: "GET", path: /^\/requests$/, status: 500 });
    await open();
    await expect(page.getByRole("alert")).toHaveText("לא הצלחנו לטעון את הפניות. נסו לרענן את הדף.");
  });

  test("no connection: the load error says so", async ({ page, api, open }) => {
    void api;
    await page.route("**/api/admin/requests?**", (route) => route.abort());
    await open();
    await expect(page.getByRole("alert")).toContainText("אין חיבור לשרת, ולכן לא הצלחנו לטעון את הפניות");
  });
});

test.describe("Gmail-style shading", () => {
  const states = [
    { fields: {}, cls: "state-new" },
    { fields: { is_opened: true }, cls: "state-open" },
    { fields: { is_opened: true, status: "closed" as const }, cls: "state-closed" },
  ];
  for (const s of states) {
    test(`a row gets the ${s.cls} class`, async ({ page, api, open }) => {
      api.addRequest(s.fields);
      await open();
      await view(page, "הכל");
      await expect(rows(page).first()).toHaveClass(new RegExp(s.cls));
    });
  }

  test("new rows are bold, the others are not", async ({ page, api, open }) => {
    api.addRequest({ body: "חדשה", minutesOld: 3 });
    api.addRequest({ body: "בטיפול", is_opened: true, minutesOld: 2 });
    await open();
    await view(page, "הכל");
    const weights = await rows(page).evaluateAll((trs) => trs.map((tr) => getComputedStyle(tr).fontWeight));
    expect(weights).toEqual(["400", "700"]); // newest first: in progress, then new
  });

  test("the three states have three different backgrounds", async ({ page, api, open }) => {
    api.addRequest({ minutesOld: 3 });
    api.addRequest({ is_opened: true, minutesOld: 2 });
    api.addRequest({ is_opened: true, status: "closed", minutesOld: 1 });
    await open();
    await view(page, "הכל");
    await page.mouse.move(0, 0); // no hover colour
    const bgs = await rows(page).evaluateAll((trs) => trs.map((tr) => getComputedStyle(tr).backgroundColor));
    expect(new Set(bgs).size).toBe(3);
  });

  test("closed rows use the muted text colour", async ({ page, api, open }) => {
    api.addRequest({ is_opened: true, status: "closed" });
    api.addRequest({ minutesOld: 500 });
    await open();
    await view(page, "הכל");
    const [closed, fresh] = await rows(page).evaluateAll((trs) => trs.map((tr) => getComputedStyle(tr).color));
    expect(closed).not.toBe(fresh);
  });

  test("a legend explains the three shades", async ({ page, api, open }) => {
    void api;
    await open();
    await expect(page.locator(".legend .state-swatch")).toHaveText(["חדשה", "בטיפול", "סגורה"]);
  });

  test("there is no status column any more", async ({ page, api, open }) => {
    api.addRequest();
    await open();
    await expect(page.locator(".requests-table thead th")).toHaveText(["תאריך", "שם", "קורס", "תקציר"]);
  });

  test("the shading also works in dark mode", async ({ page, api, open }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    api.addRequest({ minutesOld: 2 });
    api.addRequest({ is_opened: true, status: "closed", minutesOld: 1 });
    await open();
    await view(page, "הכל");
    await page.mouse.move(0, 0);
    const bgs = await rows(page).evaluateAll((trs) => trs.map((tr) => getComputedStyle(tr).backgroundColor));
    expect(bgs[0]).not.toBe(bgs[1]);
    expect(bgs).not.toContain("rgb(255, 255, 255)");
  });
});

test.describe("row contents", () => {
  test("a row shows date, name, course and preview", async ({ page, api, open }) => {
    api.addRequest({ full_name: "דנה כהן", course_name: "תרמודינמיקה", body: "שאלה על המטלה" });
    await open();
    const cells = rows(page).first().locator("td");
    await expect(cells.nth(1)).toHaveText("דנה כהן");
    await expect(cells.nth(2)).toHaveText("תרמודינמיקה");
    await expect(cells.nth(3)).toHaveText("שאלה על המטלה");
    await expect(cells.nth(0)).toHaveText(/\d{2}\.\d{2}\.\d{2}|\d{2}\/\d{2}\/\d{2}/);
  });

  test("the preview is cut to 200 characters", async ({ page, api, open }) => {
    api.addRequest({ body: "א".repeat(500) });
    await open();
    expect((await rows(page).first().locator(".preview").textContent())?.length).toBe(200);
  });
});

test.describe("filters", () => {
  test("the course filter lists every course", async ({ page, api, open }) => {
    await open();
    const options = page.getByLabel("סינון לפי קורס").locator("option");
    await expect(options).toHaveCount(api.courses.length + 1);
    await expect(options.first()).toHaveText("כל הקורסים");
  });

  test("filtering by course shows only that course", async ({ page, api, open }) => {
    api.addRequest({ course_name: "מכניקה", body: "מ" });
    api.addRequest({ course_name: "כללי", body: "כ" });
    await open();
    await page.getByLabel("סינון לפי קורס").selectOption("כללי");
    await expect(rows(page).locator(".preview")).toHaveText(["כ"]);
  });

  test("searching by email shows only that sender, ignoring case", async ({ page, api, open }) => {
    api.addRequest({ email: "a@test.com", body: "א" });
    api.addRequest({ email: "b@test.com", body: "ב" });
    await open();
    await page.getByPlaceholder("חיפוש לפי מייל").fill("B@Test.com");
    await page.getByRole("button", { name: "חיפוש", exact: true }).click();
    await expect(rows(page).locator(".preview")).toHaveText(["ב"]);
  });

  test("clearing the email search shows everyone again", async ({ page, api, open }) => {
    api.addRequest({ email: "a@test.com" });
    api.addRequest({ email: "b@test.com" });
    await open();
    const box = page.getByPlaceholder("חיפוש לפי מייל");
    await box.fill("a@test.com");
    await box.press("Enter");
    await expect(rows(page)).toHaveCount(1);
    await box.fill("");
    await box.press("Enter");
    await expect(rows(page)).toHaveCount(2);
  });

  test("filters combine with the view", async ({ page, api, open }) => {
    api.addRequest({ course_name: "כללי", is_opened: true, body: "כללי בטיפול" });
    api.addRequest({ course_name: "כללי", body: "כללי חדשה" });
    api.addRequest({ course_name: "מכניקה", is_opened: true, body: "מכניקה בטיפול" });
    await open();
    await view(page, "בטיפול");
    await page.getByLabel("סינון לפי קורס").selectOption("כללי");
    await expect(rows(page).locator(".preview")).toHaveText(["כללי בטיפול"]);
  });
});

test.describe("paging", () => {
  test("no pager with 20 requests or fewer", async ({ page, api, open }) => {
    api.addMany(20);
    await open();
    await expect(rows(page)).toHaveCount(20);
    await expect(page.locator(".pager")).toHaveCount(0);
  });

  test("21 requests make two pages", async ({ page, api, open }) => {
    api.addMany(21);
    await open();
    await expect(page.locator(".pager")).toContainText("עמוד 1 מתוך 2 (21 פניות)");
    await expect(page.getByRole("button", { name: "הקודם" })).toBeDisabled();
  });

  test("next and previous move between pages", async ({ page, api, open }) => {
    api.addMany(45);
    await open();
    await page.getByRole("button", { name: "הבא" }).click();
    await expect(page.locator(".pager")).toContainText("עמוד 2 מתוך 3");
    await expect(rows(page).first().locator(".preview")).toHaveText("פנייה 21");
    await page.getByRole("button", { name: "הבא" }).click();
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByRole("button", { name: "הבא" })).toBeDisabled();
    await page.getByRole("button", { name: "הקודם" }).click();
    await expect(page.locator(".pager")).toContainText("עמוד 2 מתוך 3");
  });

  test("changing the view goes back to page 1", async ({ page, api, open }) => {
    api.addMany(25);
    await open();
    await page.getByRole("button", { name: "הבא" }).click();
    await view(page, "הכל");
    await expect(page.locator(".pager")).toContainText("עמוד 1 מתוך 2");
  });

  test("changing the course filter goes back to page 1", async ({ page, api, open }) => {
    api.addMany(25);
    await open();
    await page.getByRole("button", { name: "הבא" }).click();
    await page.getByLabel("סינון לפי קורס").selectOption("מכניקה");
    await expect(page.locator(".pager")).toContainText("עמוד 1 מתוך 2");
  });
});
