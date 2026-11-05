"use client";

import type { DataViewChipDto, DataViewVisibility } from "@/core/data-view/data-view-state.schema";
import type { LucideIcon } from "lucide-react";

import { Check, Copy, Globe, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getDataViewShareOptionsAction, shareDataViewAction } from "@/app/actions";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { copyToClipboard } from "@/core/utils/clipboard";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { cn } from "@/core/utils/cn";

type Role = { id: string; name: string };

type Props = {
  kind: "dashboard" | "list";
  link: string;
  view: DataViewChipDto | null;
  onOpenChange: (open: boolean) => void;
  onShared: () => Promise<void>;
};

const SCOPE_ICONS: Record<DataViewVisibility, LucideIcon> = {
  private: UserRound,
  workspace: Globe,
  roles: Users,
};

const SCOPES: DataViewVisibility[] = ["private", "workspace", "roles"];

function sameRoles(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function ShareViewDialog({ kind, link, view, onOpenChange, onShared }: Props) {
  const t = useTranslations();
  const [visibility, setVisibility] = useState<DataViewVisibility>("private");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  if ((view?.id ?? null) !== openedFor) {
    setOpenedFor(view?.id ?? null);
    setVisibility(view?.visibility ?? "private");
    setRoleIds(view?.roleIds ?? []);
    setCopied(false);
  }

  useEffect(() => {
    if (!view || roles !== null) return;
    let active = true;
    getDataViewShareOptionsAction()
      .then((result) => {
        if (!active) return;
        if (result.ok) setRoles(result.data.roles);
        else toastZodErrorTree(result.error);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [roles, view]);

  const scopeText: Record<DataViewVisibility, { title: string; description: string }> = {
    private: { title: t("DataView.share.private"), description: t("DataView.share.privateDescription") },
    workspace: { title: t("DataView.share.workspace"), description: t("DataView.share.workspaceDescription") },
    roles: { title: t("DataView.share.roles"), description: t("DataView.share.rolesDescription") },
  };
  const savedText: Record<DataViewVisibility, string> = {
    private: t("DataView.share.savedPrivate"),
    workspace: t("DataView.share.savedWorkspace"),
    roles: t("DataView.share.savedRoles"),
  };

  const initialVisibility = view?.visibility ?? "private";
  const changed =
    visibility !== initialVisibility || (visibility === "roles" && !sameRoles(roleIds, view?.roleIds ?? []));
  const valid = visibility !== "roles" || roleIds.length > 0;

  const toggleRole = (roleId: string) =>
    setRoleIds((current) =>
      current.includes(roleId) ? current.filter((entry) => entry !== roleId) : [...current, roleId],
    );

  const save = async () => {
    if (!view || saving || !valid) return;
    setSaving(true);
    try {
      const result = await shareDataViewAction({
        id: view.id,
        visibility,
        roleIds: visibility === "roles" ? roleIds : [],
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      await onShared();
      toast.success(savedText[visibility]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const title = t("DataView.share.title", { name: view?.name ?? "" });

  return (
    <AppModal
      description={
        kind === "dashboard" ? t("DataView.share.descriptionDashboard") : t("DataView.share.descriptionList")
      }
      open={view !== null}
      title={title}
      onClose={() => onOpenChange(false)}
    >
      <AppCard id="share-view-dialog">
        <AppCardHeader>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-lg font-semibold">{title}</h2>

            <p className="text-sm text-muted-foreground">
              {kind === "dashboard" ? t("DataView.share.descriptionDashboard") : t("DataView.share.descriptionList")}
            </p>
          </div>
        </AppCardHeader>

        <AppCardBody className="flex flex-col gap-4">
          <RadioGroup
            className="gap-2"
            value={visibility}
            onValueChange={(value) => setVisibility(value as DataViewVisibility)}
          >
            {SCOPES.map((scope) => {
              const Icon = SCOPE_ICONS[scope];
              return (
                <div
                  key={scope}
                  className={cn(
                    "flex items-start gap-3 rounded-md border border-border p-3",
                    visibility === scope && "border-primary/50 bg-primary/10",
                  )}
                >
                  <RadioGroupItem className="mt-0.5" id={`share-scope-${scope}`} value={scope} />

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label className="flex cursor-pointer items-center gap-2" htmlFor={`share-scope-${scope}`}>
                      <Icon aria-hidden className="size-3.5 text-muted-foreground" />

                      {scopeText[scope].title}
                    </Label>

                    <span className="text-xs text-muted-foreground">{scopeText[scope].description}</span>

                    {scope === "roles" && visibility === "roles" && (
                      <div
                        aria-label={t("DataView.share.rolesLabel")}
                        className="mt-1 flex flex-wrap gap-1.5"
                        role="group"
                      >
                        {(roles ?? []).map((role) => {
                          const selected = roleIds.includes(role.id);
                          return (
                            <button
                              key={role.id}
                              aria-pressed={selected}
                              className={cn(
                                "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs",
                                selected
                                  ? "border-primary/40 bg-primary/20 text-primary-soft-foreground"
                                  : "border-border text-muted-foreground hover:bg-accent",
                              )}
                              type="button"
                              onClick={() => toggleRole(role.id)}
                            >
                              {selected && <Check aria-hidden className="size-3" />}

                              {role.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </RadioGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-view-link">{t("DataView.share.link")}</Label>

            <div className="flex gap-2">
              <Input readOnly className="font-mono text-xs" id="share-view-link" value={link} />

              <Button
                id="share-view-copy"
                type="button"
                variant="secondary"
                onClick={() =>
                  runUserAction(async () => {
                    if (await copyToClipboard(link)) setCopied(true);
                  })
                }
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}

                {copied ? t("DataView.share.copied") : t("DataView.share.copyLink")}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {visibility === "private" ? t("DataView.share.linkPrivate") : t("DataView.share.linkShared")}
            </p>
          </div>
        </AppCardBody>

        <FormFooterActions
          editable
          anchorScope="share-view"
          dirty={changed && valid}
          saving={saving}
          onCancel={() => onOpenChange(false)}
          onSave={save}
        />
      </AppCard>
    </AppModal>
  );
}
