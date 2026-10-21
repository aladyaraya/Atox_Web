import { eq, inArray } from "drizzle-orm";
import { getDb, serializeDatabaseWrite } from "@/lib/db";
import { accountProfiles } from "./profile-schema";
import type { AuthUser } from "./contracts";
import type { AccountProfileDto, ProfileErrorCode } from "./profile-contracts";
type Db = Awaited<ReturnType<typeof getDb>>;
export type ProfileReader =
  Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export class ProfileError extends Error {
  constructor(
    public code: ProfileErrorCode,
    public status = code === "REVISION_CONFLICT" ? 409 : 400,
  ) {
    super(code);
  }
}
export async function getAccountProfile(
  user: AuthUser,
  db?: ProfileReader,
): Promise<AccountProfileDto> {
  db ??= await getDb();
  const [row] = await db
    .select()
    .from(accountProfiles)
    .where(eq(accountProfiles.userId, user.id))
    .limit(1);
  return { nickname: row?.nickname ?? null, revision: row?.revision ?? 0 };
}
/** Server-only integration projection: never returns emails or account records. */
export async function getPublicNicknames(ids: string[], db?: ProfileReader) {
  db ??= await getDb();
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .select({ id: accountProfiles.userId, nickname: accountProfiles.nickname })
    .from(accountProfiles)
    .where(inArray(accountProfiles.userId, ids));
  return new Map(rows.map((row) => [row.id, row.nickname]));
}
export async function updateNickname(
  user: AuthUser,
  input: unknown,
): Promise<AccountProfileDto> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProfileError("INVALID_INPUT");
  const v = input as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["nickname", "revision"].includes(k)) ||
    typeof v.nickname !== "string" ||
    !Number.isSafeInteger(v.revision) ||
    (v.revision as number) < 0 ||
    (v.revision as number) >= 2147483647
  )
    throw new ProfileError("INVALID_INPUT");
  const nickname = v.nickname.trim(),
    revision = v.revision as number;
  if (
    Array.from(nickname).length < 2 ||
    Array.from(nickname).length > 30 ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(nickname)
  )
    throw new ProfileError("INVALID_INPUT");
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      const current = await getAccountProfile(user, tx);
      if (current.revision !== revision)
        throw new ProfileError("REVISION_CONFLICT");
      if (current.revision === 0)
        await tx
          .insert(accountProfiles)
          .values({
            userId: user.id,
            nickname,
            revision: 1,
            updatedAt: new Date(),
          });
      else
        await tx
          .update(accountProfiles)
          .set({ nickname, revision: revision + 1, updatedAt: new Date() })
          .where(eq(accountProfiles.userId, user.id));
      return { nickname, revision: revision + 1 };
    }),
  );
}
