import "server-only";

import type { $ZodErrorTree } from "zod/v4/core";
import type { Validated } from "../validation/validation.utils";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { InteractorFailure, SerializedInteractorFailure } from "../validation/validation.utils";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isRedirect, redirectTo } from "@/features/auth/auth-outcome";
import { isBusyDatabaseError } from "@/core/errors/prisma-client-error";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { EmailVerificationRequiredError } from "@/core/auth/email-verification-required-error";
import { isWorkspaceChangedCode, markWorkspaceChanged } from "@/core/errors/workspace-changed";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";
import {
  failAuthorization,
  failConflict,
  failRateLimit,
  failUnavailable,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { withWorkspaceHref } from "@/core/navigation/workspace-paths";
import { requestedWorkspaceSlug } from "@/core/navigation/workspace-request-header";
import { interactorFailureCodes, isRetryableFailure, serializeInteractorFailure } from "../validation/validation.utils";

type ActionFailure = { ok: false; error: $ZodErrorTree<unknown>; code?: string; retryable?: boolean };

type ActionResult<T> = { ok: true; data: T } | ActionFailure;

export type TypedActionResult<T> = { ok: true; data: T } | { ok: false; failure: SerializedInteractorFailure };

type ActionInput<T> = Validated<T> | Awaited<Validated<T>> | Promise<Awaited<Validated<T>> | Redirect> | Redirect;

async function workspaceRedirectTarget(path: string): Promise<string> {
  return withWorkspaceHref(path, requestedWorkspaceSlug(await headers()));
}

export async function settleActionResult<T>(result: ActionInput<T>): Promise<Awaited<Validated<T>> | Redirect> {
  return settleOutcome<Awaited<Validated<T>> | Redirect>(result);
}

export async function settleOutcome<R>(result: R | Promise<R>): Promise<R | InteractorFailure | Redirect> {
  try {
    return await result;
  } catch (error) {
    if (isBusyDatabaseError(error)) return failRateLimit(CustomErrorCode.serviceBusy);
    if (error instanceof WorkspaceChangedError) return failConflict(CustomErrorCode.workspaceChanged);
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied)
      return failAuthorization(CustomErrorCode.permissionDenied);
    if (error instanceof EmailVerificationRequiredError) return redirectTo("/auth/verify-email");
    if (error instanceof ForbiddenError && error.code === AppErrorCode.inactiveUser)
      return failAuthorization(CustomErrorCode.userInactive);
    if ((error as { code?: unknown } | null)?.code === "P2028")
      return failUnavailable(CustomErrorCode.recordTransactionEnded);
    throw error;
  }
}

export async function serializeTypedResult<T>(result: ActionInput<T>): Promise<TypedActionResult<T>> {
  const resolved = await settleActionResult(result);
  if (isRedirect(resolved)) redirect(await workspaceRedirectTarget(resolved.redirect));
  return resolved.ok ? resolved : { ok: false, failure: serializeInteractorFailure(resolved.error) };
}

export async function serializeTypedData<T, U>(
  result: ActionInput<T>,
  map: (data: T) => U | Promise<U>,
): Promise<TypedActionResult<U>> {
  const serialized = await serializeTypedResult(result);
  return serialized.ok ? { ok: true, data: await map(serialized.data) } : serialized;
}

export function serializeActionFailure(failure: z.ZodError): ActionFailure {
  const [code] = interactorFailureCodes(failure);
  const error = z.treeifyError(failure);
  return {
    ok: false,
    error: isWorkspaceChangedCode(code) ? markWorkspaceChanged(error) : error,
    ...(code ? { code } : {}),
    ...(isRetryableFailure(failure) ? { retryable: true } : {}),
  };
}

export async function serializeResult<T>(result: ActionInput<T>): Promise<ActionResult<T>> {
  const resolved = await settleActionResult(result);
  if (isRedirect(resolved)) redirect(await workspaceRedirectTarget(resolved.redirect));
  return resolved.ok ? resolved : serializeActionFailure(resolved.error);
}
