import type {
  LocalizedText,
  ProjectCategory,
  ProjectDetails,
} from "../project-board/contracts";
import type { ProjectDefinition } from "../project-board/config";
export type ReviewState = "pending" | "approved" | "rejected";
export type PublicationState = "unpublished" | "published" | "withdrawn";
export interface ProjectInput {
  language: "zh" | "en";
  name: string;
  tagline: string;
  description: string;
  translation: { name: string; tagline: string; description: string };
  creator: string;
  category: ProjectCategory;
  eventId: string | null;
  tags: string[];
  coverId: string | null;
  screenshotIds: string[];
  documentId: string | null;
  demoUrl: string;
  videoUrl: string;
  codeUrl: string;
  original: boolean;
  usageAuthorized: boolean;
  publicConsent: boolean;
}
export interface PublicProject extends ProjectDefinition {
  details: ProjectDetails;
}
export interface AssetDto {
  id: string;
  purpose: "cover" | "screenshot" | "document";
  name: string;
  mediaType: string;
  size: number;
  href: string;
}
export interface ProjectSummary {
  id: string;
  source: "user" | "demo";
  name: LocalizedText;
  creator: string;
  eventId: string | null;
  category: ProjectCategory;
  reviewState: ReviewState | null;
  publicationState: PublicationState;
  revision: number;
  draftRevision: number;
  submittedRevision: number;
  liveRevision: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface OwnerProject extends ProjectSummary {
  draft: ProjectInput;
  submitted: ProjectInput | null;
  publicNote: string | null;
  live: PublicProject | null;
  assets: AssetDto[];
  canEdit: boolean;
  editReason: string | null;
  consentRevoked: boolean;
}
export interface ManagedProject extends ProjectSummary {
  submitted: ProjectInput | null;
  submittedAt: string | null;
  live: PublicProject | null;
  preview: PublicProject | null;
  assets: AssetDto[];
  publicNote: string | null;
  internalNote: string | null;
  consentRevoked: boolean;
  history: {
    id: string;
    action: string;
    actor: { label: string };
    createdAt: string;
    before: unknown;
    after: unknown;
  }[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export interface ProjectOptions {
  events: {
    id: string;
    name: LocalizedText;
    opensAt: string;
    closesAt: string;
  }[];
}
export interface ProjectFilters {
  q?: string;
  source?: string;
  eventId?: string;
  category?: string;
  reviewState?: string;
  publicationState?: string;
  page?: number;
}
export interface VersionInput {
  revision: number;
  submittedRevision: number;
}
export const emptyProject = (creator = ""): ProjectInput => ({
  language: "zh",
  name: "",
  tagline: "",
  description: "",
  translation: { name: "", tagline: "", description: "" },
  creator,
  category: "software",
  eventId: null,
  tags: [],
  coverId: null,
  screenshotIds: [],
  documentId: null,
  demoUrl: "",
  videoUrl: "",
  codeUrl: "",
  original: false,
  usageAuthorized: false,
  publicConsent: false,
});
