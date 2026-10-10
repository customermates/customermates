"use client";

import { createContext, useContext } from "react";

export const DataViewItemLayout = createContext<"row" | "card">("row");

export function useDataViewItemLayout() {
  return useContext(DataViewItemLayout);
}
