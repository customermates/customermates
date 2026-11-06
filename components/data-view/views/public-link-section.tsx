"use client";

import type { PublicLinkStatus } from "@/features/public-link/public-link.schema";

import { Check, Copy, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { managePublicLinkAction } from "@/app/actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { copyToClipboard } from "@/core/utils/clipboard";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Props = { viewId: string; onChanged: () => Promise<void> };

export function PublicLinkSection({ viewId, onChanged }: Props) {
  const t = useTranslations();
  const [status, setStatus] = useState<PublicLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const { appMode } = useRootStore();
  const demo = appMode === "demo";

  useEffect(() => {
    if (demo) return;
    let active = true;
    managePublicLinkAction({ action: "read", viewId })
      .then((result) => {
        if (!active) return;
        if (result.ok) setStatus(result.data);
        else toastZodErrorTree(result.error);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [demo, viewId]);

  const apply = (request: Parameters<typeof managePublicLinkAction>[0], message: string) =>
    runUserAction(async () => {
      setBusy(true);
      try {
        const result = await managePublicLinkAction(request);
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        setStatus(result.data);
        setCopied(false);
        await onChanged();
        toast.success(message);
      } finally {
        setBusy(false);
      }
    });

  if (demo || !status) return null;
  const link = status.link;
  const blocked = !status.allowed && !link;

  return (
    <section
      aria-labelledby="share-view-public-title"
      className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3"
      id="share-view-public"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="flex items-center gap-2" htmlFor="share-view-public-switch" id="share-view-public-title">
            <Globe aria-hidden className="size-3.5 text-muted-foreground" />

            {t("DataView.share.public.title")}
          </Label>

          <span className="text-xs text-muted-foreground">{t("DataView.share.public.description")}</span>
        </div>

        <Switch
          checked={link !== null}
          disabled={busy || (blocked && link === null)}
          id="share-view-public-switch"
          onCheckedChange={(checked) =>
            checked
              ? apply({ action: "publish", viewId, expiresAt: null }, t("DataView.share.public.published"))
              : apply({ action: "revoke", viewId }, t("DataView.share.public.revoked"))
          }
        />
      </div>

      {blocked ? (
        <p className="text-xs text-muted-foreground" id="share-view-public-blocked">
          {status.reason === "workspaceDisabled"
            ? t("DataView.share.public.workspaceDisabled")
            : t("DataView.share.public.permissionDenied")}
        </p>
      ) : null}

      {link ? (
        <>
          <div className="flex gap-2">
            <Input
              readOnly
              aria-label={t("DataView.share.public.linkLabel")}
              className="font-mono text-xs"
              id="share-view-public-link"
              value={link.url}
            />

            <Button
              id="share-view-public-copy"
              type="button"
              variant="secondary"
              onClick={() =>
                runUserAction(async () => {
                  if (await copyToClipboard(link.url)) setCopied(true);
                })
              }
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}

              {copied ? t("DataView.share.public.copied") : t("DataView.share.public.copy")}
            </Button>
          </div>

          <FormIsoDatePicker
            id="share-view-public-expires"
            label={t("DataView.share.public.expiresLabel")}
            placeholder={t("DataView.share.public.noExpiry")}
            value={link.expiresAt ?? undefined}
            onValueChange={(value) =>
              apply(
                { action: "publish", viewId, expiresAt: value ?? null },
                value ? t("DataView.share.public.expirySet") : t("DataView.share.public.expiryCleared"),
              )
            }
          />

          <p className="text-xs text-muted-foreground" id="share-view-public-meta">
            {`${t("DataView.share.public.opened", { count: link.openCount })} · ${t("DataView.share.public.onlyCharts")}`}
          </p>
        </>
      ) : null}
    </section>
  );
}
