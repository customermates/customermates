"use server";

import { redirect } from "next/navigation";

import { Status } from "@/generated/prisma";

import { di } from "@/core/dependency-injection/container";
import { SignOutInteractor } from "@/features/auth/sign-out.interactor";
import { UserService } from "@/features/user/user.service";

export async function signOutAction() {
  return di.get(SignOutInteractor).invoke();
}

export async function checkPendingStatusAndRedirect() {
  const user = await di.get(UserService).getUser();

  if (user?.status !== Status.pendingAuthorization) redirect("/");
}
