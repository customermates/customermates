import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";

import { z } from "zod";

export type ActionResult<Data, Input = Data> = { ok: true; data: Data } | { ok: false; error: $ZodErrorTree<Input> };

export async function serializeResult<T, Input = T>(result: Validated<T, Input>): Promise<ActionResult<T, Input>> {
  const resolved = await result;
  if (resolved.ok) return resolved;

  return {
    ok: false,
    error: z.treeifyError(resolved.error),
  };
}
