"use client";

import type { ChangeEvent } from "react";
import type { SaveWorkspaceBrandData, WorkspaceBrand } from "@/features/workspace-brand/workspace-brand.schema";

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { isBrandColor } from "@/features/workspace-brand/brand-color";
import { BRAND_LOGO_TYPES, type BrandLogoRefusal, brandLogoRefusal } from "@/features/workspace-brand/brand-image";

import { saveWorkspaceBrandAction } from "../../actions";

type Props = { editable: boolean; initial: WorkspaceBrand; workspaceName: string };

const ACCENT_FIELD = "accentColor";
const BASE64_CHUNK_BYTES = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES));
  return btoa(binary);
}

export const BrandingSetting = observer(function BrandingSetting({ editable, initial, workspaceName }: Props) {
  const t = useTranslations();
  const store = useAppForm();
  const { workspacesStore } = useRootStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [logoProblem, setLogoProblem] = useState<BrandLogoRefusal | null>(null);
  const [saving, setSaving] = useState(false);
  const [standardColor, setStandardColor] = useState("");

  useEffect(() => {
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim().toLowerCase();
    if (isBrandColor(primary)) setStandardColor(primary);
  }, []);

  const accent = String(store?.getValue(ACCENT_FIELD) ?? "");
  const normalized = accent.trim().toLowerCase();
  const accentValid = normalized === "" || isBrandColor(normalized);
  const disabled = !editable || saving;

  const saveLogo = (data: Pick<SaveWorkspaceBrandData, "logo">) =>
    runUserAction(async () => {
      setSaving(true);
      try {
        const result = await saveWorkspaceBrandAction(data);
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        setLogoUrl(result.data.logoUrl);
        workspacesStore.setCurrentLogo(result.data.logoUrl);
        toast.success(t("Workspaces.branding.saved"));
      } finally {
        setSaving(false);
      }
    });

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    runUserAction(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const refusal = brandLogoRefusal(bytes);
      setLogoProblem(refusal);
      if (!refusal) saveLogo({ logo: toBase64(bytes) });
    });
  };

  return (
    <section
      aria-labelledby="settings-general-branding-title"
      className="flex flex-col gap-2"
      id="settings-general-branding"
    >
      <div className="flex flex-col gap-4 rounded-md border border-border p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium" id="settings-general-branding-title">
            {t("Workspaces.branding.title")}
          </h2>

          <span className="text-sm text-subdued">{t("Workspaces.branding.description")}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-general-branding-logo-input">{t("Workspaces.branding.logoLabel")}</Label>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex h-12 min-w-12 items-center justify-center rounded-md border border-dashed border-border px-2"
              id="settings-general-branding-logo-preview"
            >
              {logoUrl ? (
                <BrandLogo name={workspaceName} src={logoUrl} />
              ) : (
                <span className="text-xs text-subdued">{t("Workspaces.branding.logoEmpty")}</span>
              )}
            </div>

            <input
              ref={fileInput}
              accept={BRAND_LOGO_TYPES.join(",")}
              aria-describedby="settings-general-branding-logo-hint"
              className="sr-only"
              disabled={disabled}
              id="settings-general-branding-logo-input"
              tabIndex={-1}
              type="file"
              onChange={chooseLogo}
            />

            <Button
              disabled={disabled}
              id="settings-general-branding-logo-upload"
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => fileInput.current?.click()}
            >
              {t("Workspaces.branding.logoUpload")}
            </Button>

            {logoUrl ? (
              <Button
                disabled={disabled}
                id="settings-general-branding-logo-remove"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setLogoProblem(null);
                  saveLogo({ logo: null });
                }}
              >
                {t("Common.actions.remove")}
              </Button>
            ) : null}
          </div>

          <span className="text-xs text-subdued" id="settings-general-branding-logo-hint">
            {t("Workspaces.branding.logoHint")}
          </span>

          {logoProblem ? (
            <p className="text-xs text-destructive" id="settings-general-branding-logo-error" role="alert">
              {logoProblem === "tooLarge"
                ? t("Workspaces.branding.logoTooLarge")
                : t("Workspaces.branding.logoUnsupported")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-end gap-2">
            <FormInput
              aria-describedby={accentValid ? undefined : "settings-general-branding-accent-error"}
              aria-invalid={!accentValid}
              autoComplete="off"
              className="font-mono"
              containerClassName="w-44"
              endContent={
                <input
                  aria-label={t("Workspaces.branding.accentPicker")}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-input-background p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!editable || store?.isLoading}
                  id="settings-general-branding-accent-picker"
                  type="color"
                  value={isBrandColor(normalized) ? normalized : standardColor}
                  onChange={(event) => store?.onChange(ACCENT_FIELD, event.target.value)}
                />
              }
              id={ACCENT_FIELD}
              inputId="settings-general-branding-accent"
              label={t("Workspaces.branding.accentLabel")}
              maxLength={7}
              readOnly={!editable}
              spellCheck={false}
            />

            {normalized !== "" && editable ? (
              <Button
                disabled={store?.isLoading}
                id="settings-general-branding-accent-reset"
                type="button"
                variant="ghost"
                onClick={() => store?.onChange(ACCENT_FIELD, "")}
              >
                {t("Common.actions.reset")}
              </Button>
            ) : null}
          </div>

          {accentValid ? null : (
            <p className="text-xs text-destructive" id="settings-general-branding-accent-error" role="alert">
              {t("Common.errors.emailLinkColourInvalid")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
});
