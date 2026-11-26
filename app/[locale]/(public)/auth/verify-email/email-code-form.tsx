"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import {
  EMAIL_CODE_EXPIRES_IN_MINUTES,
  EMAIL_CODE_LENGTH,
  emailCodeDigits,
  type EmailCodeFailure,
} from "@/features/auth/email-code";
import { resendVerificationEmailFromAuthAction, verifyEmailCodeAction } from "@/app/[locale]/(public)/auth/actions";

export const EMAIL_CODE_RESEND_SECONDS = 45;

type Props = {
  idPrefix: string;
  email: string;
  sendOnMount?: boolean;
  startWithCooldown?: boolean;
  onVerified: () => void;
};

export function EmailCodeForm({ idPrefix, email, sendOnMount = false, startWithCooldown = false, onVerified }: Props) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const sentOnMount = useRef(false);
  const lastSubmitted = useRef<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<EmailCodeFailure | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(startWithCooldown ? EMAIL_CODE_RESEND_SECONDS : 0);
  const inputId = `${idPrefix}-code`;
  const errorId = `${idPrefix}-code-error`;
  const hintId = `${idPrefix}-code-hint`;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((current) => current - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const send = async () => {
    setSending(true);
    try {
      const result = await resendVerificationEmailFromAuthAction();
      if (!result.ok) {
        toast.error(
          result.error === "rateLimited"
            ? t("EmailCode.rateLimited")
            : result.error === "signedOut"
              ? t("EmailCode.errors.signedOut")
              : t("Common.notifications.unexpectedError"),
        );
        return;
      }
      setCode("");
      setError(null);
      lastSubmitted.current = null;
      setSecondsLeft(EMAIL_CODE_RESEND_SECONDS);
      toast.success(t("EmailCode.sent", { email }));
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (sentOnMount.current) return;
    sentOnMount.current = true;
    inputRef.current?.focus();
    if (sendOnMount) runUserAction(send);
  });

  const verify = async (value: string) => {
    if (verifying || verified) return;
    lastSubmitted.current = value;
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyEmailCodeAction({ code: value });
      if (result.ok) {
        setVerified(true);
        onVerified();
        return;
      }
      setError(result.error);
      inputRef.current?.select();
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = emailCodeDigits(event.target.value);
    setCode(digits);
    if (error && digits !== lastSubmitted.current) setError(null);
    if (digits.length === EMAIL_CODE_LENGTH && digits !== lastSubmitted.current) runUserAction(() => verify(digits));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.length !== EMAIL_CODE_LENGTH) {
      setError("invalid");
      inputRef.current?.focus();
      return;
    }
    runUserAction(() => verify(code));
  };

  const busy = verifying || verified;

  return (
    <form noValidate className="flex w-full flex-col gap-3" id={`${idPrefix}-form`} onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>{t("EmailCode.label")}</Label>

        <Input
          ref={inputRef}
          aria-busy={verifying || undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          aria-invalid={error ? true : undefined}
          autoComplete="one-time-code"
          className="h-12 text-center font-mono text-2xl tracking-[0.5em] md:text-2xl"
          enterKeyHint="done"
          id={inputId}
          inputMode="numeric"
          name="code"
          pattern="[0-9]*"
          readOnly={busy}
          spellCheck={false}
          type="text"
          value={code}
          onChange={onChange}
        />

        {error ? (
          <p aria-live="assertive" className="text-sm text-destructive" id={errorId} role="alert">
            {error === "expired"
              ? t("EmailCode.errors.expired")
              : error === "tooManyAttempts"
                ? t("EmailCode.errors.tooManyAttempts")
                : error === "signedOut"
                  ? t("EmailCode.errors.signedOut")
                  : t("EmailCode.errors.invalid")}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground" id={hintId}>
          {t("EmailCode.hint", { minutes: EMAIL_CODE_EXPIRES_IN_MINUTES })}
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-2 max-sm:flex-col max-sm:items-stretch">
        <Button className="min-h-11" disabled={busy} id={`${idPrefix}-submit`} type="submit">
          {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}

          {t("EmailCode.submit")}
        </Button>

        <Button
          className="min-h-11"
          disabled={sending || busy || secondsLeft > 0}
          id={`${idPrefix}-resend`}
          type="button"
          variant="ghost"
          onClick={() => runUserAction(send)}
        >
          {sending ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}

          {secondsLeft > 0 ? t("EmailCode.resendIn", { seconds: secondsLeft }) : t("EmailCode.resend")}
        </Button>
      </div>
    </form>
  );
}
