"use client";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { FormControlRow } from "@/components/forms/form-control-row";
import { FormLabel } from "@/components/forms/form-label";
import { GenericPageLoading } from "@/components/page-state/generic-page-loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div aria-busy="true" className="flex min-h-36">
        <GenericPageLoading label={t("Loading.text")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <FormLabel htmlFor="setup-website">{t("Common.inputs.websiteUrl")}</FormLabel>

        <FormControlRow>
          <Input
            autoComplete="url"
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
        </FormControlRow>

        <p className="text-xs text-muted-foreground">{t("OnboardingWizard.profile.websiteDescription")}</p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
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
