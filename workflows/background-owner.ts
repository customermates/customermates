import { Prisma } from "@/generated/prisma";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { AppErrorCode, appErrorDetailsInCauseChain } from "@/core/errors/app-errors";

import { GONE } from "./owner-gone";
function ownerGone(error: unknown): boolean {
  if (appErrorDetailsInCauseChain(error)?.code === AppErrorCode.inactiveUser) return true;
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function asBackgroundOwner<T>(
  userId: string,
  fn: () => T | Promise<T>,
  options: { allowInactive?: boolean } = {},
): Promise<T | typeof GONE> {
  let entered = false;
  try {
    return await runAsBackgroundTenant(
      userId,
      () => {
        entered = true;
        return fn();
      },
      options,
    );
  } catch (error) {
    if (!entered && ownerGone(error)) return GONE;
    throw error;
  }
}

export async function ranForOwner(userId: string, fn: () => unknown): Promise<boolean> {
  return (await asBackgroundOwner(userId, fn)) !== GONE;
}
