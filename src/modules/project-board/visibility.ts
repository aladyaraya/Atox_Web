/** Pure service/transaction resolver; independent of Next.js Cookie APIs. */
import { readPublicProject } from "../project-submission/store";
import type { ContentReader } from "../content-management/store";
export async function resolvePublicProject(id: string, db?: ContentReader) {
  return readPublicProject(id, db);
}
