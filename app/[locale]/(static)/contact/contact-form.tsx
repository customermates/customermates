"use client";

import { CheckCircle2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ContactForm = observer(() => {
  const t = useTranslations("ContactPage.form");
  const { contactStore } = useRootStore();
  const { isLoading, isSent, reset } = contactStore;

  if (isSent) {
    return (
      <AppCard>
        <AppCardBody className="items-center gap-4 text-center py-10">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>

          <h2 className="text-x-2xl">{t("successTitle")}</h2>

          <p className="text-x-sm text-subdued max-w-md">{t("successBody")}</p>

          <Button className="mt-2" variant="outline" onClick={reset}>
            {t("successCta")}
          </Button>
        </AppCardBody>
      </AppCard>
    );
  }

  return (
    <AppForm store={contactStore}>
      <AppCard>
        <AppCardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput required autoComplete="name" id="name" />

            <FormInput required autoComplete="email" id="email" type="email" />
          </div>

          <FormInput autoComplete="organization" id="company" />

          <FormTextarea required id="message" placeholder={t("messagePlaceholder")} rows={6} />
        </AppCardBody>

        <AppCardFooter>
          <Button className="ml-auto" disabled={isLoading} type="submit">
            {t("submit")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
