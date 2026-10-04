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
import { FormActions } from "@/components/card/form-actions";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormRadioGroup, type FormRadioGroupOption } from "@/components/forms/form-radio-group";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

type Props = {
  store: RoleModalStore;
};

export const RoleModal = observer(({ store }: Props) => {
  const t = useTranslations();
  const { form, isDisabledOrSystemRole, isLoading, canDeleteRole, isSystemRole, isOwnRole, canManage } = store;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  function renderResourcePermissions(resource: keyof typeof form.permissions) {
    const permission = form.permissions[resource];
    if (!permission) return null;

    const hasReadAccess = "readAccess" in permission;
    const hasCanManage = "canManage" in permission;
    const manageImpliesRead = resource === Resource.wiki && hasCanManage && permission.canManage === "yes";

    const canManageOptions: FormRadioGroupOption[] = [
      { value: "yes", label: t("RoleModal.yes") },
      { value: "no", label: t("RoleModal.no") },
    ];

    const readAccessOptions: FormRadioGroupOption[] = [
      {
        value: "all",
        label: t("RoleModal.readAll"),
        disabled: manageImpliesRead,
      },
      ...(resource !== Resource.api &&
      resource !== Resource.auditLog &&
      resource !== Resource.inboxMessages &&
      resource !== Resource.wiki
        ? [
            {
              value: "own",
              label: t("RoleModal.readOwn"),
            },
          ]
        : []),
      ...(resource !== Resource.company
        ? [
            {
              value: "none",
              label: t("RoleModal.readNone"),
              disabled: manageImpliesRead,
            },
          ]
        : []),
    ];

    return (
      <div key={resource} className="grid grid-cols-subgrid col-span-3 py-3 items-center">
        <h3 className="text-sm font-medium">{t(`RoleModal.resources.${resource}`)}</h3>

        <div>
          {hasCanManage ? (
            <FormRadioGroup
              ariaLabel={`${t(`RoleModal.resources.${resource}`)} — ${t("RoleModal.manageAccess")}`}
              id={`permissions.${resource}.canManage`}
              options={canManageOptions}
            />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>

        <div>
          {hasReadAccess ? (
            <FormRadioGroup
              ariaLabel={`${t(`RoleModal.resources.${resource}`)} — ${t("RoleModal.readAccess")}`}
              id={`permissions.${resource}.readAccess`}
              options={readAccessOptions}
            />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      </div>
    );
  }

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

            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 divide-y divide-border border-y border-border sm:gap-x-8">
              <div className="grid grid-cols-subgrid col-span-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                <span>{t("RoleModal.resourceHeader")}</span>

                <span>{t("RoleModal.manageAccess")}</span>

                <span>{t("RoleModal.readAccess")}</span>
              </div>

              {renderResourcePermissions(Resource.api)}

              {renderResourcePermissions(Resource.users)}

              {renderResourcePermissions(Resource.company)}

              {renderResourcePermissions(Resource.dataModel)}

              {renderResourcePermissions(Resource.wiki)}

              {renderResourcePermissions(Resource.auditLog)}

              {store.rootStore.appMode !== "self-hosted" && renderResourcePermissions(Resource.inboxMessages)}

              {store.rootStore.appMode !== "self-hosted" && renderResourcePermissions(Resource.routines)}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t("RoleModal.recordTypes")}</h3>

              <p className="text-xs text-muted-foreground">{t("RoleModal.recordTypesHint")}</p>

              <div className="grid grid-cols-2 gap-x-3 divide-y divide-border border-y border-border sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-6">
                <div className="hidden py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:col-span-3 sm:grid sm:grid-cols-subgrid">
                  <span>{t("RoleModal.recordTypes")}</span>

                  <span>{t("RoleModal.manageAccess")}</span>

                  <span>{t("RoleModal.readAccess")}</span>
                </div>

                {store.context?.types.map((type, index) => (
                  <div
                    key={type.id}
                    className="col-span-2 grid grid-cols-subgrid items-start gap-y-3 py-3 sm:col-span-3 sm:items-center sm:gap-y-0"
                    data-record-permission={type.id}
                  >
                    <h3 className="col-span-2 min-w-0 break-words text-sm font-medium sm:col-span-1">
                      {type.label}

                      {type.archived && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("RoleModal.archived")}
                        </span>
                      )}
                    </h3>

                    <div className="space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                        {t("RoleModal.manageAccess")}
                      </p>

                      <div className="flex max-w-48 flex-wrap gap-x-3 gap-y-2">
                        <FormCheckbox id={`recordGrants.${index}.create`} label={t("RoleModal.create")} />

                        <FormCheckbox id={`recordGrants.${index}.update`} label={t("RoleModal.edit")} />

                        <FormCheckbox id={`recordGrants.${index}.delete`} label={t("RoleModal.delete")} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                        {t("RoleModal.readAccess")}
                      </p>

                      <FormRadioGroup
                        ariaLabel={`${type.label} — ${t("RoleModal.readAccess")}`}
                        className="gap-3"
                        id={`recordGrants.${index}.readAccess`}
                        options={[
                          { value: "all", label: t("RoleModal.readAll") },
                          { value: "own", label: t("RoleModal.readOwn") },
                          { value: "none", label: t("RoleModal.readNone") },
                        ]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AppCardBody>

          <FormActions showInitially anchorScope="role-modal" overrideDisabled={isDisabledOrSystemRole} store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
