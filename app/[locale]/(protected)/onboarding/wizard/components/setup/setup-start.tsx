"use client";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { ChoiceCard } from "@/components/shared/choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

export const SetupStartEmpty = observer(function SetupStartEmpty({ inline = false }: { inline?: boolean }) {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        className={inline ? "h-auto p-0 text-xs" : "self-center text-muted-foreground"}
        disabled={store.isBusy || wizard.isSubmitting}
        size="sm"
        type="button"
        variant={inline ? "link" : "ghost"}
        onClick={() => setConfirming(true)}
      >
        {t("WorkspaceSetup.empty.action")}
      </Button>

      <ConfirmDialog
        anchorScope="setup-empty-confirm"
        confirmLabel={t("WorkspaceSetup.empty.confirm")}
        confirmVariant="default"
        description={t("WorkspaceSetup.empty.description")}
        open={confirming}
        title={t("WorkspaceSetup.empty.title")}
        onCancel={() => setConfirming(false)}
        onConfirm={wizard.completeSetupStep}
      />
    </>
  );
});

const SetupStartWebsite = observer(function SetupStartWebsite({ onBack }: { onBack: () => void }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const [website, setWebsite] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const busy = store.isBusy;
  const readWebsite = () => {
    const url = website.trim();
    if (!url) return;
    runUserAction(() => store.start(url));
  };

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4 shadow-sm">
      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-sm font-medium" id="setup-website-title">
          {t("WorkspaceSetup.start.website.title")}
        </span>

        <Badge>{t("WorkspaceSetup.start.website.recommended")}</Badge>
      </span>

      <span className="text-xs leading-relaxed text-muted-foreground">
        {t("WorkspaceSetup.start.website.description")}
      </span>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={input}
          aria-labelledby="setup-website-title"
          autoComplete="url"
          className="flex-1"
          disabled={busy}
          id="setup-website"
          inputMode="url"
          placeholder={t("OnboardingWizard.profile.websitePlaceholder")}
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              readWebsite();
            }
            if (event.key === "Escape" && !busy) {
              event.preventDefault();
              onBack();
            }
          }}
        />

        <Button disabled={busy || !website.trim()} type="button" onClick={readWebsite}>
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("WorkspaceSetup.start.website.action")}
        </Button>
      </div>

      <div>
        <Button disabled={busy} type="button" variant="secondary" onClick={onBack}>
          {t("Common.actions.back")}
        </Button>
      </div>
    </div>
  );
});

export const SetupStart = observer(function SetupStart() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const [withWebsite, setWithWebsite] = useState(false);
  const websiteChoice = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  const busy = store.isBusy;

  useEffect(() => {
    if (withWebsite || !returning.current) return;
    returning.current = false;
    websiteChoice.current?.focus();
  }, [withWebsite]);

  return (
    <div aria-busy={busy} className="flex flex-col gap-5">
      {withWebsite ? (
        <SetupStartWebsite
          onBack={() => {
            returning.current = true;
            setWithWebsite(false);
          }}
        />
      ) : (
        <div
          aria-label={t("WorkspaceSetup.start.optionsLabel")}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          role="group"
        >
          <ChoiceCard
            ref={websiteChoice}
            badge={<Badge>{t("WorkspaceSetup.start.website.recommended")}</Badge>}
            className="border-2 border-primary bg-primary/5 shadow-sm"
            description={t("WorkspaceSetup.start.website.description")}
            disabled={busy}
            note={t("WorkspaceSetup.start.website.note")}
            title={t("WorkspaceSetup.start.website.title")}
            onClick={() => setWithWebsite(true)}
          />

          <ChoiceCard
            description={t("WorkspaceSetup.start.questions.description")}
            disabled={busy}
            note={t("WorkspaceSetup.start.questions.note")}
            title={t("WorkspaceSetup.start.questions.title")}
            onClick={() => runUserAction(() => store.start(null))}
          />
        </div>
      )}

      <span aria-live="polite" className="sr-only" role="status">
        {busy ? t("PageState.loading") : ""}
      </span>

      <p className="flex flex-wrap items-center justify-center gap-1 text-center text-xs leading-relaxed text-muted-foreground">
        <span>{t("WorkspaceSetup.start.emptyPrompt")}</span>

        <SetupStartEmpty inline />
      </p>
    </div>
  );
});
