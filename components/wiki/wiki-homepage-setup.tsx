"use client";

import type { ReactNode } from "react";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { useTranslations } from "next-intl";
import { CheckCircle2, FileText, Loader2, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

import { startWikiHomepageSetupAction } from "@/app/[locale]/(protected)/wiki/actions";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import { useRouter } from "@/i18n/navigation";

import { WikiHomepageSetupFormStore } from "./wiki-homepage-setup.store";

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
export function useRefreshWhileWikiSetupWorks(working: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!working) return;
    const poll = globalThis.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 2_500);
    return () => globalThis.clearInterval(poll);
  }, [router, working]);
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
  const [store] = useState(() => new WikiHomepageSetupFormStore(rootStore, initialState.homepage ?? ""));
  const [retrying, setRetrying] = useState(false);
  const submitting = useRef(false);
  const homepageInput = useRef<HTMLInputElement>(null);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  const focusStatusAfterSubmit = useRef(false);

  useEffect(() => {
    setState(initialState);
    if (initialState.homepage) store.onInitOrRefresh({ homepage: initialState.homepage });
    if (initialState.status === "completed") setRetrying(false);
  }, [initialState, store]);

  useRefreshWhileWikiSetupWorks(state.status === "working");

  useEffect(() => {
    if (retrying) homepageInput.current?.focus();
  }, [retrying]);

  useEffect(() => {
    if (!canStart) setRetrying(false);
  }, [canStart]);

  useEffect(() => {
    if (!focusStatusAfterSubmit.current || state.status === "idle" || retrying) return;
    focusStatusAfterSubmit.current = false;
    statusHeading.current?.focus();
  }, [retrying, state.status]);

  const submit = async () => {
    if (!canStart || disabled || !store.form.homepage.trim() || submitting.current) return;
    submitting.current = true;
    store.setIsLoading(true);
    try {
      const result = await startWikiHomepageSetupAction({
        homepage: toJS(store.form).homepage,
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
      };
      setState(workingState);
      store.onInitOrRefresh({ homepage: canonicalHomepage });
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
    const domain = state.domain ?? state.homepage ?? "";
    const workingBody = state.conversationId
      ? t("WikiSetup.status.workingBody", { domain })
      : t("WikiSetup.status.workingBodyNoTask", { domain });
    const completedBody = state.homepage
      ? t("WikiSetup.status.completedBodyOnboarding")
      : t("WikiSetup.status.completedExistingBody");
    return (
      <section aria-busy={controlsDisabled} className="w-full space-y-4 text-left">
        <div aria-live="polite" className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-muted p-2 text-muted-foreground">
            {working ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : completed ? (
              <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            ) : (
              <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <h2 ref={statusHeading} className="font-medium outline-none" tabIndex={-1}>
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
                    : t("WikiSetup.status.failedBody")}
            </p>
          </div>
        </div>

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
          {canStart && !working && !completed ? (
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

        <span aria-live="polite" className="sr-only">
          {isSubmitting ? t("WikiSetup.start") : ""}
        </span>

        <div className="flex flex-wrap justify-end gap-2">
          {onSkip ? (
            <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={() => runUserAction(onSkip)}>
              {disabled ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}

              {t("WikiSetup.skip")}
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
