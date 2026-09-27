"use client";

import type { ReactNode } from "react";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, FileText, Loader2, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

import { startWikiHomepageSetupAction } from "@/app/[locale]/(protected)/wiki/setup-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import { useRouter } from "@/i18n/navigation";

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

export function WikiHomepageSetup({
  canStart = true,
  disabled = false,
  initialState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  onContinue,
  onSkip,
  renderConversation,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [homepage, setHomepage] = useState(initialState.homepage ?? "");
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const submitting = useRef(false);
  const homepageInput = useRef<HTMLInputElement>(null);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  const focusStatusAfterSubmit = useRef(false);

  useEffect(() => {
    setState(initialState);
    if (initialState.homepage) setHomepage(initialState.homepage);
    if (initialState.status === "completed") setRetrying(false);
  }, [initialState]);

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
    if (!canStart || disabled || !homepage.trim() || submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const result = await startWikiHomepageSetupAction({
        homepage,
        clientRequestId,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        setClientRequestId(crypto.randomUUID());
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
      setHomepage(canonicalHomepage);
      setRetrying(false);
      router.refresh();
      setClientRequestId(crypto.randomUUID());
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const showForm = state.status === "idle" || retrying;
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
    <form
      noValidate
      aria-busy={controlsDisabled}
      className="w-full space-y-5 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        runUserAction(submit);
      }}
    >
      <div>
        <Label htmlFor="wiki-homepage">{t("WikiSetup.homepageLabel")}</Label>

        <Input
          ref={homepageInput}
          autoComplete="url"
          className="mt-1.5"
          disabled={controlsDisabled}
          id="wiki-homepage"
          inputMode="url"
          placeholder={t("WikiSetup.homepagePlaceholder")}
          type="text"
          value={homepage}
          onChange={(event) => {
            setHomepage(event.currentTarget.value);
            setClientRequestId(crypto.randomUUID());
          }}
        />
      </div>

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

        <Button disabled={!canStart || !homepage.trim() || controlsDisabled} type="submit">
          {isSubmitting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}

          {t("WikiSetup.start")}
        </Button>
      </div>
    </form>
  );
}
