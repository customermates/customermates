"use client";

import { observer } from "mobx-react-lite";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";

import { Resource } from "@/generated/prisma";

import { createServiceByNameAction, getServicesAction } from "../../services/actions";

import { XInputNumber } from "@/components/x-inputs/x-input-number";
import { XIcon } from "@/components/x-icon";
import { XAutocompleteItem } from "@/components/x-inputs/x-autocomplete/x-autocomplete-item";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XChip } from "@/components/x-chip/x-chip";

export const DealServicesSelection = observer(() => {
  const { dealModalStore, intlStore, userStore } = useRootStore();
  const { form, fetchedEntity, canManage, addService, deleteService } = dealModalStore;
  const t = useTranslations("");

  if (!userStore.canAccess(Resource.services)) return null;

  return (
    <div className="flex w-full flex-col space-y-2 items-start">
      <div className="w-full grid grid-cols-[minmax(120px,400px)_68px_40px] gap-2 items-center">
        <label className="text-x-md">{t("DealModal.servicesLabel")}</label>

        <label className="text-x-md">{t("DealModal.quantityLabel")}</label>

        {canManage && (
          <Button color="primary" isIconOnly={true} variant="flat" onPress={addService}>
            <XIcon icon={PlusIcon} />
          </Button>
        )}
      </div>

      {(form.services || []).map((service, index) => {
        const selectedServiceIds = (form.services || [])
          .map((s) => s.serviceId)
          .filter((id, idx) => idx !== index && id && id.trim() !== "");

        return (
          <div key={index} className="w-full grid grid-cols-[minmax(120px,400px)_68px_40px] gap-2 items-start">
            <XAutocomplete
              isRequired
              filterFunction={(availableService) => !selectedServiceIds.includes(availableService.id)}
              getItems={getServicesAction}
              id={`services[${index}].serviceId`}
              items={fetchedEntity?.services.filter((it) => !selectedServiceIds.includes(it.id)) ?? []}
              label={null}
              renderValue={(items) =>
                items.map((item, idx) => (
                  <span key={item?.data?.id ?? item?.key ?? idx} className="truncate">
                    {item?.data?.name}
                  </span>
                ))
              }
              onCreate={(name) => createServiceByNameAction(name, userStore.user?.id)}
            >
              {(service) =>
                XAutocompleteItem({
                  key: service.id,
                  textValue: service.name,
                  value: service.id,
                  children: (
                    <div className="flex w-full flex-col space-y-2 items-start">
                      <span className="text-small">{service.name}</span>

                      <XChip>{intlStore.formatCurrency(service.amount)}</XChip>
                    </div>
                  ),
                })
              }
            </XAutocomplete>

            <XInputNumber
              hideStepper
              isRequired
              classNames={{ inputWrapper: "h-[42px] rounded-medium" }}
              id={`services[${index}].quantity`}
              label={null}
              size="sm"
            />

            {canManage && (
              <Button color="danger" isIconOnly={true} variant="flat" onPress={() => deleteService(index)}>
                <XIcon icon={TrashIcon} />
              </Button>
            )}
          </div>
        );
      })}

      {(form.services || []).length === 0 && <p className="text-x-sm text-subdued">{t("DealModal.noServicesAdded")}</p>}
    </div>
  );
});
