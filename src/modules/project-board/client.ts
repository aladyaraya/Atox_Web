import type { ProjectBoardDto, ProjectFilters } from "./contracts";
import { projectQuery } from "./rules";
export async function fetchProjects(
  filters: ProjectFilters,
  signal?: AbortSignal,
): Promise<ProjectBoardDto> {
  const response = await fetch(`/api/projects${projectQuery(filters)}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("PROJECTS_UNAVAILABLE");
  return response.json();
}
