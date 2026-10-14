import type { Validated } from "@/core/validation/validation.utils";

import { notFound } from "next/navigation";

import { interactorFailureKind } from "@/core/validation/validation.utils";

export async function unwrapPage<T>(result: Validated<T>): Promise<T> {
  const resolved = await result;
  if (resolved.ok) return resolved.data;
  if (interactorFailureKind(resolved.error) === "not_found") notFound();
  throw resolved.error;
}
