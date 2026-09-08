"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";

import { startWikiHomepageSetupAction } from "@/app/[locale]/(protected)/wiki/setup-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Props = {
  onAccepted: (conversationId: string) => void | Promise<void>;
  onSkip?: () => void;
};

export function WikiHomepageSetup({ onAccepted, onSkip }: Props) {
  const t = useTranslations();
  const [homepage, setHomepage] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const submit = async () => {
    if (!homepage.trim() || submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const result = await startWikiHomepageSetupAction({
        homepage,
        clientRequestId,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      const conversationId = result.data.conversationId;
      if (!conversationId) throw new Error("The Wiki setup conversation was not created.");
      await onAccepted(conversationId);
      setClientRequestId(crypto.randomUUID());
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      aria-busy={isSubmitting}
      className="w-full text-left"
      onSubmit={(event) => {
        event.preventDefault();
        runUserAction(submit);
      }}
    >
      <Label htmlFor="wiki-homepage">{t("WikiSetup.homepageLabel")}</Label>

      <Input
        aria-describedby="wiki-homepage-help"
        autoComplete="url"
        className="mt-1.5"
        disabled={isSubmitting}
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

      <p className="mt-2 text-xs text-muted-foreground" id="wiki-homepage-help">
        {t("WikiSetup.description")}
      </p>

      <span aria-live="polite" className="sr-only">
        {isSubmitting ? t("WikiSetup.start") : ""}
      </span>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {onSkip ? (
          <Button disabled={isSubmitting} type="button" variant="secondary" onClick={onSkip}>
            {t("WikiSetup.skip")}
          </Button>
        ) : null}

        <Button disabled={!homepage.trim() || isSubmitting} type="submit">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Sparkles />}

          {t("WikiSetup.start")}
        </Button>
      </div>
    </form>
  );
}
