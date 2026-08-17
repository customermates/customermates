"use server";

import { getSignOutInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function signOutAction() {
  return serializeResult(getSignOutInteractor().invoke());
}
