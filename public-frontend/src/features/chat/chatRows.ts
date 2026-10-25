/** The two chats as LinkRows rows, so the home page and /chat describe them in the same words. */

import { GENERAL_COURSE_ID } from "../../shared/api/chat";
import type { LinkRow } from "../../shared/components/LinkRows";
import { coursePath } from "./share";

export const GENERAL_CHAT_ROW: LinkRow = {
  to: coursePath(GENERAL_COURSE_ID),
  title: "צ'אט כללי",
  text: "שיחה פתוחה על הכול: לימודים, מבחנים ומה שביניהם.",
};

export const COURSE_CHATS_ROW: LinkRow = {
  to: "/courses",
  title: "צ'אט קורסים",
  text: "ביקורות ודירוגים לקורסים.",
};