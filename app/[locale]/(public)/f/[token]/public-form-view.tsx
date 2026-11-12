"use client";

import type { FormEvent } from "react";
import type { PublicFormView as PublicFormModel } from "@/features/public-form/public-form.schema";
import type { FormErrors, FormValues } from "./public-form-state";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/core/utils/cn";

import { publicSignupHref } from "../../p/[token]/public-signup";
import { submitPublicFormAction } from "./actions";
import { PublicFormFieldInput } from "./public-form-field-input";
import { initialFormValues, missingFormValues } from "./public-form-state";

type Props = {
  form: PublicFormModel;
  token: string;
  locale: string;
  embedded: boolean;
  preview?: boolean;
};

type Phase = { kind: "editing" } | { kind: "sent"; message: string } | { kind: "blocked" };

function leave(redirectUrl: string, embedded: boolean) {
  if (embedded) window.open(redirectUrl, "_top", "noopener");
  else window.location.assign(redirectUrl);
}

function Badge() {
  const t = useTranslations();

  return (
    <a
      className="group mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
      href={publicSignupHref("form")}
      id="public-form-badge"
      rel="noopener"
      target="_top"
    >
      <Image alt="" className="size-4 rounded dark:hidden" height={16} src="/images/light/customermates-square.svg" width={16} />

      <Image alt="" className="hidden size-4 rounded dark:block" height={16} src="/images/dark/customermates-square.svg" width={16} />

      <span>{t("PublicForm.badge")}</span>
    </a>
  );
}

export function PublicFormView({ form, token, locale, embedded, preview = false }: Props) {
  const t = useTranslations();
  const [values, setValues] = useState<FormValues>(() => initialFormValues(form.fields));
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [sending, setSending] = useState(false);

  const locked = sending || preview;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked) return;
    const missing = missingFormValues(form, values, { email, consent });
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;

    setSending(true);
    try {
      const result = await submitPublicFormAction({
        token,
        renderToken: form.renderToken,
        locale,
        website,
        consent,
        email: form.person ? email : undefined,
        name: form.person?.nameLabel ? name : undefined,
        answers: values,
      });
      if (result.status === "submitted") {
        setPhase({ kind: "sent", message: result.message });
        if (result.redirectUrl) leave(result.redirectUrl, embedded);
      } else if (result.status === "invalid") setErrors(result.errors);
      else setPhase({ kind: "blocked" });
    } catch {
      setPhase({ kind: "blocked" });
    } finally {
      setSending(false);
    }
  };

  const wrapper = cn("min-h-full w-full bg-background", embedded ? "p-0" : "px-4 py-8 md:py-12");

  if (phase.kind !== "editing")
    return (
      <div className={wrapper} id="public-form">
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4" role="status">
          <h1 className="text-xl font-semibold tracking-tight" id="public-form-sent-title">
            {phase.kind === "sent" ? t("PublicForm.sentTitle") : t("PublicForm.unavailableTitle")}
          </h1>

          <p className="text-sm text-muted-foreground" id="public-form-sent-message">
            {phase.kind === "sent" ? phase.message : t("PublicForm.blockedBody")}
          </p>
        </main>
      </div>
    );

  return (
    <div className={wrapper} id="public-form">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight" id="public-form-title">
            {form.title}
          </h1>

          {form.description ? <p className="text-sm text-muted-foreground">{form.description}</p> : null}

          {form.workspaceName ? (
            <p className="text-xs text-muted-foreground">{t("PublicForm.byline", { workspace: form.workspaceName })}</p>
          ) : null}
        </header>

        <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
          {Object.keys(errors).length > 0 ? (
            <p className="text-sm text-destructive" id="public-form-error-summary" role="alert">
              {t("PublicForm.errors.summary")}
            </p>
          ) : null}

          {form.person ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="public-form-email">
                  {form.person.emailLabel}

                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>

                <Input
                  aria-invalid={Boolean(errors.email)}
                  aria-required
                  autoComplete="email"
                  disabled={locked}
                  id="public-form-email"
                  inputMode="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                {errors.email ? (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.email === "required" ? t("PublicForm.errors.required") : t("PublicForm.errors.email")}
                  </p>
                ) : null}
              </div>

              {form.person.nameLabel ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="public-form-name">{form.person.nameLabel}</Label>

                  <Input
                    autoComplete="name"
                    disabled={locked}
                    id="public-form-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {form.fields.map((field) => (
            <PublicFormFieldInput
              key={field.fieldId}
              disabled={locked}
              error={errors[field.fieldId]}
              field={field}
              value={values[field.fieldId]}
              onChange={(value) => setValues((current) => ({ ...current, [field.fieldId]: value }))}
            />
          ))}

          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="public-form-website">{t("PublicForm.honeypot")}</label>

            <input
              autoComplete="off"
              id="public-form-website"
              name="website"
              tabIndex={-1}
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          {form.consent ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <Checkbox
                  aria-invalid={Boolean(errors.consent)}
                  checked={consent}
                  disabled={locked}
                  id="public-form-consent"
                  onCheckedChange={(checked) => setConsent(checked === true)}
                />

                <Label className="flex-wrap leading-snug font-normal" htmlFor="public-form-consent">
                  {form.consent.text}

                  <a
                    className="text-primary underline underline-offset-4"
                    href={form.consent.privacyUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("PublicForm.privacyNotice")}
                  </a>
                </Label>
              </div>

              {errors.consent ? (
                <p className="text-xs text-destructive" role="alert">
                  {t("PublicForm.errors.consent")}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button disabled={locked} id="public-form-submit" size="lg" type="submit">
            {sending ? t("PublicForm.sending") : form.submitLabel}
          </Button>
        </form>

        {form.badge ? <Badge /> : null}
      </main>
    </div>
  );
}
