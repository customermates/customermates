import "server-only";

import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { SerializedInteractorFailure } from "../validation/validation.utils";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isRedirect, redirectTo } from "@/features/auth/auth-outcome";
import { isBusyDatabaseError } from "@/core/errors/prisma-client-error";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { EmailVerificationRequiredError } from "@/core/auth/email-verification-required-error";
import { failAuthorization, failRateLimit, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes, isRetryableFailure, serializeInteractorFailure } from "../validation/validation.utils";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: $ZodErrorTree<unknown>; code?: string; retryable?: boolean };

type TypedActionResult<T> = { ok: true; data: T } | { ok: false; failure: SerializedInteractorFailure };

type ActionInput<T> = Validated<T> | Awaited<Validated<T>> | Promise<Awaited<Validated<T>> | Redirect> | Redirect;

export async function settleActionResult<T>(result: ActionInput<T>): Promise<Awaited<Validated<T>> | Redirect> {
  try {
    return await result;
  } catch (error) {
    if (isBusyDatabaseError(error)) return failRateLimit(CustomErrorCode.serviceBusy);
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied)
      return failAuthorization(CustomErrorCode.permissionDenied);
    if (error instanceof EmailVerificationRequiredError) return redirectTo("/auth/verify-email");
    if ((error as { code?: unknown } | null)?.code === "P2028")
      return failUnavailable(CustomErrorCode.recordTransactionEnded);
    throw error;
  }
}

export async function serializeTypedResult<T>(result: ActionInput<T>): Promise<TypedActionResult<T>> {
  const resolved = await settleActionResult(result);
  if (isRedirect(resolved)) redirect(resolved.redirect);
  return resolved.ok ? resolved : { ok: false, failure: serializeInteractorFailure(resolved.error) };
}

export async function serializeResult<T>(result: ActionInput<T>): Promise<ActionResult<T>> {
  const resolved = await settleActionResult(result);
  if (isRedirect(resolved)) redirect(resolved.redirect);
  if (resolved.ok) return resolved;

  const [code] = interactorFailureCodes(resolved.error);
  return {
    ok: false,
    error: z.treeifyError(resolved.error),
    ...(code ? { code } : {}),
    ...(isRetryableFailure(resolved.error) ? { retryable: true } : {}),
  };
}
