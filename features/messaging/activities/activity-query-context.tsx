"use client";

import type { ReactNode } from "react";
import type { Filter } from "@/core/base/base-get.schema";

import { createContext, useContext, useMemo } from "react";

type ActivityQuery = {
  filters?: Filter[];
};

const ActivityQueryContext = createContext<ActivityQuery | null>(null);

export function ActivityQueryProvider({ children, filters }: { children: ReactNode; filters?: Filter[] }) {
  const value = useMemo(() => ({ filters }), [filters]);

  return <ActivityQueryContext.Provider value={value}>{children}</ActivityQueryContext.Provider>;
}

export function useActivityQuery(): ActivityQuery | null {
  return useContext(ActivityQueryContext);
}
