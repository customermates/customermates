import "server-only";

import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";
import type { Redirect } from "@/features/auth/auth-outcome";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isRedirect } from "@/features/auth/auth-outcome";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: $ZodErrorTree<unknown> };

/**
 * Serialize an interactor result for a Next.js server action.
 *
 * Handles two outcome types from the interactor layer:
 *   - `Redirect` — calls `redirect()` from `next/navigation`, which throws
 *     `NEXT_REDIRECT` and is propagated by Next as a real client redirect.
 *   - `Validated<T>` (i.e. `{ ok: true, data } | { ok: false, error }`) —
 *     returns the data shape; on validation failure the zod error is
 *     `treeifyError`-ed so it can be sent across the server-action boundary.
 *
 * Server-only because of `redirect()`. Safe to call from any `"use server"`
 * file.
 */
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
