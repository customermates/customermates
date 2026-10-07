"use client";

import { createContext, useContext } from "react";

export type AppModalClose = {
  requestClose: () => void;
  guardsUnsavedChanges: boolean;
};

export const AppModalCloseContext = createContext<AppModalClose | null>(null);

export function useAppModalClose() {
  return useContext(AppModalCloseContext);
}
