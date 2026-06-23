import type { z } from "zod";
import type { CustomErrorCode } from "@/core/validation/validation.types";

type IdSource = string | string[] | null | undefined;
type Lookup = { has(key: string): boolean };

export type IdEntry = { ids: IdSource; path: (string | number)[] };

export async function checkIds(
  entries: IdEntry[],
  ctx: z.RefinementCtx,
  findIds: (ids: Set<string>) => Promise<Lookup>,
  errorCode: CustomErrorCode,
) {
  const all = new Set<string>();
  for (const { ids } of entries) {
    if (Array.isArray(ids)) ids.forEach((id) => all.add(id));
    else if (ids) all.add(ids);
  }

  const valid = await findIds(all);
  for (const { ids, path } of entries) {
    if (ids === undefined || ids === null) continue;

    const isArray = Array.isArray(ids);
    const list = isArray ? ids : [ids];
    for (let i = 0; i < list.length; i++) {
      if (!valid.has(list[i]))
        ctx.addIssue({ code: "custom", params: { error: errorCode }, path: isArray ? [...path, i] : path });
    }
  }
}
