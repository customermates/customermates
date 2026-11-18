"use client";

import type {
  PublicFormSubmitResult,
  PublicFormView as PublicFormModel,
  SubmitPublicFormInput,
} from "@/features/public-form/public-form.schema";
import type { FormErrors, FormValues } from "./public-form-state";

import Image from "next/image";
import { useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { publicSignupHref } from "@/core/utils/public-signup";
import { brandStyle } from "@/features/workspace-brand/brand-color";

import { PublicFormFieldInput } from "./public-form-field-input";
import { initialFormValues, missingFormValues } from "./public-form-state";

type Props = {
  form: PublicFormModel;
  token: string;
  locale: string;
  embedded: boolean;
  doneMessage?: string;
  onSubmit?: (input: SubmitPublicFormInput) => Promise<PublicFormSubmitResult>;
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
      <Image
        alt=""
        className="size-4 rounded dark:hidden"
        height={16}
        src="/images/light/customermates-square.svg"
        width={16}
      />

      <Image
        alt=""
        className="hidden size-4 rounded dark:block"
        height={16}
        src="/images/dark/customermates-square.svg"
        width={16}
      />

      <span>{t("PublicForm.badge")}</span>
    </a>
  );
}

function WorkspaceMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const t = useTranslations();
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "";

  return (
    <div className="flex items-center gap-2.5" data-public-form-workspace="">
      {logoUrl ? (
        <BrandLogo name={name} src={logoUrl} />
      ) : (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
        >
          {initial}
        </span>
      )}

      <p className="min-w-0 truncate text-xs text-muted-foreground">{t("PublicForm.byline", { workspace: name })}</p>
    </div>
  );
}

function FormCard({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-2xl border border-border bg-card",
        embedded ? "p-5" : "p-6 shadow-sm md:p-8",
      )}
      data-public-form-card=""
    >
      {children}
    </div>
  );
}

export function PublicFormView({ form, token, locale, embedded, doneMessage, onSubmit }: Props) {
  const t = useTranslations();
  const [values, setValues] = useState<FormValues>(() => initialFormValues(form.fields));
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [sending, setSending] = useState(false);

  const locked = sending || !onSubmit;

  const submit = async () => {
    if (!onSubmit || locked) return;
    const missing = missingFormValues(form, values, { email, consent });
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;

    setSending(true);
    try {
      const result = await onSubmit({
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
  const shown: Phase = doneMessage === undefined ? phase : { kind: "sent", message: doneMessage };
  const accent = brandStyle(form.brand?.accentColor);
  const brandAccent = accent ? form.brand?.accentColor : undefined;
  const logoUrl = form.brand?.logoUrl;

  if (shown.kind !== "editing") {
    return (
      <div className={wrapper} data-brand-accent={brandAccent} id="public-form" style={accent}>
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <FormCard embedded={embedded}>
            {form.workspaceName ? <WorkspaceMark logoUrl={logoUrl} name={form.workspaceName} /> : null}

            <div className="flex flex-col items-start gap-3" role="status">
              {shown.kind === "sent" ? (
                <CircleCheck aria-hidden className="size-9 text-success" />
              ) : (
                <TriangleAlert aria-hidden className="size-9 text-muted-foreground" />
              )}

              <h1 className="text-xl font-semibold tracking-tight" id="public-form-sent-title">
                {shown.kind === "sent" ? t("PublicForm.sentTitle") : t("PublicForm.unavailableTitle")}
              </h1>

              <p className="text-sm text-muted-foreground" id="public-form-sent-message">
                {shown.kind === "sent" ? shown.message : t("PublicForm.blockedBody")}
              </p>
            </div>
          </FormCard>

          {form.badge ? <Badge /> : null}
        </main>
      </div>
    );
  }

  return (
    <div className={wrapper} data-brand-accent={brandAccent} id="public-form" style={accent}>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <FormCard embedded={embedded}>
          {form.workspaceName ? <WorkspaceMark logoUrl={logoUrl} name={form.workspaceName} /> : null}

          <header className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight" id="public-form-title">
              {form.title}
            </h1>

            {form.description ? <p className="text-sm text-muted-foreground">{form.description}</p> : null}
          </header>

          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              runUserAction(() => submit());
            }}
          >
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
                    aria-required
                    aria-invalid={Boolean(errors.email)}
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

            <div aria-hidden className="absolute -left-[9999px] size-0 overflow-hidden">
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
        </FormCard>

        {form.badge ? <Badge /> : null}
      </main>
    </div>
  );
}
