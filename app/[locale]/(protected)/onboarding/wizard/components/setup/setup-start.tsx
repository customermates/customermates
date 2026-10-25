"use client";

import { Globe, ListChecks, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

export const SetupStartEmpty = observer(function SetupStartEmpty() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        className="self-center text-muted-foreground"
        disabled={store.isBusy || wizard.isSubmitting}
        size="sm"
        type="button"
        variant="ghost"
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
        onConfirm={wizard.startEmpty}
      />
    </>
  );
});

export const SetupStart = observer(function SetupStart() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const [website, setWebsite] = useState("");
  const [startedWith, setStartedWith] = useState<"website" | "questions" | null>(null);
  const busy = store.isBusy;
  const readWebsite = () => {
    const url = website.trim();
    if (!url) return;
    setStartedWith("website");
    runUserAction(() => store.start(url));
  };

  return (
    <div aria-label={t("WorkspaceSetup.start.optionsLabel")} className="flex flex-col gap-3" role="group">
      <div className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-2">
            <Globe aria-hidden className="size-4 text-primary" />

            <span className="text-sm font-medium" id="setup-website-title">
              {t("WorkspaceSetup.start.website.title")}
            </span>
          </span>

          <Badge>{t("WorkspaceSetup.start.website.recommended")}</Badge>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{t("WorkspaceSetup.start.website.description")}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
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
              if (event.key !== "Enter") return;
              event.preventDefault();
              readWebsite();
            }}
          />

          <Button disabled={busy || !website.trim()} type="button" onClick={readWebsite}>
            {busy && startedWith === "website" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

            {t("WorkspaceSetup.start.website.action")}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">{t("WorkspaceSetup.start.website.note")}</p>
      </div>

      <Button
        className="h-auto w-full flex-col items-start justify-start gap-1 whitespace-normal rounded-xl p-4 text-left"
        disabled={busy}
        type="button"
        variant="secondary"
        onClick={() => {
          setStartedWith("questions");
          runUserAction(() => store.start(null));
        }}
      >
        <span className="flex items-center gap-2">
          {busy && startedWith === "questions" ? (
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <ListChecks aria-hidden className="size-4" />
          )}

          <span className="text-sm font-medium">{t("WorkspaceSetup.start.questions.title")}</span>
        </span>

        <span className="text-xs font-normal leading-relaxed text-muted-foreground">
          {t("WorkspaceSetup.start.questions.description")}
        </span>
      </Button>

      <SetupStartEmpty />
    </div>
  );
});
