"use client";

import type { ReactNode } from "react";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

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
  renderConversation: (conversationId: string) => ReactNode;
};

export const EMPTY_WIKI_HOMEPAGE_SETUP_STATE: WikiHomepageSetupState = {
  status: "idle",
  homepage: null,
  domain: null,
  conversationId: null,
  pages: [],
};
export function useRefreshWhileWikiSetupWorks(state: WikiHomepageSetupState) {
  const router = useRouter();
  const { navigationGuard } = useRootStore();
  const signature = JSON.stringify(state);
  const lastSignature = useRef(signature);
  useEffect(() => {
    lastSignature.current = signature;
  }, [signature]);
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
        if (nextSignature === lastSignature.current) return;
        lastSignature.current = nextSignature;
        navigationGuard.requestRouteRefreshWhenSafe(() => {
          if (active) router.refresh();
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
}

export const WikiHomepageSetup = observer(function WikiHomepageSetup({
  canStart = true,
  disabled = false,
  initialState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  onContinue,
  onSkip,
  renderConversation,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const rootStore = useRootStore();
  const [state, setState] = useState(initialState);
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
    setState(initialState);
    if (initialState.homepage) store.onInitOrRefresh({ ...store.form, homepage: initialState.homepage });
    if (initialState.status === "completed") setRetrying(false);
  }, [initialState, store]);

  useRefreshWhileWikiSetupWorks(state);

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

      const { conversationId, domain, homepage: canonicalHomepage } = result.data;
      focusStatusAfterSubmit.current = true;
      const workingState: WikiHomepageSetupState = {
        status: "working",
        homepage: canonicalHomepage,
        domain,
        conversationId,
        pages: [],
        crawlPhase: "queued",
        progress: { fetched: 0, total: 0 },
      };
      setState(workingState);
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
    const workingBody = state.conversationId
      ? t("WikiSetup.status.workingBody", { domain })
      : t("WikiSetup.status.workingBodyNoTask", { domain });
    const failedBody =
      state.failureReason === "blocked"
        ? t("WikiSetup.status.failedBodyBlocked", { domain })
        : state.failureReason === "unavailable"
          ? t("WikiSetup.status.failedBodyUnavailable", { domain })
          : state.failureReason === "assistantUnavailable"
            ? t("Common.errors.agentServiceUnavailable")
            : state.failureReason === "credits"
              ? t("Common.errors.agentLimitReached")
              : state.failureReason === "busy"
                ? t("Common.errors.agentTurnAlreadyRunning")
                : state.failureReason === "synthesis"
                  ? t("WikiSetup.status.failedBodySynthesis")
                  : t("WikiSetup.status.failedBody");
    const completedBody = state.homepage
      ? t("WikiSetup.status.completedBodyOnboarding")
      : t("WikiSetup.status.completedExistingBody");
    return (
      <section aria-busy={controlsDisabled} className="w-full space-y-4 text-left">
        {!failed ? (
          <div
            ref={statusContainer}
            aria-live="polite"
            className={
              working || (completed && state.conversationId) ? "sr-only" : "flex items-start gap-2 outline-none"
            }
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

        {working &&
        !state.conversationId &&
        (!state.crawlPhase || state.crawlPhase === "importing" || state.crawlPhase === "synthesizing") ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />

            <span>{t("WikiSetup.crawlProgress.synthesizing")}</span>
          </div>
        ) : null}

        {completed && !state.conversationId ? (
          <div className="grid gap-1.5">
            {state.pages.map((page) => (
              <div key={page.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText className="text-muted-foreground" />

                <span className="truncate">{page.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {state.conversationId ? renderConversation(state.conversationId) : null}

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
