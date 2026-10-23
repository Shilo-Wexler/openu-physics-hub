/** The "ניהול הצ'אט" tab: reported messages, blocked users and the action log. */

import { ADMIN, USER_A, USER_B, expect, tab, test } from "./fixtures";

type Page = import("@playwright/test").Page;
const cards = (page: Page) => page.locator("article.report-card");
async function chatView(page: Page, name: "הודעות מדווחות" | "משתמשים חסומים" | "יומן פעולות") {
  await page.locator(".segmented button", { hasText: name }).click();
}

test.describe("reported messages", () => {
  test("each reported message is a card with author, course, reports, text and history", async ({ page, api, open }) => {
    api.addReported({ author_nickname: "spammer_dev", course_name: "מכניקה", report_count: 3, content: "קנו פתרונות!", author_reported_count: 2, author_removed_count: 1 });
    await open();
    await tab(page, "ניהול הצ'אט");
    const card = cards(page).first();
    await expect(card).toContainText("spammer_dev");
    await expect(card).toContainText("מכניקה");
    await expect(card.locator(".badge-danger")).toHaveText("3 דיווחים");
    await expect(card.locator(".body-text")).toHaveText("קנו פתרונות!");
    await expect(card).toContainText("2 הודעות שדווחו, 1 הוסרו");
  });

  test("the reported view is the default sub-view", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "ניהול הצ'אט");
    await expect(page.locator(".segmented button.active")).toHaveText("הודעות מדווחות");
  });

  test("no reports: a friendly empty message", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "ניהול הצ'אט");
    await expect(page.getByText("אין הודעות מדווחות.")).toBeVisible();
  });

  test("ignore closes the reports, removes the card and is logged with the admin", async ({ page, api, open }) => {
    const m = api.addReported();
    await open();
    await tab(page, "ניהול הצ'אט");
    await page.getByRole("button", { name: "התעלמות (ההודעה נשארת)" }).click();
    await expect(cards(page)).toHaveCount(0);
    expect(api.actions[0]).toMatchObject({ action: "dismiss", message_id: m.message_id, admin_email: ADMIN });
  });

  test("remove asks first, then removes the message and logs it", async ({ page, api, open }) => {
    const m = api.addReported();
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "הסרת ההודעה" }).click();
    await expect(cards(page)).toHaveCount(0);
    expect(api.removed[m.author_id]?.[0]?.message_id).toBe(m.message_id);
    expect(api.actions[0]).toMatchObject({ action: "remove", message_id: m.message_id });
  });

  test("cancelling remove keeps the message", async ({ page, api, open }) => {
    api.addReported();
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "הסרת ההודעה" }).click();
    await expect(cards(page)).toHaveCount(1);
    expect(api.actions).toHaveLength(0);
  });

  test("removing one message updates the author's history on their other cards", async ({ page, api, open }) => {
    api.addReported({ message_id: 1, content: "ראשונה" });
    api.addReported({ message_id: 2, content: "שנייה" });
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.accept());
    await cards(page).first().getByRole("button", { name: "הסרת ההודעה" }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("1 הוסרו");
  });

  test("block author asks first and marks every card of that author", async ({ page, api, open }) => {
    api.addReported({ message_id: 1 });
    api.addReported({ message_id: 2 });
    api.addReported({ message_id: 3, author_id: USER_B, author_nickname: "polite_student" });
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.accept());
    await cards(page).first().getByRole("button", { name: "חסימת הכותב", exact: true }).click();
    await expect(cards(page).filter({ hasText: "spammer_dev" }).locator(".badge-closed")).toHaveCount(2);
    await expect(cards(page).filter({ hasText: "polite_student" }).locator(".badge-closed")).toHaveCount(0);
    expect(api.actions[0]).toMatchObject({ action: "block", user_id: USER_A });
  });

  test("a blocked author's card offers unblock instead of block", async ({ page, api, open }) => {
    api.addReported({ author_blocked: true });
    await open();
    await tab(page, "ניהול הצ'אט");
    await expect(page.getByRole("button", { name: "ביטול חסימת הכותב", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "חסימת הכותב", exact: true })).toHaveCount(0);
  });

  test("unblocking from the card works and is logged", async ({ page, api, open }) => {
    api.addReported({ author_blocked: true });
    api.chatBlocked.push({ user_id: USER_A, nickname: "spammer_dev", blocked_at: new Date().toISOString(), removed_count: 0 });
    await open();
    await tab(page, "ניהול הצ'אט");
    await page.getByRole("button", { name: "ביטול חסימת הכותב", exact: true }).click();
    await expect(page.getByRole("button", { name: "חסימת הכותב", exact: true })).toBeVisible();
    expect(api.actions[0]).toMatchObject({ action: "unblock", user_id: USER_A });
  });

  test("cancelling the block changes nothing", async ({ page, api, open }) => {
    api.addReported();
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "חסימת הכותב", exact: true }).click();
    expect(api.chatBlocked).toHaveLength(0);
  });

  test("a failed action shows a message and keeps the card", async ({ page, api, open }) => {
    api.addReported({ message_id: 7 });
    api.fail({ method: "POST", path: /^\/chat\/messages\/7\/remove$/, status: 404, detail: "message not found" });
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "הסרת ההודעה" }).click();
    await expect(page.locator(".error")).toHaveText("ההודעה לא נמצאה. ייתכן שכבר הוסרה.");
    await expect(cards(page)).toHaveCount(1);
  });
});

test.describe("chat not reachable", () => {
  test("not configured (503): a notice, not an error", async ({ page, api, open }) => {
    api.chatStatus = 503;
    await open();
    await tab(page, "ניהול הצ'אט");
    await expect(page.locator(".notice")).toHaveText("ניהול הצ'אט עוד לא מוגדר בשרת.");
  });

  test("chat backend down (502): an error", async ({ page, api, open }) => {
    api.chatStatus = 502;
    await open();
    await tab(page, "ניהול הצ'אט");
    await expect(page.locator(".error")).toHaveText("שרת הצ'אט לא זמין כרגע. נסו שוב בעוד רגע.");
  });

  test("the rest of the console keeps working when the chat is down", async ({ page, api, open }) => {
    api.chatStatus = 502;
    api.addInquiry();
    await open();
    await tab(page, "ניהול הצ'אט");
    await tab(page, "פניות");
    await expect(page.locator(".requests-table tbody tr")).toHaveCount(1);
  });
});

test.describe("blocked chat users", () => {
  test("lists blocked users with nickname and removed count", async ({ page, api, open }) => {
    api.chatBlocked.push({ user_id: USER_A, nickname: "spammer_dev", blocked_at: new Date().toISOString(), removed_count: 0 });
    await open();
    await tab(page, "ניהול הצ'אט");
    await chatView(page, "משתמשים חסומים");
    await expect(page.locator("tbody tr").first()).toContainText("spammer_dev");
  });

  test("no blocked users: a message", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "ניהול הצ'אט");
    await chatView(page, "משתמשים חסומים");
    await expect(page.getByText("אין משתמשים חסומים בצ'אט.")).toBeVisible();
  });

  test("the removed count opens the removed messages", async ({ page, api, open }) => {
    api.chatBlocked.push({ user_id: USER_A, nickname: "spammer_dev", blocked_at: new Date().toISOString(), removed_count: 1 });
    api.removed[USER_A] = [
      { message_id: 9, course_id: 20215, course_name: "מכניקה", content: "הודעה שהוסרה", created_at: new Date().toISOString(), removed_at: new Date().toISOString() },
    ];
    await open();
    await tab(page, "ניהול הצ'אט");
    await chatView(page, "משתמשים חסומים");
    await page.getByRole("button", { name: /1 ▼/ }).click();
    await expect(page.locator(".removed-list")).toContainText("הודעה שהוסרה");
    await page.getByRole("button", { name: /1 ▲/ }).click();
    await expect(page.locator(".removed-list")).toHaveCount(0);
  });

  test("unblocking asks first and removes the user from the list", async ({ page, api, open }) => {
    api.chatBlocked.push({ user_id: USER_A, nickname: "spammer_dev", blocked_at: new Date().toISOString(), removed_count: 0 });
    await open();
    await tab(page, "ניהול הצ'אט");
    await chatView(page, "משתמשים חסומים");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "ביטול חסימה", exact: true }).click();
    await expect(page.getByText("אין משתמשים חסומים בצ'אט.")).toBeVisible();
    expect(api.actions[0]).toMatchObject({ action: "unblock", user_id: USER_A });
  });

  test("a user blocked from a card shows up in the blocked list", async ({ page, api, open }) => {
    api.addReported();
    await open();
    await tab(page, "ניהול הצ'אט");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "חסימת הכותב", exact: true }).click();
    await expect(page.getByRole("button", { name: "ביטול חסימת הכותב", exact: true })).toBeVisible();
    await chatView(page, "משתמשים חסומים");
    await expect(page.locator("tbody tr").first()).toContainText("spammer_dev");
  });
});

test.describe("action log", () => {
  test("empty log: a message", async ({ page, api, open }) => {
    void api;
    await open();
    await tab(page, "ניהול הצ'אט");
    await chatView(page, "יומן פעולות");
    await expect(page.getByText("עוד לא בוצעו פעולות.")).toBeVisible();
  });

  test("actions appear newest first, with Hebrew labels, the admin and the target", async ({ page, api, open }) => {
    const m = api.addReported();
    await open();
    await tab(page, "ניהול הצ'אט");
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "חסימת הכותב", exact: true }).click();
    await expect(page.getByRole("button", { name: "ביטול חסימת הכותב", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "התעלמות (ההודעה נשארת)" }).click();
    await expect(cards(page)).toHaveCount(0);
    await chatView(page, "יומן פעולות");
    const log = page.locator("tbody tr");
    await expect(log.locator("td:nth-child(3)")).toHaveText(["התעלמות מדיווחים", "חסימת משתמש"]);
    await expect(log.first().locator("td:nth-child(2)")).toHaveText(ADMIN);
    await expect(log.first().locator("td:nth-child(4)")).toHaveText(`message #${m.message_id}`);
    await expect(log.nth(1).locator("td:nth-child(4)")).toHaveText(`user ${USER_A}`);
  });
});
