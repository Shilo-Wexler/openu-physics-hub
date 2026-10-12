/** Typed calls to the chat backend. Shapes mirror the JSON that chat-backend/app/routes returns. */

import { request } from "./client";

const BASE = "/api/chat";

// ---- Types -------------------------------------------------------------

export interface Course {
  id: number;
  name: string;
  avg_difficulty: number | null; // null until someone rates the course
  avg_recommendation: number | null;
  ratings_count: number;
}

export interface Rating {
  difficulty: number; // 1-5
  recommendation: number; // 1-5
}

export interface CourseDetails extends Course {
  my_rating: Rating | null; // null for guests and for users who have not rated
}

export interface Me {
  user_id: string;
  nickname: string;
  avatar: string; // a key from AVATARS in components/Avatar.tsx
}

// Fields every review and reply has.
interface MessageFields {
  id: number;
  created_at: string; // ISO date-time
  edited_at: string | null;
  like_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
}

// The text of a message, or nothing when it was deleted. `deleted` tells TypeScript which
// case it is: after `if (!review.deleted)`, nickname and content are known to be strings.
type Text =
  | { deleted: false; nickname: string; avatar: string; content: string }
  | { deleted: true; nickname: null; avatar: null; content: null };

// A top-level message. A deleted review is still listed while it has replies.
export type Review = MessageFields &
  Text & {
    reply_count: number; // active replies under it
  };

// A message in the discussion under a review. The server never sends deleted replies.
export type Reply = MessageFields & {
  deleted: false;
  nickname: string;
  avatar: string;
  content: string;
  reply_to_id: number | null; // the reply it quotes; null when it just answers the review
  reply_to_deleted: boolean; // the quoted reply was deleted, so the quote shows "deleted"
  reply_to_nickname: string | null; // null when there is no quote or it was deleted
  reply_to_content: string | null;
};

export type ReviewSort = "new" | "top";

export interface ReviewPage {
  messages: Review[];
  next_before: number | null; // pass as `before` for the next page; null means no more
}

export interface ReplyPage {
  replies: Reply[]; // oldest first
  next_after: number | null; // pass as `after` for the next page; null means no more
}

// What a shared link (/courses/{id}/m/{messageId}) opens: the review to show on top, and
// the reply to point at when the link is to a reply.
export interface SharedMessage {
  course_id: number;
  review: Review;
  reply_id: number | null;
}

export interface NewMessage {
  id: number;
  thread_id: number | null; // the review a new reply went under; null for a new review
  reply_to_id: number | null;
  created_at: string;
}

// ---- Auth and profile --------------------------------------------------

export function signInWithGoogle(idToken: string) {
  return request<{ user_id: string }>(`${BASE}/auth/google`, {
    method: "POST",
    body: { id_token: idToken },
  });
}

export function logout() {
  return request<{ status: string }>(`${BASE}/auth/logout`, { method: "POST" });
}

export function logoutAll() {
  return request<{ status: string }>(`${BASE}/auth/logout-all`, { method: "POST" });
}

export function getMe(signal?: AbortSignal) {
  return request<Me>(`${BASE}/me`, { signal });
}

export function changeNickname(nickname: string) {
  return request<{ nickname: string }>(`${BASE}/me/nickname`, {
    method: "PUT",
    body: { nickname },
  });
}

export function changeAvatar(avatar: string) {
  return request<{ avatar: string }>(`${BASE}/me/avatar`, {
    method: "PUT",
    body: { avatar },
  });
}

// ---- Courses and ratings -----------------------------------------------

export function listCourses(signal?: AbortSignal) {
  return request<Course[]>(`${BASE}/courses`, { signal });
}

export function getCourse(courseId: number, signal?: AbortSignal) {
  return request<CourseDetails>(`${BASE}/courses/${courseId}`, { signal });
}

export function rateCourse(courseId: number, rating: Rating) {
  return request<Rating>(`${BASE}/courses/${courseId}/rating`, {
    method: "PUT",
    body: rating,
  });
}

// ---- Reviews and replies -----------------------------------------------

export function listReviews(
  courseId: number,
  { sort = "new", before }: { sort?: ReviewSort; before?: number } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ sort });
  if (before !== undefined) query.set("before", String(before));
  return request<ReviewPage>(`${BASE}/courses/${courseId}/messages?${query}`, { signal });
}

export function listReplies(reviewId: number, after?: number, signal?: AbortSignal) {
  const query = after === undefined ? "" : `?after=${after}`;
  return request<ReplyPage>(`${BASE}/messages/${reviewId}/replies${query}`, { signal });
}

/** The review of a shared message. 404 when the message was deleted or never existed. */
export function getSharedMessage(messageId: number, signal?: AbortSignal) {
  return request<SharedMessage>(`${BASE}/messages/${messageId}`, { signal });
}

/** A new review, or a reply when replyToId is given (a review or another reply). */
export function postMessage(courseId: number, content: string, replyToId?: number) {
  return request<NewMessage>(`${BASE}/courses/${courseId}/messages`, {
    method: "POST",
    body: { content, reply_to_id: replyToId ?? null },
  });
}

export function editMessage(messageId: number, content: string) {
  return request<{ id: number; edited_at: string }>(`${BASE}/messages/${messageId}`, {
    method: "PUT",
    body: { content },
  });
}

export function deleteMessage(messageId: number) {
  return request<{ status: string }>(`${BASE}/messages/${messageId}`, { method: "DELETE" });
}

export function likeMessage(messageId: number) {
  return request<{ liked: boolean }>(`${BASE}/messages/${messageId}/like`, { method: "PUT" });
}

export function unlikeMessage(messageId: number) {
  return request<{ liked: boolean }>(`${BASE}/messages/${messageId}/like`, { method: "DELETE" });
}

export function reportMessage(messageId: number) {
  return request<{ status: string }>(`${BASE}/messages/${messageId}/report`, { method: "POST" });
}