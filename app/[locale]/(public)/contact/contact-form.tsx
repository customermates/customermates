"use client";

import { CheckCircle2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ContactForm = observer(() => {
  const t = useTranslations();
  const { contactStore } = useRootStore();
  const { isLoading, isSent, reset } = contactStore;

  if (isSent) {
    return (
      <AppCard className="bg-card shadow-none">
        <AppCardBody className="items-center gap-4 text-center py-10">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>

          <h2 className="text-2xl font-medium tracking-tight text-balance">{t("ContactPage.form.successTitle")}</h2>

          <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("ContactPage.form.successBody")}</p>

          <Button className="mt-2" variant="secondary" onClick={reset}>
            {t("ContactPage.form.successCta")}
          </Button>
        </AppCardBody>
      </AppCard>
    );
  }

  return (
    <AppForm store={contactStore}>
      <AppCard className="bg-card shadow-none">
        <AppCardBody>
          <div className="flex items-center gap-4 pb-1">
            <AppImage
              alt=""
              className="size-12 shrink-0 rounded-full object-cover"
              height={800}
              sizes="48px"
              src="benjamin-wagner.png"
              width={800}
            />

            <div className="min-w-0">
              <p className="text-sm font-medium tracking-tight">{t("ContactPage.form.founderName")}</p>

              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("ContactPage.form.founderRole")}</p>

              <p className="mt-1 text-sm leading-5 text-muted-foreground">{t("ContactPage.form.founderNote")}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput required autoComplete="name" id="name" />

            <FormInput required autoComplete="email" id="email" type="email" />
          </div>

          <FormInput autoComplete="organization" id="company" />

          <FormTextarea required id="message" placeholder={t("ContactPage.form.messagePlaceholder")} rows={6} />

          <FormCheckbox
            required
            errorMessage={t("ContactPage.form.privacyAcknowledgementRequired")}
            id="privacyAcknowledged"
            label={t.rich("ContactPage.form.privacyAcknowledgement", {
              dataPrivacyLink: (chunks) => (
                <AppLink inheritSize appearance="inline" href="/privacy" target="_blank">
                  {chunks}
                </AppLink>
              ),
            })}
          />
        </AppCardBody>

        <AppCardFooter>
          <Button className="ml-auto" disabled={isLoading} type="submit">
            {t("ContactPage.form.submit")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
