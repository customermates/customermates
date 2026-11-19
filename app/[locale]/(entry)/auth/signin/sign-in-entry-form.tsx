"use client";

import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect, useState } from "react";

import { SignInForm } from "./sign-in-form";

import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { SESSION_HINT_DOCUMENT_ATTRIBUTE } from "@/features/auth/session-hint";

type Props = {
  socialProviders: { google: boolean; microsoft: boolean };
};

const SignInEntryFormContent = observer(({ socialProviders }: Props) => {
  const { signInStore } = useRootStore();
  const { entry, entrySettled } = signInStore;
  const [signedInHint, setSignedInHint] = useState(false);

  useLayoutEffect(() => {
    setSignedInHint(document.documentElement.hasAttribute(SESSION_HINT_DOCUMENT_ATTRIBUTE));
  }, []);

  useEffect(() => {
    signInStore.resolveEntry(window.location.search);
  }, [signInStore]);

  return (
    <div
      className={cn("contents", signedInHint && !entrySettled ? "invisible" : "[[data-session-hint]_&]:invisible")}
      data-sign-in-entry={entrySettled ? "ready" : "pending"}
    >
      <SignInForm {...entry} socialProviders={entry?.socialProviders ?? socialProviders} />
    </div>
  );
});

export const SignInEntryForm = serverRenderedClient(SignInEntryFormContent);
