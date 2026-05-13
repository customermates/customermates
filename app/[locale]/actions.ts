"use server";

import { redirect } from "next/navigation";
import { Status } from "@/generated/prisma";

import { getSignOutInteractor, getUserService } from "@/core/app-di";

export async function signOutAction() {
  return getSignOutInteractor().invoke();
}

export async function checkPendingStatusAndRedirect() {
  const user = await getUserService().getUser();

  if (user?.status !== Status.pendingAuthorization) redirect("/");
}
