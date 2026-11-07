"use client";

import type { PublicLinkSettings } from "@/features/public-link/public-link-settings.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { setPublicLinksAllowedAction } from "../../actions";

type Props = { editable: boolean; initial: PublicLinkSettings };

export function PublicLinksSetting({ editable, initial }: Props) {
  const t = useTranslations();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);

  const change = (allowPublicLinks: boolean) =>
    runUserAction(async () => {
      setSaving(true);
      try {
        const result = await setPublicLinksAllowedAction({ allowPublicLinks });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        setSettings(result.data);
        toast.success(allowPublicLinks ? t("Workspaces.publicLinks.allowed") : t("Workspaces.publicLinks.blocked"));
      } finally {
        setSaving(false);
      }
    });

  return (
    <section aria-labelledby="settings-general-public-links-title" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="settings-general-public-links" id="settings-general-public-links-title">
            {t("Workspaces.publicLinks.title")}
          </Label>

          <span className="text-sm text-subdued">{t("Workspaces.publicLinks.description")}</span>

          <span className="text-xs text-subdued" id="settings-general-public-links-count">
            {settings.allowPublicLinks
              ? t("Workspaces.publicLinks.activeCount", { count: settings.activeLinkCount })
              : t("Workspaces.publicLinks.offCount", { count: settings.activeLinkCount })}
          </span>
        </div>

        <Switch
          checked={settings.allowPublicLinks}
          disabled={!editable || saving}
          id="settings-general-public-links"
          onCheckedChange={change}
        />
      </div>
    </section>
  );
}
