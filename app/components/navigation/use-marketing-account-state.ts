"use client";

import type { AccountState, MarketingAccountProfile } from "@/features/auth/account-state";

import { useCallback, useEffect, useState } from "react";

import { readMarketingAccountAction } from "@/app/[locale]/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { expiredSessionHintCookie, hasSessionHint } from "@/features/auth/session-hint";

export function useMarketingAccountState(
  knownAccountState: AccountState | undefined,
  enabled: boolean,
  pathname: string,
) {
  const [resolvedAccountState, setResolvedAccountState] = useState<AccountState>("unauthenticated");
  const [profile, setProfile] = useState<MarketingAccountProfile | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!hasSessionHint(document.cookie)) {
      setResolvedAccountState("unauthenticated");
      setProfile(null);
      return;
    }

    let current = true;
    readMarketingAccountAction().then((account) => {
      if (!current) return;
      setResolvedAccountState(account.state);
      setProfile(account.profile);
    }, reportApplicationError);

    return () => {
      current = false;
    };
  }, [enabled, pathname]);

  const markSignedOut = useCallback(() => {
    document.cookie = expiredSessionHintCookie();
    setResolvedAccountState("unauthenticated");
    setProfile(null);
  }, []);

  const accountState = knownAccountState ?? resolvedAccountState;

  return { accountState, markSignedOut, profile: accountState === "unauthenticated" ? null : profile };
}
