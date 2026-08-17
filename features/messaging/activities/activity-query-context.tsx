"use client";

import type { ReactNode } from "react";
import type { ActivityScope } from "@/ee/messaging/activities/activity-scope.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { createContext, useContext, useMemo } from "react";

type ActivityQuery = {
  scope?: ActivityScope;
  filters?: Filter[];
};

const ActivityQueryContext = createContext<ActivityQuery | null>(null);

export function ActivityQueryProvider({
  children,
  scope,
  filters,
}: {
  children: ReactNode;
  scope?: ActivityScope;
  filters?: Filter[];
}) {
  const value = useMemo(() => ({ scope, filters }), [filters, scope]);

  return <ActivityQueryContext.Provider value={value}>{children}</ActivityQueryContext.Provider>;
}

export function useActivityQuery(): ActivityQuery | null {
  return useContext(ActivityQueryContext);
}
