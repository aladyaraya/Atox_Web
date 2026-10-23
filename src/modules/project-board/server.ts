import "server-only";
import { getBoard } from "../event-board/server";
import { readPublicProjects } from "../project-submission/store";
import { readProjectCatalog } from "./catalog";
import type { ProjectFilters } from "./contracts";
import type { AuthUser } from "../auth/contracts";
import {
  getInteractionStats,
  ProjectInteractionError,
} from "../project-interaction/server";
import { resolvePublicProject } from "./visibility";
import { getProjectDetails } from "./details";

export async function getProjects(
  filters: ProjectFilters = {},
  user?: AuthUser | null,
) {
  const events = await getBoard();
  const projectRegistry = await readPublicProjects();
  const ids = projectRegistry
    .filter(
      (p) =>
        p.published &&
        (!p.eventId || events.events.some((e) => e.id === p.eventId)),
    )
    .map((p) => p.id);
  const stats = await getInteractionStats(ids, user);
  return readProjectCatalog(projectRegistry, events.events, filters, stats);
}
export async function getProject(id: string, user?: AuthUser | null) {
  const definition = await resolvePublicProject(id);
  if (!definition) throw new ProjectInteractionError("NOT_FOUND", 404);
  const events = await getBoard();
  const stats = await getInteractionStats([id], user);
  const project = readProjectCatalog([definition], events.events, {}, stats)
    .projects[0];
  if (!project) return null;
  return { project, details: getProjectDetails(definition) };
}
