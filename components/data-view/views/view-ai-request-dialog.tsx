"use client";

import type { FormEvent } from "react";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";

import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  value: string;
  disabledReason?: string;
  focusReturnTarget: HTMLElement | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onReopen: () => void;
  onSend: (text: string) => boolean;
};

export function ViewAiRequestDialog({
  open,
  title,
  description,
  label,
  placeholder,
  value,
  disabledReason,
  focusReturnTarget,
  onChange,
  onClose,
  onReopen,
  onSend,
}: Props) {
  const t = useTranslations();
  const pendingRequest = useRef<string | null>(null);
  const disabled = Boolean(disabledReason) || !value.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pendingRequest.current) return;
    pendingRequest.current = value.trim();
    onClose();
  }

  return (
    <AppModal
      description={description}
      focusReturnTarget={focusReturnTarget}
      open={open}
      size="sm"
      title={title}
      onClose={onClose}
      onCloseAutoFocus={(event) => {
        const request = pendingRequest.current;
        if (!request) return;
        event.preventDefault();
        pendingRequest.current = null;
        if (onSend(request)) onChange("");
        else onReopen();
      }}
    >
      <AppCard>
        <AppCardHeader>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{title}</h2>

            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </AppCardHeader>

        <AppCardBody>
          <form className="flex flex-col gap-2" id="view-ai-request-form" onSubmit={submit}>
            <Label htmlFor="view-ai-request-input">{label}</Label>

            <Textarea
              autoFocus
              required
              aria-describedby={disabledReason ? "view-ai-request-status" : undefined}
              className="min-h-28 max-h-64 resize-none"
              id="view-ai-request-input"
              maxLength={4000}
              placeholder={placeholder}
              rows={4}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />

            {disabledReason && (
              <p className="text-sm text-muted-foreground" id="view-ai-request-status" role="status">
                {disabledReason}
              </p>
            )}
          </form>
        </AppCardBody>

        <AppCardFooter>
          <Button id="view-ai-request-cancel" variant="secondary" onClick={onClose}>
            {t("Common.actions.cancel")}
          </Button>

          <Button disabled={disabled} form="view-ai-request-form" id="view-ai-request-submit" type="submit">
            {t("DataView.views.aiRequest.submit")}

            <ArrowUpRight aria-hidden className="size-4" />
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
}
