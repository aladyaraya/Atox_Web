/** Pure service/transaction resolver; independent of Next.js Cookie APIs. */
import { projectRegistry } from "./config";
import { readPublishedEvent } from "../content-management/store";
import type { ContentReader } from "../content-management/store";
export async function resolvePublicProject(id: string, db?: ContentReader) {
  const project = projectRegistry.find((p) => p.id === id && p.published);
  if (!project) return null;
  if (project.eventId && !(await readPublishedEvent(project.eventId, db)))
    return null;
  return project;
}
