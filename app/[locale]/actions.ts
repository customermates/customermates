"use server";

import { redirect } from "next/navigation";
import { Status } from "@/generated/prisma";

import { getSignOutInteractor, getUserService } from "@/core/app-di";
import { serializeResult } from "@/core/utils/action-result";

export async function signOutAction() {
  return serializeResult(getSignOutInteractor().invoke());
}

export async function checkPendingStatusAndRedirect() {
  const user = await getUserService().getUser();

  if (user?.status !== Status.pendingAuthorization) redirect("/");
}
