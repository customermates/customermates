"use client";

import type { AccountState } from "@/features/auth/account-state";
import type { ReactNode } from "react";

import { createContext, useContext, useMemo } from "react";

import type { NavigationShell } from "./navigation-shell";

type AccountStateContextValue = {
  state: AccountState;
  protectedEnhancementsAllowed: boolean;
  showRestrictedShell: boolean;
};

const AccountStateContext = createContext<AccountStateContextValue | null>(null);

export function AccountStateProvider({
  state,
  shell,
  children,
}: {
  state: AccountState;
  shell: NavigationShell;
  children?: ReactNode;
}) {
  const value = useMemo(
    () => ({
      state,
      protectedEnhancementsAllowed: state === "allowed" && shell === "app",
      showRestrictedShell: shell === "restricted",
    }),
    [shell, state],
  );

  return <AccountStateContext.Provider value={value}>{children}</AccountStateContext.Provider>;
}

export function useAccountState(): AccountStateContextValue {
  const value = useContext(AccountStateContext);
  if (!value) throw new Error("useAccountState must be used within an AccountStateProvider");
  return value;
}
