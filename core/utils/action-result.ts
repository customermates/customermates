import "server-only";

import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { SerializedInteractorFailure, Validated as ValidatedResult } from "../validation/validation.utils";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isRedirect } from "@/features/auth/auth-outcome";
import { serializeInteractorFailure } from "../validation/validation.utils";

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

export type RowActionResult = { ok: true; ids: string[] } | { ok: false; failure: SerializedInteractorFailure };

export async function serializeRowResult(
  result: ValidatedResult<Array<{ id: string }> | null>,
): Promise<RowActionResult> {
  const resolved = await result;

  return resolved.ok
    ? { ok: true as const, ids: (resolved.data ?? []).map((record) => record.id) }
    : { ok: false as const, failure: serializeInteractorFailure(resolved.error) };
}
