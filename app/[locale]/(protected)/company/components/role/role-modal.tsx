"use client";

import type { RoleModalStore } from "./role-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Resource } from "@/generated/prisma";

import { FormCheckbox } from "@/components/forms/form-checkbox";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";

import { Alert } from "@/components/shared/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormRadioGroup } from "@/components/forms/form-radio-group";
import {
  MANAGE_ACTIONS,
  manageImpliesReadAll,
  RECORD_TYPE_ACCESS,
  RESOURCE_ACCESS,
  type ManageAction,
  type ReadAccess,
} from "@/features/role/resource-access";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

type Props = {
  store: RoleModalStore;
};

const SYSTEM_RESOURCE_ORDER = [
  Resource.api,
  Resource.users,
  Resource.company,
  Resource.dataModel,
  Resource.wiki,
  Resource.auditLog,
  Resource.inboxMessages,
  Resource.routines,
];
const CLOUD_RESOURCES = new Set<Resource>([Resource.inboxMessages, Resource.routines]);

export const RoleModal = observer(({ store }: Props) => {
  const t = useTranslations();
  const { form, isLoading, canDeleteRole, isSystemRole, isOwnRole, canManage } = store;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  const manageLabels = { create: t("RoleModal.create"), update: t("RoleModal.edit"), delete: t("RoleModal.delete") };
  const readLabels = { all: t("RoleModal.readAll"), own: t("RoleModal.readOwn"), none: t("RoleModal.readNone") };
  const dash = <span className="text-sm text-muted-foreground">—</span>;

  function renderAccessRow(row: {
    key: string;
    label: string;
    path: string;
    access: { manage: readonly ManageAction[]; read: readonly ReadAccess[] };
    note?: string;
    lockedRead?: boolean;
    data: Record<string, string>;
  }) {
    return (
      <div
        key={row.key}
        className="grid gap-y-3 py-3 sm:col-span-5 sm:grid-cols-subgrid sm:items-center sm:gap-y-0"
        {...row.data}
      >
        <h3 className="min-w-0 break-words text-sm font-medium">
          {row.label}

          {row.note && <span className="block text-xs font-normal text-muted-foreground">{row.note}</span>}
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:contents">
          <p className="w-full text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("RoleModal.manageAccess")}
          </p>

          {MANAGE_ACTIONS.map((action) =>
            row.access.manage.includes(action) ? (
              <FormCheckbox
                key={action}
                id={`${row.path}.${action}`}
                label={<span className="sm:sr-only">{manageLabels[action]}</span>}
              />
            ) : (
              <span key={action} aria-hidden="true" className="hidden sm:inline">
                {dash}
              </span>
            ),
          )}

          {row.access.manage.length === 0 && <span className="sm:hidden">{dash}</span>}
        </div>

        <div className="space-y-2 sm:space-y-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("RoleModal.readAccess")}
          </p>

          {row.access.read.length ? (
            <FormRadioGroup
              ariaLabel={`${row.label} — ${t("RoleModal.readAccess")}`}
              className="gap-3"
              id={`${row.path}.readAccess`}
              options={row.access.read.map((value) => ({
                value,
                label: readLabels[value],
                disabled: row.lockedRead && value !== "all",
              }))}
            />
          ) : (
            dash
          )}
        </div>
      </div>
    );
  }

  function renderResource(resource: Resource) {
    const label = t(`RoleModal.resources.${resource}`);
    const access = form.permissions[resource];
    return renderAccessRow({
      key: resource,
      label,
      path: `permissions.${resource}`,
      access: RESOURCE_ACCESS[resource],
      lockedRead: manageImpliesReadAll(resource) && MANAGE_ACTIONS.some((action) => access[action]),
      data: { "data-resource-permission": resource },
    });
  }

  const header = (title: string) => (
    <div className="hidden py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:col-span-5 sm:grid sm:grid-cols-subgrid">
      <span>{title}</span>

      {MANAGE_ACTIONS.map((action) => (
        <span key={action}>{manageLabels[action]}</span>
      ))}

      <span>{t("RoleModal.readAccess")}</span>
    </div>
  );
  const tableClass =
    "grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-[minmax(7rem,1fr)_repeat(3,minmax(3.5rem,auto))_auto] sm:gap-x-4";

  return (
    <AppModal
      actions={
        canDeleteRole
          ? [
              {
                id: "delete-role",
                anchorId: "role-modal-delete",
                label: t("Common.actions.delete"),
                icon: Trash2,
                variant: "destructive",
                disabled: isLoading,
                onClick: () => showDeleteConfirmation(() => store.delete(), form.name ?? ""),
              },
            ]
          : []
      }
      size="xl"
      store={store}
      title={t("RoleModal.title")}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader className="items-start">
            <h2 className="grow truncate text-base font-semibold">{t("RoleModal.title")}</h2>
          </AppCardHeader>

          <AppCardBody>
            {store.loadFailed && (
              <Alert color="danger" description={t("ErrorCard.title")}>
                <Button size="sm" variant="secondary" onClick={() => runUserAction(store.loadContext)}>
                  {t("ErrorCard.retry")}
                </Button>
              </Alert>
            )}

            {isSystemRole && <Alert color="primary" description={t("RoleModal.systemAlert")} />}

            {!isSystemRole && isOwnRole && canManage && (
              <Alert color="warning" description={t("RoleModal.ownRoleAlert")} />
            )}

            {isSystemRole ? (
              <div className="space-y-1.5">
                <FormLabel htmlFor="name">{t("Common.inputs.name")}</FormLabel>

                <Input readOnly id="name" value={t("RoleModal.systemName")} />
              </div>
            ) : (
              <FormInput required id="name" />
            )}

            {isSystemRole ? (
              <div className="space-y-1.5">
                <FormLabel htmlFor="description">{t("Common.inputs.description")}</FormLabel>

                <Textarea readOnly id="description" value={t("RoleModal.systemDescription")} />
              </div>
            ) : (
              <FormTextarea required id="description" />
            )}

            <CollapsibleSection defaultOpen title={t("RoleModal.workspacePermissions")}>
              <div className={tableClass}>
                {header(t("RoleModal.resourceHeader"))}

                {SYSTEM_RESOURCE_ORDER.filter(
                  (resource) => store.rootStore.appMode !== "self-hosted" || !CLOUD_RESOURCES.has(resource),
                ).map(renderResource)}
              </div>
            </CollapsibleSection>

            <CollapsibleSection defaultOpen title={t("RoleModal.recordTypes")}>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("RoleModal.recordTypesHint")}</p>

                <div className={tableClass}>
                  {header(t("RoleModal.resourceHeader"))}

                  {store.context?.types.map((type, index) =>
                    renderAccessRow({
                      key: type.id,
                      label: type.label,
                      path: `recordGrants.${index}`,
                      access: RECORD_TYPE_ACCESS,
                      data: { "data-record-permission": type.id },
                    }),
                  )}
                </div>
              </div>
            </CollapsibleSection>
          </AppCardBody>

          <FormFooterActions anchorScope="role-modal" store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
