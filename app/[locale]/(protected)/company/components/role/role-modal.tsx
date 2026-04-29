"use client";

import type { RoleModalStore } from "./role-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Resource } from "@/generated/prisma";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormActions } from "@/components/card/form-actions";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormRadioGroup, type FormRadioGroupOption } from "@/components/forms/form-radio-group";
import { Icon } from "@/components/shared/icon";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

type Props = {
  store: RoleModalStore;
};

export const RoleModal = observer(({ store }: Props) => {
  const t = useTranslations("");
  const { form, isDisabledOrSystemRole, isLoading, hasUsersAssigned, isSystemRole } = store;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  function renderResourcePermissions(resource: Resource) {
    const permission = form.permissions[resource];
    if (!permission) return null;

    const hasReadAccess = "readAccess" in permission;
    const hasCanManage = "canManage" in permission;

    const canManageOptions: FormRadioGroupOption[] = [
      { value: "yes", label: t("RoleModal.yes"), disabled: isDisabledOrSystemRole },
      { value: "no", label: t("RoleModal.no"), disabled: isDisabledOrSystemRole },
    ];

    const readAccessOptions: FormRadioGroupOption[] = [
      { value: "all", label: t("RoleModal.readAll"), disabled: isDisabledOrSystemRole },
      ...(resource !== Resource.api && resource !== Resource.auditLog
        ? [{ value: "own", label: t("RoleModal.readOwn"), disabled: isDisabledOrSystemRole }]
        : []),
      ...(resource !== Resource.users && resource !== Resource.company
        ? [{ value: "none", label: t("RoleModal.readNone"), disabled: isDisabledOrSystemRole }]
        : []),
    ];

    return (
      <div key={resource} className="grid grid-cols-subgrid col-span-3 py-3 items-center">
        <h3 className="text-sm font-medium">{t(`RoleModal.resources.${resource}`)}</h3>

        <div>
          {hasCanManage ? (
            <FormRadioGroup id={`permissions.${resource}.canManage`} options={canManageOptions} />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>

        <div>
          {hasReadAccess ? (
            <FormRadioGroup id={`permissions.${resource}.readAccess`} options={readAccessOptions} />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppModal size="xl" store={store} title={t("RoleModal.title")}>
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader className="items-start">
            <h2 className="grow truncate text-base font-semibold">{t("RoleModal.title")}</h2>

            {form.id && !isDisabledOrSystemRole && !hasUsersAssigned && (
              <Button
                disabled={isLoading}
                size="icon"
                type="button"
                variant="destructive"
                onClick={() => showDeleteConfirmation(() => store.delete(), form.name ?? "")}
              >
                <Icon icon={Trash2} />
              </Button>
            )}
          </AppCardHeader>

          <AppCardBody>
            {isSystemRole && <Alert color="primary" description={t("RoleModal.systemAlert")} />}

            {isSystemRole ? (
              <Input disabled readOnly id="name" value={t("RoleModal.systemName")} />
            ) : (
              <FormInput required id="name" />
            )}

            {isSystemRole ? (
              <Textarea disabled readOnly id="description" value={t("RoleModal.systemDescription")} />
            ) : (
              <FormTextarea required id="description" />
            )}

            <div className="grid grid-cols-[1fr_auto_auto] gap-x-8 divide-y divide-border border-y border-border">
              <div className="grid grid-cols-subgrid col-span-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>{t("RoleModal.resourceHeader")}</span>

                <span>{t("RoleModal.manageAccess")}</span>

                <span>{t("RoleModal.readAccess")}</span>
              </div>

              {renderResourcePermissions(Resource.api)}

              {renderResourcePermissions(Resource.users)}

              {renderResourcePermissions(Resource.company)}

              {store.rootStore.isCloudHosted && renderResourcePermissions(Resource.auditLog)}

              {renderResourcePermissions(Resource.tasks)}

              {renderResourcePermissions(Resource.contacts)}

              {renderResourcePermissions(Resource.organizations)}

              {renderResourcePermissions(Resource.deals)}

              {renderResourcePermissions(Resource.services)}
            </div>
          </AppCardBody>

          <FormActions overrideDisabled={isDisabledOrSystemRole} store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
