"use client";

import { createContext, useContext } from "react";

export type DataViewItemLayoutKind = "row" | "card";

export const DataViewItemLayout = createContext<DataViewItemLayoutKind>("row");

export function useDataViewItemLayout() {
  return useContext(DataViewItemLayout);
}
