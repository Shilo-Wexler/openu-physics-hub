/** Form checks done in the page, before anything is sent, with the same wording everywhere. */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** null when the email is fine; otherwise the message to show under the field. */
export function emailError(value: string): string | null {
  const email = value.trim();
  if (!email) return "יש להזין כתובת מייל.";
  if (email.length > 254) return "כתובת המייל ארוכה מדי.";
  if (!EMAIL.test(email)) return "כתובת המייל לא תקינה. לדוגמה: name@gmail.com";
  return null;
}
