"use client";

import type { ReactNode } from "react";
import type { ContactFormErrors, ContactFormField, ContactFormValues } from "./contact-form.state";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { sendContactInquiryAction } from "./actions";
import { EMPTY_CONTACT_FORM, hasFieldError, isContactFormDirty, toContactInquiry } from "./contact-form.state";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type FieldLabelProps = {
  children: ReactNode;
  field: ContactFormField;
  invalid: boolean;
  required?: boolean;
};

function FieldLabel({ children, field, invalid, required }: FieldLabelProps) {
  return (
    <Label
      className={cn("gap-0 text-xs font-normal text-muted-foreground", invalid && "text-destructive")}
      htmlFor={field}
    >
      {children}

      {required ? <span className="text-destructive"> *</span> : null}
    </Label>
  );
}

type FieldErrorProps = {
  field: ContactFormField;
  message: string;
};

function FieldError({ field, message }: FieldErrorProps) {
  return (
    <p className="text-xs text-destructive" id={`${field}-error`} role="alert">
      {message}
    </p>
  );
}

export function ContactForm() {
  const t = useTranslations();
  const [form, setForm] = useState<ContactFormValues>(EMPTY_CONTACT_FORM);
  const [errors, setErrors] = useState<ContactFormErrors>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const isDirty = isContactFormDirty(form);

  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function change<Field extends ContactFormField>(field: Field, value: ContactFormValues[Field]) {
    const next = { ...form, [field]: value };
    setForm(next);
    if (!isContactFormDirty(next)) setErrors(undefined);
  }

  function reset() {
    setIsSent(false);
    setForm(EMPTY_CONTACT_FORM);
    setErrors(undefined);
  }

  async function submit() {
    setIsLoading(true);

    try {
      const result = await sendContactInquiryAction(toContactInquiry(form));

      if (result.ok) {
        setIsSent(true);
        setForm(EMPTY_CONTACT_FORM);
        setErrors(undefined);
        toast.success(t("ContactPage.form.successToast"));
      } else {
        const nextErrors = result.error as ContactFormErrors;

        setErrors(nextErrors);
        if (Object.keys(nextErrors.properties ?? {}).length > 0) toast.error(t("ContactPage.form.errors.checkFields"));
        else toastZodErrorTree(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const invalid = (field: ContactFormField) => hasFieldError(errors, field);
  const privacyInvalid = invalid("privacyAcknowledged");
  const describedBy = (field: ContactFormField) => (invalid(field) ? `${field}-error` : undefined);
  const messageError =
    form.message.trim().length >= 10
      ? t("ContactPage.form.errors.messageTooLong")
      : t("ContactPage.form.errors.messageTooShort");

  return (
    <>
      <UnexpectedErrorToaster />

      {isSent ? (
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
      ) : (
        <form
          noValidate
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            runUserAction(submit);
          }}
        >
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
                <div className="space-y-1.5">
                  <FieldLabel required field="name" invalid={invalid("name")}>
                    {t("Common.inputs.name")}
                  </FieldLabel>

                  <Input
                    required
                    aria-describedby={describedBy("name")}
                    aria-invalid={invalid("name")}
                    autoComplete="name"
                    disabled={isLoading}
                    id="name"
                    value={form.name}
                    onChange={(event) => change("name", event.target.value)}
                  />

                  {invalid("name") ? <FieldError field="name" message={t("ContactPage.form.errors.name")} /> : null}
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required field="email" invalid={invalid("email")}>
                    {t("Common.inputs.email")}
                  </FieldLabel>

                  <Input
                    required
                    aria-describedby={describedBy("email")}
                    aria-invalid={invalid("email")}
                    autoComplete="email"
                    disabled={isLoading}
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => change("email", event.target.value)}
                  />

                  {invalid("email") ? <FieldError field="email" message={t("ContactPage.form.errors.email")} /> : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel field="company" invalid={invalid("company")}>
                  {t("Common.inputs.company")}
                </FieldLabel>

                <Input
                  aria-describedby={describedBy("company")}
                  aria-invalid={invalid("company")}
                  autoComplete="organization"
                  disabled={isLoading}
                  id="company"
                  value={form.company}
                  onChange={(event) => change("company", event.target.value)}
                />

                {invalid("company") ? (
                  <FieldError field="company" message={t("ContactPage.form.errors.company")} />
                ) : null}
              </div>

              <div className="space-y-1.5">
                <FieldLabel required field="message" invalid={invalid("message")}>
                  {t("Common.inputs.message")}
                </FieldLabel>

                <Textarea
                  required
                  aria-describedby={describedBy("message")}
                  aria-invalid={invalid("message")}
                  disabled={isLoading}
                  id="message"
                  placeholder={t("ContactPage.form.messagePlaceholder")}
                  rows={6}
                  value={form.message}
                  onChange={(event) => change("message", event.target.value)}
                />

                {invalid("message") ? <FieldError field="message" message={messageError} /> : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    aria-required
                    aria-describedby={privacyInvalid ? "privacyAcknowledged-error" : undefined}
                    aria-invalid={privacyInvalid}
                    checked={form.privacyAcknowledged}
                    disabled={isLoading}
                    id="privacyAcknowledged"
                    onCheckedChange={(next) => change("privacyAcknowledged", next === true)}
                  />

                  <FieldLabel field="privacyAcknowledged" invalid={privacyInvalid}>
                    <span>
                      {t.rich("ContactPage.form.privacyAcknowledgement", {
                        dataPrivacyLink: (chunks) => (
                          <AppLink inheritSize appearance="inline" href="/privacy" target="_blank">
                            {chunks}
                          </AppLink>
                        ),
                      })}

                      <span className="text-destructive"> *</span>
                    </span>
                  </FieldLabel>
                </div>

                {privacyInvalid ? (
                  <p className="text-xs text-destructive" id="privacyAcknowledged-error" role="alert">
                    {t("ContactPage.form.privacyAcknowledgementRequired")}
                  </p>
                ) : null}
              </div>
            </AppCardBody>

            <AppCardFooter>
              <Button className="ml-auto" disabled={isLoading} type="submit">
                {t("ContactPage.form.submit")}
              </Button>
            </AppCardFooter>
          </AppCard>
        </form>
      )}
    </>
  );
}
