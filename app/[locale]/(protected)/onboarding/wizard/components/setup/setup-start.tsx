"use client";

import { Globe, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

export const SetupStart = observer(function SetupStart() {
  const t = useTranslations();
  const { workspaceSetupStore: store, stepProfileStore } = useRootStore();
  const [fromProfile] = useState(() => ({
    submitted: stepProfileStore.form.email.length > 0,
    website: stepProfileStore.form.websiteUrl.trim(),
  }));
  const [website, setWebsite] = useState(fromProfile.website);
  const [autoStarting, setAutoStarting] = useState(fromProfile.submitted);
  const starting = store.pending === "start";
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!fromProfile.submitted || autoStarted.current) return;
    autoStarted.current = true;
    runUserAction(async () => {
      if (!(await store.start(fromProfile.website || null))) setAutoStarting(false);
    });
  }, [fromProfile, store]);

  if (autoStarting) {
    return (
      <div aria-busy="true" className="flex min-h-36 items-center justify-center" role="status">
        <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />

        <span className="sr-only">{t("WorkspaceSetup.start.start")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-website">{t("Common.inputs.websiteUrl")}</Label>

        <div className="relative">
          <Globe
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />

          <Input
            autoComplete="url"
            className="pl-9"
            disabled={store.isBusy}
            id="setup-website"
            inputMode="url"
            placeholder={t("OnboardingWizard.profile.websitePlaceholder")}
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !website.trim()) return;
              event.preventDefault();
              runUserAction(() => store.start(website.trim()));
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">{t("OnboardingWizard.profile.websiteDescription")}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={store.isBusy}
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => store.start(null))}
        >
          {t("WorkspaceSetup.start.withoutWebsite")}
        </Button>

        <Button
          disabled={store.isBusy || !website.trim()}
          type="button"
          onClick={() => runUserAction(() => store.start(website.trim()))}
        >
          {starting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("WorkspaceSetup.start.start")}
        </Button>
      </div>
    </div>
  );
});
