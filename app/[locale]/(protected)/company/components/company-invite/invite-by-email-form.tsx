"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppForm } from "@/components/forms/form-context";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { useRootStore } from "@/core/stores/root-store.provider";

import { MAX_INVITE_EMAILS } from "./invite-by-email.store";

export const InviteByEmailForm = observer(() => {
  const t = useTranslations("OnboardingWizard.invite");
  const { inviteByEmailStore: store } = useRootStore();
  const { form, isLoading } = store;

  return (
    <AppForm className="flex flex-col gap-2" store={store}>
      <FormInputChips arrayMode id="emails" placeholder={form.emails.length === 0 ? t("emailPlaceholder") : ""} />

      <p className="text-xs text-muted-foreground">
        {t("emailCount", { current: form.emails.length, max: MAX_INVITE_EMAILS })}
      </p>

      <div className="flex justify-end">
        <Button disabled={form.emails.length === 0 || isLoading} size="sm" type="submit">
          {isLoading && <Loader2 className="size-4 animate-spin" />}

          {t("send")}
        </Button>
      </div>
    </AppForm>
  );
});
