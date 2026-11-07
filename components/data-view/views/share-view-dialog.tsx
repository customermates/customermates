"use client";

import type { DataViewChipDto, DataViewVisibility } from "@/core/data-view/data-view-state.schema";
import type { PublicLinkStatus } from "@/features/public-link/public-link.schema";
import type { LucideIcon } from "lucide-react";

import { Building2, Globe, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getDataViewShareOptionsAction, managePublicLinkAction, shareDataViewAction } from "@/app/actions";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { SelectableCard } from "@/components/forms/selectable-card";
import { AppModal } from "@/components/modal";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { copyToClipboard } from "@/core/utils/clipboard";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRootStore } from "@/core/stores/root-store.provider";

import { PublicLinkOption } from "./public-link-option";

type Role = { id: string; name: string };

type Props = {
  kind: "dashboard" | "list";
  link: string;
  view: DataViewChipDto | null;
  onOpenChange: (open: boolean) => void;
  onShared: () => Promise<void>;
};

type Scope = DataViewVisibility | "public";

const SCOPE_ICONS: Record<Scope, LucideIcon> = {
  private: UserRound,
  workspace: Building2,
  roles: Users,
  public: Globe,
};

function sameRoles(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function ShareViewDialog({ kind, link, view, onOpenChange, onShared }: Props) {
  const t = useTranslations();
  const { appMode } = useRootStore();
  const publishable = appMode !== "demo";
  const [visibility, setVisibility] = useState<Scope>("private");
  const [publicStatus, setPublicStatus] = useState<PublicLinkStatus | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  if ((view?.id ?? null) !== openedFor) {
    setOpenedFor(view?.id ?? null);
    setVisibility(view?.isPublic ? "public" : (view?.visibility ?? "private"));
    setRoleIds(view?.roleIds ?? []);
    setPublicStatus(null);
    setExpiresAt(null);
  }

  const viewId = view?.id ?? null;
  useEffect(() => {
    if (!viewId || !publishable) return;
    let active = true;
    managePublicLinkAction({ action: "read", viewId })
      .then((result) => {
        if (!active) return;
        if (!result.ok) return toastZodErrorTree(result.error);
        setPublicStatus(result.data);
        setExpiresAt(result.data.link?.expiresAt ?? null);
        if (result.data.link) setVisibility("public");
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [publishable, viewId]);

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

  const publicLink = publicStatus?.link ?? null;
  const publicBlocked = publicStatus !== null && !publicStatus.allowed && !publicLink;
  const scopes: Scope[] = publicStatus
    ? ["private", "workspace", "roles", "public"]
    : ["private", "workspace", "roles"];
  const scopeText: Record<Scope, { title: string; description: string }> = {
    private: { title: t("DataView.share.private"), description: t("DataView.share.privateDescription") },
    workspace: { title: t("DataView.share.workspace"), description: t("DataView.share.workspaceDescription") },
    roles: { title: t("DataView.share.roles"), description: t("DataView.share.rolesDescription") },
    public: {
      title: t("DataView.share.public.option"),
      description:
        kind === "list" ? t("DataView.share.public.optionDescriptionList") : t("DataView.share.public.description"),
    },
  };
  const savedText: Record<DataViewVisibility, string> = {
    private: t("DataView.share.savedPrivate"),
    workspace: t("DataView.share.savedWorkspace"),
    roles: t("DataView.share.savedRoles"),
  };

  const initiallyPublic = publicStatus ? publicLink !== null : view?.isPublic === true;
  const initialVisibility: Scope = initiallyPublic ? "public" : (view?.visibility ?? "private");
  const changed =
    visibility !== initialVisibility ||
    (visibility === "roles" && !sameRoles(roleIds, view?.roleIds ?? [])) ||
    (visibility === "public" && publicStatus !== null && (publicLink?.expiresAt ?? null) !== expiresAt);
  const valid = (visibility !== "roles" || roleIds.length > 0) && (visibility !== "public" || !publicBlocked);

  const toggleRole = (roleId: string) =>
    setRoleIds((current) =>
      current.includes(roleId) ? current.filter((entry) => entry !== roleId) : [...current, roleId],
    );

  const share = async (target: DataViewVisibility) => {
    if (!view) return false;
    if (target === view.visibility && (target !== "roles" || sameRoles(roleIds, view.roleIds ?? []))) return true;
    const result = await shareDataViewAction({
      id: view.id,
      visibility: target,
      roleIds: target === "roles" ? roleIds : [],
    });
    if (!result.ok) toastZodErrorTree(result.error);
    return result.ok;
  };

  const publish = async () => {
    if (!view) return null;
    const result = await managePublicLinkAction({ action: "publish", viewId: view.id, expiresAt });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return null;
    }
    setPublicStatus(result.data);
    setExpiresAt(result.data.link?.expiresAt ?? null);
    return result.data.link;
  };

  const save = async () => {
    if (!view || saving || !valid) return;
    setSaving(true);
    try {
      if (visibility === "public") {
        const created = publicLink === null;
        if (!(await share("workspace"))) return;
        const published = await publish();
        if (!published) return;
        await onShared();
        if (!created) {
          toast.success(expiresAt ? t("DataView.share.public.expirySet") : t("DataView.share.public.expiryCleared"));
          onOpenChange(false);
          return;
        }
        toast.success(
          (await copyToClipboard(published.url).catch(() => false))
            ? t("DataView.share.public.createdCopied")
            : t("DataView.share.public.published"),
        );
        return;
      }
      if (publicLink) {
        const revoked = await managePublicLinkAction({ action: "revoke", viewId: view.id });
        if (!revoked.ok) {
          toastZodErrorTree(revoked.error);
          return;
        }
      }
      if (!(await share(visibility))) return;
      await onShared();
      toast.success(
        publicLink ? `${t("DataView.share.public.revoked")} · ${savedText[visibility]}` : savedText[visibility],
      );
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
          <RadioGroup className="gap-2" value={visibility} onValueChange={(value) => setVisibility(value as Scope)}>
            {scopes.map((scope) => {
              const Icon = SCOPE_ICONS[scope];
              const disabled = scope === "public" && publicBlocked;
              return (
                <SelectableCard
                  key={scope}
                  description={
                    disabled
                      ? publicStatus?.reason === "workspaceDisabled"
                        ? t("DataView.share.public.workspaceDisabled")
                        : t("DataView.share.public.permissionDenied")
                      : scopeText[scope].description
                  }
                  disabled={disabled}
                  id={`share-scope-${scope}`}
                  label={scopeText[scope].title}
                  leading={<Icon aria-hidden className="size-3.5 text-muted-foreground" />}
                  selectionMode="single"
                  value={scope}
                />
              );
            })}
          </RadioGroup>

          {visibility === "roles" ? (
            <div
              aria-label={t("DataView.share.rolesLabel")}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              id="share-view-roles"
              role="group"
            >
              {(roles ?? []).map((role) => (
                <SelectableCard
                  key={role.id}
                  checked={roleIds.includes(role.id)}
                  id={`share-role-${role.id}`}
                  label={role.name}
                  selectionMode="multiple"
                  onCheckedChange={() => toggleRole(role.id)}
                />
              ))}
            </div>
          ) : null}

          {visibility === "public" ? (
            <PublicLinkOption expiresAt={expiresAt} kind={kind} link={publicLink} onExpiresAtChange={setExpiresAt} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>{t("DataView.share.link")}</Label>

              <CopyableCode copyId="share-view-copy" id="share-view-link" value={link} />

              <p className="text-xs text-muted-foreground">
                {visibility === "private" ? t("DataView.share.linkPrivate") : t("DataView.share.linkShared")}
              </p>
            </div>
          )}
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
