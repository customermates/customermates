import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";

import { z } from "zod";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: $ZodErrorTree<unknown> };

export async function serializeResult<T>(result: Validated<T>): Promise<ActionResult<T>> {
  const resolved = await result;
  if (resolved.ok) return resolved;

  return {
    ok: false,
    error: z.treeifyError(resolved.error),
  };
}
