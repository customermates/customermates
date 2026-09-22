"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { startWikiHomepageSetupAction } from "@/app/[locale]/(protected)/wiki/setup-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { IntlLink, useRouter } from "@/i18n/navigation";

type Props = {
  canStart?: boolean;
  disabled?: boolean;
  initialState?: WikiHomepageSetupState;
  onboarding?: boolean;
  onAccepted: (conversationId: string) => void | Promise<void>;
  onContinue?: () => void | Promise<void>;
  onCreateBlank?: () => void;
  onSkip?: () => void | Promise<void>;
};

export const EMPTY_WIKI_HOMEPAGE_SETUP_STATE: WikiHomepageSetupState = {
  status: "idle",
  homepage: null,
  domain: null,
  conversationId: null,
  pages: [],
};
export function WikiHomepageSetup({
  canStart = true,
  disabled = false,
  initialState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  onboarding = false,
  onAccepted,
  onContinue,
  onCreateBlank,
  onSkip,
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
  const topics = [
    { id: "company", label: t("WikiSetup.topics.company") },
    { id: "products", label: t("WikiSetup.topics.products") },
    { id: "customers", label: t("WikiSetup.topics.customers") },
    { id: "voice", label: t("WikiSetup.topics.voice") },
    { id: "support", label: t("WikiSetup.topics.support") },
  ] as const;

  useEffect(() => {
    setState(initialState);
    if (initialState.homepage) setHomepage(initialState.homepage);
    if (initialState.status === "completed") setRetrying(false);
  }, [initialState]);

  useEffect(() => {
    if (state.status !== "working") return;
    const poll = globalThis.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 2_500);
    return () => globalThis.clearInterval(poll);
  }, [router, state.status]);

  useEffect(() => {
    if (retrying) homepageInput.current?.focus();
  }, [retrying]);

  useEffect(() => {
    if (!canStart) setRetrying(false);
  }, [canStart]);

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
      setState({
        status: "working",
        homepage: canonicalHomepage,
        domain,
        conversationId,
        pages: [],
      });
      setHomepage(canonicalHomepage);
      setRetrying(false);
      await onAccepted(conversationId);
      router.refresh();
      setClientRequestId(crypto.randomUUID());
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const openConversation = () => {
    const conversationId = state.conversationId;
    if (conversationId) runUserAction(() => onAccepted(conversationId));
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
    const completedBody = !state.homepage
      ? t("WikiSetup.status.completedExistingBody")
      : onboarding
        ? t("WikiSetup.status.completedBodyOnboarding")
        : t("WikiSetup.status.completedBody");
    return (
      <section aria-live="polite" className="w-full space-y-5 text-left">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-muted p-2 text-muted-foreground">
            {working ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : completed ? (
              <CheckCircle2 className="size-4 text-success" />
            ) : (
              <TriangleAlert className="size-4 text-warning" />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <h2 className="font-medium">
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

        {completed ? (
          <div className="grid gap-1.5">
            {state.pages.map((page) =>
              onboarding ? (
                <div key={page.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <FileText className="text-muted-foreground" />

                  <span className="truncate">{page.title}</span>
                </div>
              ) : (
                <Button key={page.id} asChild className="h-auto justify-start px-3 py-2 font-normal" variant="ghost">
                  <IntlLink href={wikiPagePath(page.id)}>
                    <FileText className="text-muted-foreground" />

                    <span className="truncate">{page.title}</span>
                  </IntlLink>
                </Button>
              ),
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {canStart && !working && !completed ? (
            <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={() => setRetrying(true)}>
              <RotateCcw />

              {t("WikiSetup.tryAnother")}
            </Button>
          ) : null}

          {!working && !completed && onCreateBlank ? (
            <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={onCreateBlank}>
              <FileText />

              {t("WikiSetup.createBlank")}
            </Button>
          ) : null}

          {state.conversationId ? (
            <Button
              data-agent-focus-return
              disabled={controlsDisabled}
              type="button"
              variant="secondary"
              onClick={openConversation}
            >
              <ExternalLink />

              {t("WikiSetup.openTask")}
            </Button>
          ) : null}

          {onContinue ? (
            <Button disabled={controlsDisabled} type="button" onClick={() => runUserAction(onContinue)}>
              {t("WikiSetup.continue")}
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
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("WikiSetup.description")}</p>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />

              <span>{topic.label}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">{t("WikiSetup.gapsNote")}</p>
      </div>

      <div>
        <Label htmlFor="wiki-homepage">{t("WikiSetup.homepageLabel")}</Label>

        <div className="relative mt-1.5">
          <Globe2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            ref={homepageInput}
            aria-describedby="wiki-homepage-help"
            autoComplete="url"
            className="pl-9"
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

        <p className="mt-2 text-xs text-muted-foreground" id="wiki-homepage-help">
          {t("WikiSetup.homepageHelp")}
        </p>
      </div>

      <span aria-live="polite" className="sr-only">
        {isSubmitting ? t("WikiSetup.start") : ""}
      </span>

      <div className="flex flex-wrap justify-end gap-2">
        {onSkip ? (
          <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={() => runUserAction(onSkip)}>
            {t("WikiSetup.skip")}
          </Button>
        ) : null}

        {onCreateBlank ? (
          <Button disabled={controlsDisabled} type="button" variant="secondary" onClick={onCreateBlank}>
            {t("WikiSetup.createBlank")}
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
