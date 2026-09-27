"use client";

import type { AccountState } from "@/features/auth/account-state";

import { useCallback, useEffect, useState } from "react";

import { readMarketingAccountStateAction } from "@/app/[locale]/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { expiredSessionHintCookie, hasSessionHint } from "@/features/auth/session-hint";

export function useMarketingAccountState(
  knownAccountState: AccountState | undefined,
  enabled: boolean,
  pathname: string,
) {
  const [resolvedAccountState, setResolvedAccountState] = useState<AccountState>("unauthenticated");

  useEffect(() => {
    if (knownAccountState || !enabled) return;
    if (!hasSessionHint(document.cookie)) {
      setResolvedAccountState("unauthenticated");
      return;
    }

    let current = true;
    readMarketingAccountStateAction().then((state) => {
      if (current) setResolvedAccountState(state);
    }, reportApplicationError);

    return () => {
      current = false;
    };
  }, [enabled, knownAccountState, pathname]);

  const markSignedOut = useCallback(() => {
    document.cookie = expiredSessionHintCookie();
    setResolvedAccountState("unauthenticated");
  }, []);

  return { accountState: knownAccountState ?? resolvedAccountState, markSignedOut };
}
