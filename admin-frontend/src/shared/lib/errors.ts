/**
 * Every error the console shows comes from here, so they all read the same way:
 * one or two plain Hebrew sentences — what happened, and what to do now.
 * The server's `detail` strings (English, stable) are mapped to Hebrew; unknown ones fall back by status.
 */

import { ApiError } from "../api/client";

/** The 503 detail of a chat that is not set up yet: a notice, not a failure (see LoadError). */
export const CHAT_NOT_CONFIGURED = "chat moderation is not configured";

/** Known server details. A "status:detail" key wins over a plain "detail" key. */
const BY_DETAIL: Record<string, string> = {
  // server
  "database unavailable": "השרת לא זמין כרגע. אפשר לנסות שוב בעוד רגע.",
  // levels
  "requires an admin": "חבר ועדה לא יכול לבצע את הפעולה הזו. צריך מנהל או מנהל ראשי.",
  "requires a super admin": "רק מנהל ראשי יכול להוסיף מנהל ראשי, או לשנות ולהסיר מנהל ראשי.",
  // admins
  "already an admin": "המייל הזה כבר ברשימת המנהלים.",
  "you cannot change or remove yourself": "אי אפשר לשנות או להסיר את עצמך. מנהל אחר יכול לעשות את זה.",
  "404:not an admin": "המייל הזה כבר לא ברשימת המנהלים. אפשר לרענן את הדף.",
  "403:not an admin": "אין לחשבון הזה הרשאת מנהל.",
  "invalid email": "כתובת המייל לא תקינה.",
  "invalid role": "התפקיד שנבחר לא תקין.",
  "missing name": "צריך שם.",
  "invalid name": "השם צריך להיות בין 2 ל-40 תווים.",
  // inquiries
  "inquiry not found": "הפנייה לא נמצאה. אפשר לרענן את הדף.",
  "invalid internal_note": "ההערה ארוכה מדי: עד 2000 תווים.",
  // chat
  "message not found": "ההודעה לא נמצאה. ייתכן שכבר הוסרה.",
  "user not found": "המשתמש לא נמצא בצ'אט.",
  [CHAT_NOT_CONFIGURED]: "ניהול הצ'אט עוד לא מוגדר בשרת.",
  "chat backend unavailable": "שרת הצ'אט לא זמין כרגע. אפשר לנסות שוב בעוד רגע.",
  "chat backend rejected the moderation token": "שרת הצ'אט דחה את החיבור. צריך לבדוק ש-MOD_API_TOKEN זהה בשני השרתים.",
  // announcements
  "announcement not found": "ההכרזה לא נמצאה. ייתכן שמישהו אחר מחק אותה. אפשר לרענן את הדף.",
  "announcement is not published": "רק הכרזה מפורסמת יכולה להיות נעוצה בדף הבית. אפשר לרענן את הדף.",
  "invalid title": "הכותרת לא תקינה: צריך בין 1 ל-200 תווים.",
  "missing title": "צריך כותרת.",
  "invalid body": "הטקסט ארוך מדי: עד 5000 תווים.",
  "invalid alt": "תיאור התמונה לא תקין: צריך בין 1 ל-300 תווים.",
  "missing alt": "צריך תיאור קצר לתמונה.",
  "image too large": "התמונה גדולה מדי. אפשר עד 10MB.",
  "unsupported image type": "אפשר להעלות רק תמונות JPEG, PNG או WebP.",
  "not an image": "הקובץ שנבחר אינו תמונה.",
};

/** Fallbacks by HTTP status (0 = the server was not reached). */
const BY_STATUS: Record<number, string> = {
  0: "אין חיבור לשרת. אפשר לבדוק את החיבור ולנסות שוב.",
  401: "ההתחברות פגה. אפשר להתחבר שוב.",
  403: "אין לך הרשאה לפעולה הזו.",
  404: "הפריט לא נמצא. ייתכן שמישהו אחר מחק אותו. אפשר לרענן את הדף.",
  409: "הפעולה לא אפשרית במצב הנוכחי. אפשר לרענן את הדף ולנסות שוב.",
  422: "אחד השדות לא תקין. כדאי לבדוק אותו ולנסות שוב.",
  429: "יותר מדי בקשות בזמן קצר. אפשר לנסות שוב בעוד רגע.",
  502: "שרת הצ'אט לא זמין כרגע. אפשר לנסות שוב בעוד רגע.",
  503: "השירות עוד לא מוגדר בשרת.",
};

const SERVER_ERROR = "משהו השתבש בשרת. אפשר לנסות שוב בעוד רגע.";
const UNKNOWN_ERROR = "משהו השתבש. אפשר לנסות שוב.";

/** The message for a failed action (save, delete, block...). */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return UNKNOWN_ERROR;
  return (
    BY_DETAIL[`${error.status}:${error.message}`] ??
    BY_DETAIL[error.message] ??
    BY_STATUS[error.status] ??
    SERVER_ERROR
  );
}

/** The message for data that failed to load; `what` names it, e.g. "רשימת המנהלים". */
export function loadErrorMessage(what: string, status: number | null, detail: string | null): string {
  if (status === 0) return `אין חיבור לשרת, ולכן לא הצלחנו לטעון את ${what}. אפשר לבדוק את החיבור ולרענן את הדף.`;
  // A server that is down or not set up says so itself; that is more useful than "could not load".
  const known = detail === null ? undefined : BY_DETAIL[detail];
  if (known && (status === 502 || status === 503)) return known;
  if (status === 502) return BY_STATUS[502] ?? SERVER_ERROR;
  return `לא הצלחנו לטעון את ${what}. אפשר לרענן את הדף ולנסות שוב.`;
}
