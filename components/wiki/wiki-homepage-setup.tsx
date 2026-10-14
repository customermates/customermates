"use client";

import type {
  WikiHomepageSetupState,
  WikiSetupFailureReason,
} from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { getWikiHomepageSetupStateAction } from "@/app/[locale]/(protected)/wiki/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { isClientTransportError } from "@/core/errors/client-transport-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";

export const EMPTY_WIKI_HOMEPAGE_SETUP_STATE: WikiHomepageSetupState = {
  status: "idle",
  homepage: null,
  domain: null,
  pages: [],
};
export function useWikiSetupFailureBody(state: WikiHomepageSetupState) {
  const t = useTranslations();
  const domain = state.domain ?? state.homepage ?? "";
  const failedBodies: Record<WikiSetupFailureReason, string> = {
    blocked: t("WikiSetup.status.failedBodyBlocked", { domain }),
    unavailable: t("WikiSetup.status.failedBodyUnavailable", { domain }),
    credits: t("Common.errors.agentLimitReached"),
    aiUnavailable: t("Common.errors.agentServiceUnavailable"),
    synthesis: t("WikiSetup.status.failedBodySynthesis"),
  };
  return state.failureReason ? failedBodies[state.failureReason] : t("WikiSetup.status.failedBody");
}

export function wikiSetupRouteSignature(state: WikiHomepageSetupState) {
  return JSON.stringify([state.status, state.pageCount ?? state.pages.length, state.pages.map(({ id }) => id)]);
}

export function useLiveWikiSetupState(serverState: WikiHomepageSetupState): WikiHomepageSetupState {
  const router = useRouter();
  const { navigationGuard } = useRootStore();
  const serverSignature = JSON.stringify(serverState);
  const serverRouteSignature = wikiSetupRouteSignature(serverState);
  const [polled, setPolled] = useState<{ base: string; state: WikiHomepageSetupState } | null>(null);
  const state = polled?.base === serverSignature ? polled.state : serverState;
  const latest = useRef({ base: serverSignature, signature: serverSignature });
  const serverRoute = useRef(serverRouteSignature);
  const knownRoute = useRef(serverRouteSignature);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    latest.current = { base: serverSignature, signature: serverSignature };
  }, [serverSignature]);
  useEffect(() => {
    serverRoute.current = serverRouteSignature;
    knownRoute.current = serverRouteSignature;
  }, [serverRouteSignature]);
  useEffect(() => {
    if (state.status !== "working") return;
    let active = true;
    let pending = false;
    let reportedFailure = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const result = await getWikiHomepageSetupStateAction();
        reportedFailure = false;
        if (!active || !result.ok) return;
        const nextSignature = JSON.stringify(result.data);
        if (nextSignature === latest.current.signature) return;
        latest.current = { ...latest.current, signature: nextSignature };
        setPolled({ base: latest.current.base, state: result.data });
        const nextRouteSignature = wikiSetupRouteSignature(result.data);
        if (nextRouteSignature === knownRoute.current) return;
        knownRoute.current = nextRouteSignature;
        const requestedFrom = serverRoute.current;
        navigationGuard.requestRouteRefreshWhenSafe(() => {
          if (mounted.current && serverRoute.current === requestedFrom) router.refresh();
        });
      } finally {
        pending = false;
      }
    };
    const interval = globalThis.setInterval(() => {
      void poll().catch((error: unknown) => {
        if (!active || isClientTransportError(error) || reportedFailure) return;
        reportedFailure = true;
        reportApplicationError(error);
      });
    }, 2_500);
    return () => {
      active = false;
      globalThis.clearInterval(interval);
    };
  }, [navigationGuard, router, state.status]);
  return state;
}
