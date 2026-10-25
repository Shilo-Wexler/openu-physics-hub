/** Words for the chat moderation log, shared by its list and its action screen. */

import type { MessageState, ModerationAction, ModerationActionType } from "../../shared/api/chat";

export const ACTION_LABEL: Record<ModerationActionType, string> = {
  dismiss: "התעלמות מדיווח",
  remove: "הסרת הודעה",
  block: "חסימת משתמש",
  unblock: "ביטול חסימה",
  reopen: "פתיחת דיווחים מחדש",
  restore: "החזרת הודעה",
};

export const STATE_LABEL: Record<MessageState, string> = {
  active: "בצ'אט",
  removed: "הוסרה על ידי מנהל",
  deleted: "נמחקה על ידי הכותב",
};

/** Shown instead of the author of a message whose author deleted their account. */
export const DELETED_ACCOUNT = "חשבון שנמחק";

/** What undoing each action does, said before it is done. reopen and restore are not undone. */
export const UNDO_EFFECT: Partial<Record<ModerationActionType, string>> = {
  dismiss: "הדיווחים על ההודעה ייפתחו מחדש, וההודעה תחזור לרשימת הדיווחים.",
  remove: "ההודעה תחזור לצ'אט, והדיווחים עליה ייפתחו מחדש כדי להחליט עליה שוב.",
  block: "החסימה תבוטל, והחשבון יוכל שוב לכתוב, לדרג ולדווח.",
  unblock: "החשבון ייחסם שוב: יוכל לקרוא, אבל לא לכתוב, לדרג או לדווח.",
};

/** Who the action was about: the message's author or the user.
 * null when the chat backend was not reached, or the user of a user action deleted their account. */
export function targetName(action: ModerationAction): string | null {
  if (action.message) return action.message.author_nickname ?? DELETED_ACCOUNT;
  return action.user?.nickname ?? null;
}