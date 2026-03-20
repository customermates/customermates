"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";

import { redirect } from "next/navigation";

import { RegisterUserInteractor } from "@/features/user/register/register-user.interactor";
import { di } from "@/core/dependency-injection/container";
import { serializeResult } from "@/core/utils/action-result";

export async function onboardingAction(data: RegisterUserData) {
  const result = await serializeResult(di.get(RegisterUserInteractor).invoke(data));
  if (result.ok) redirect("/");
  return result;
}
