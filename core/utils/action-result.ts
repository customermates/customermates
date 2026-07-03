import "server-only";

import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";
import type { Redirect } from "@/features/auth/auth-outcome";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isRedirect } from "@/features/auth/auth-outcome";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: $ZodErrorTree<unknown> };

export async function serializeResult<T>(
  result: Validated<T> | Awaited<Validated<T>> | Promise<Awaited<Validated<T>> | Redirect> | Redirect,
): Promise<ActionResult<T>> {
  const resolved = await result;
  if (isRedirect(resolved)) redirect(resolved.redirect);
  if (resolved.ok) return resolved;

  return {
    ok: false,
    error: z.treeifyError(resolved.error),
  };
}
