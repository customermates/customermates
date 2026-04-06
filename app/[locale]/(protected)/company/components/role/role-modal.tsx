"use client";

import type { RoleModalStore } from "./role-modal.store";

import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import { Radio } from "@heroui/radio";
import { useTranslations } from "next-intl";
import { TrashIcon } from "@heroicons/react/24/outline";

import { Resource } from "@/generated/prisma";

import { XInput } from "@/components/x-inputs/x-input";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XForm } from "@/components/x-inputs/x-form";
import { XModal } from "@/components/x-modal/x-modal";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { XRadioGroup } from "@/components/x-inputs/x-radio-group";
import { XIcon } from "@/components/x-icon";
import { XTextarea } from "@/components/x-inputs/x-textarea";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";
import { XCardDefaultHeader } from "@/components/x-card/x-card-default-header";

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

    return (
      <div
        key={resource}
        className="flex w-full flex-col space-y-2 items-start border border-divider p-3 rounded-medium"
      >
        <h3 className="text-x-sm">{t(`RoleModal.resources.${resource}`)}</h3>

        <div className="flex w-full gap-4 items-start justify-start">
          {hasCanManage && (
            <XRadioGroup
              classNames={{ label: "text-xs text-default-600" }}
              id={`permissions.${resource}.canManage`}
              isDisabled={isDisabledOrSystemRole}
            >
              <Radio value="yes">{t("RoleModal.yes")}</Radio>

              <Radio color="danger" value="no">
                {t("RoleModal.no")}
              </Radio>
            </XRadioGroup>
          )}

          {hasReadAccess && (
            <XRadioGroup
              classNames={{ label: "text-xs text-default-600" }}
              id={`permissions.${resource}.readAccess`}
              isDisabled={isDisabledOrSystemRole}
            >
              <Radio value="all">{t("RoleModal.readAll")}</Radio>

              {resource !== Resource.api && resource !== Resource.auditLog && (
                <Radio color="warning" value="own">
                  {t("RoleModal.readOwn")}
                </Radio>
              )}

              {resource !== Resource.users && resource !== Resource.company && (
                <Radio color="danger" value="none">
                  {t("RoleModal.readNone")}
                </Radio>
              )}
            </XRadioGroup>
          )}
        </div>
      </div>
    );
  }

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardDefaultHeader title={t("RoleModal.title")}>
            {!isDisabledOrSystemRole && !hasUsersAssigned && (
              <Button
                isIconOnly
                color="danger"
                isDisabled={isLoading}
                size="sm"
                variant="flat"
                onPress={() => showDeleteConfirmation(() => store.delete(), form.name ?? "")}
              >
                <XIcon icon={TrashIcon} />
              </Button>
            )}
          </XCardDefaultHeader>

          <XCardBody>
            <XInput
              isRequired
              id="name"
              isDisabled={isDisabledOrSystemRole}
              value={isSystemRole ? t("RoleModal.systemName") : form.name}
            />

            <XTextarea
              isRequired
              id="description"
              isDisabled={isDisabledOrSystemRole}
              value={isSystemRole ? t("RoleModal.systemDescription") : form.description}
            />

            {renderResourcePermissions(Resource.api)}

            {renderResourcePermissions(Resource.users)}

            {renderResourcePermissions(Resource.company)}

            {store.rootStore.isCloudHosted && renderResourcePermissions(Resource.aiAgent)}

            {store.rootStore.isCloudHosted && renderResourcePermissions(Resource.auditLog)}

            {renderResourcePermissions(Resource.tasks)}

            {renderResourcePermissions(Resource.contacts)}

            {renderResourcePermissions(Resource.organizations)}

            {renderResourcePermissions(Resource.deals)}

            {renderResourcePermissions(Resource.services)}
          </XCardBody>

          <XCardModalDefaultFooter overrideDisabled={isDisabledOrSystemRole} store={store} />
        </XCard>
      </XForm>
    </XModal>
  );
});
