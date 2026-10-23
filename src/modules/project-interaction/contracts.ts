export interface InteractionStats {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}
export interface ProjectComment {
  id: string;
  body: string;
  nickname: string;
  createdAt: string;
  isMine: boolean;
}
export interface CommentPage {
  items: ProjectComment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export type CommentStatus = "visible" | "hidden" | "deleted";
export interface ManagedComment {
  id: string;
  projectId: string;
  projectName: { zh: string; en: string };
  body: string | null;
  nickname: string;
  createdAt: string;
  status: CommentStatus;
  revision: number;
  reason: string | null;
}
export interface ManagedCommentPage {
  items: ManagedComment[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}
export interface ModerationInput {
  revision: number;
  action: "hide" | "restore";
  reason?: string;
}
export interface CommentInput {
  body: string;
  requestId: string;
}
export interface CommentReceipt {
  commentId: string;
  status: CommentStatus;
}
