"use client";

import { Action, Resource } from "@/generated/prisma";
import { useRootStore } from "@/core/stores/root-store.provider";

export function useCanChangePlan(): boolean {
  const { userStore } = useRootStore();
  return userStore.user === null || userStore.can(Resource.company, Action.update);
}
