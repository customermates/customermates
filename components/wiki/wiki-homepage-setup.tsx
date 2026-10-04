"use client";

import type {
  WikiHomepageSetupState,
  WikiSetupFailureReason,
} from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { useTranslations } from "next-intl";
import { CheckCircle2, FileText, Loader2, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

import { getWikiHomepageSetupStateAction, startWikiHomepageSetupAction } from "@/app/[locale]/(protected)/wiki/actions";
import { AppForm } from "@/components/forms/form-context";
import { APP_LOCALES, isAppLocale } from "@/i18n/locale-registry";
import { browserAppLocale } from "@/i18n/locale-preference";
import { FormSelect } from "@/components/forms/form-select";
import { FormInput } from "@/components/forms/form-input";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { isClientTransportError } from "@/core/errors/client-transport-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";

import { WikiSetupProgress } from "./wiki-setup-progress";

import { WikiHomepageSetupStore } from "./wiki-homepage-setup.store";

type Props = {
  canStart?: boolean;
  disabled?: boolean;
  initialState?: WikiHomepageSetupState;
  onContinue?: () => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
};

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

/**
 * Identifies what the server-rendered route shows from a setup state: the status and the created pages.
 * Crawl progress (fetched counts, the current URL, per-page statuses) is deliberately excluded, because
 * it is rendered from the polled client state and must never trigger a route refresh.
 */
export function wikiSetupRouteSignature(state: WikiHomepageSetupState) {
  return JSON.stringify([state.status, state.pageCount ?? state.pages.length, state.pages.map(({ id }) => id)]);
}

/**
 * Returns the latest setup state while an import is running. Polls the state into client state so the
 * progress view updates in place, and refreshes the route only when the status or the created pages change.
 * A newer server state (after a refresh) always replaces the polled one.
 */
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
        // The refresh may be deferred while a form is dirty and must survive this poll stopping
        // (a finished import ends polling), but is dropped once a newer server state has arrived.
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

export const WikiHomepageSetup = observer(function WikiHomepageSetup({
  canStart = true,
  disabled = false,
  initialState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  onContinue,
  onSkip,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const rootStore = useRootStore();
  const [localState, setLocalState] = useState(initialState);
  const [store] = useState(() => new WikiHomepageSetupStore(rootStore, initialState.homepage ?? ""));
  const [retrying, setRetrying] = useState(false);
  const submitting = useRef(false);
  const homepageInput = useRef<HTMLInputElement>(null);
  const statusContainer = useRef<HTMLDivElement>(null);
  const focusStatusAfterSubmit = useRef(false);

  useEffect(() => {
    store.onChange(
      "locale",
      browserAppLocale(navigator.languages?.length ? navigator.languages : [navigator.language]),
    );
  }, [store]);

  useEffect(() => {
    setLocalState(initialState);
    if (initialState.homepage) store.onInitOrRefresh({ ...store.form, homepage: initialState.homepage });
    if (initialState.status === "completed") setRetrying(false);
  }, [initialState, store]);

  const state = useLiveWikiSetupState(localState);
  const failedBody = useWikiSetupFailureBody(state);

  useEffect(() => {
    if (retrying) homepageInput.current?.focus();
  }, [retrying]);

  useEffect(() => {
    if (!canStart) setRetrying(false);
  }, [canStart]);

  useEffect(() => {
    if (!focusStatusAfterSubmit.current || state.status === "idle" || retrying) return;
    focusStatusAfterSubmit.current = false;
    statusContainer.current?.focus();
  }, [retrying, state.status]);

  const submit = async () => {
    if (!canStart || disabled || !store.form.homepage.trim() || submitting.current) return;
    submitting.current = true;
    store.setIsLoading(true);
    try {
      const result = await startWikiHomepageSetupAction({
        homepage: toJS(store.form).homepage,
        locale: store.form.locale,
        clientRequestId: store.clientRequestId,
      });
      if (!result.ok) {
        store.setError(result.error);
        store.renewClientRequestId();
        return;
      }

      const { domain, homepage: canonicalHomepage } = result.data;
      focusStatusAfterSubmit.current = true;
      const workingState: WikiHomepageSetupState = {
        status: "working",
        homepage: canonicalHomepage,
        domain,
        pages: [],
        crawlPhase: "queued",
        progress: { fetched: 0, total: 0 },
      };
      setLocalState(workingState);
      store.onInitOrRefresh({ ...store.form, homepage: canonicalHomepage });
      setRetrying(false);
      router.refresh();
      store.renewClientRequestId();
    } finally {
      submitting.current = false;
      store.setIsLoading(false);
    }
  };

  const showForm = state.status === "idle" || retrying;
  const isSubmitting = store.isLoading;
  const controlsDisabled = disabled || isSubmitting;

  if (!showForm) {
    const completed = state.status === "completed";
    const working = state.status === "working";
    const failed = state.status === "failed";
    const domain = state.domain ?? state.homepage ?? "";
    const workingBody = t("WikiSetup.status.workingBody", { domain });
    const completedBody = state.homepage
      ? t("WikiSetup.status.completedBodyOnboarding")
      : t("WikiSetup.status.completedExistingBody");
    return (
      <section aria-busy={controlsDisabled} className="w-full space-y-4 text-left">
        {!failed ? (
          <div
            ref={statusContainer}
            aria-live="polite"
            className={working ? "sr-only" : "flex items-start gap-2 outline-none"}
            tabIndex={-1}
          >
            <div className="mt-0.5 shrink-0 text-muted-foreground">
              {working ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : completed ? (
                <CheckCircle2 aria-hidden="true" className="size-3.5 text-success" />
              ) : (
                <TriangleAlert aria-hidden="true" className="size-3.5 text-warning" />
              )}
            </div>

            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-medium">
                {working
                  ? t("WikiSetup.status.workingTitle")
                  : completed
                    ? t("WikiSetup.status.completedTitle")
                    : state.status === "noContent"
                      ? t("WikiSetup.status.noContentTitle")
                      : t("WikiSetup.status.failedTitle")}
              </h2>

              <p className="text-sm text-muted-foreground">
                {working
                  ? workingBody
                  : completed
                    ? completedBody
                    : state.status === "noContent"
                      ? t("WikiSetup.status.noContentBody")
                      : failedBody}
              </p>
            </div>
          </div>
        ) : null}

        {failed ? (
          <Alert ref={statusContainer} className="outline-none" color="danger" description={failedBody} tabIndex={-1}>
            {canStart && state.pages.length === 0 ? (
              <Button
                className="mt-2"
                disabled={controlsDisabled}
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => setRetrying(true)}
              >
                <RotateCcw />

                {t("WikiSetup.tryAnother")}
              </Button>
            ) : null}
          </Alert>
        ) : null}

        {state.progress || state.crawlPhase ? <WikiSetupProgress state={state} /> : null}

        {completed ? (
          <div className="grid gap-1.5">
            {state.pages.map((page) => (
              <div key={page.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText className="text-muted-foreground" />

                <span className="truncate">{page.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {canStart && !working && !completed && !failed && state.pages.length === 0 ? (
            <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={() => setRetrying(true)}>
              <RotateCcw />

              {t("WikiSetup.tryAnother")}
            </Button>
          ) : null}

          {onContinue ? (
            <Button disabled={controlsDisabled} type="button" onClick={() => runUserAction(onContinue)}>
              {disabled ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}

              {working ? t("WikiSetup.continueBackground") : t("WikiSetup.continue")}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <AppForm aria-busy={controlsDisabled} store={store} onSubmit={submit}>
      <div className="w-full space-y-5 text-left">
        <FormInput
          ref={homepageInput}
          autoComplete="url"
          disabled={disabled}
          id="homepage"
          inputId="wiki-homepage"
          inputMode="url"
          label={t("WikiSetup.homepageLabel")}
          placeholder={t("WikiSetup.homepagePlaceholder")}
          type="text"
        />

        <FormSelect
          description={t("WikiSetup.languageDescription")}
          disabled={disabled}
          id="locale"
          inputId="wiki-language"
          items={APP_LOCALES.map((locale) => ({ value: locale, label: t(`Common.locales.${locale}`) }))}
          label={t("WikiSetup.languageLabel")}
          onValueChange={(locale) => {
            if (isAppLocale(locale)) store.onChange("locale", locale);
          }}
        />

        <span aria-live="polite" className="sr-only">
          {isSubmitting ? t("WikiSetup.start") : ""}
        </span>

        <div className="flex flex-wrap justify-end gap-2">
          {onSkip ? (
            <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={() => runUserAction(onSkip)}>
              {disabled ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}

              {t("OnboardingWizard.wiki.skip")}
            </Button>
          ) : null}

          <Button disabled={!canStart || !store.form.homepage.trim() || controlsDisabled} type="submit">
            {isSubmitting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}

            {t("WikiSetup.start")}
          </Button>
        </div>
      </div>
    </AppForm>
  );
});
