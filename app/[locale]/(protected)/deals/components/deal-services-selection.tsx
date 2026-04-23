"use client";

import { observer } from "mobx-react-lite";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Resource } from "@/generated/prisma";

import { createServiceByNameAction, getServicesAction } from "../../services/actions";

import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";

export const DealServicesSelection = observer(() => {
  const { dealDetailStore, intlStore, userStore } = useRootStore();
  const { form, fetchedEntity, canManage, addService, deleteService } = dealDetailStore;
  const t = useTranslations("");

  if (!userStore.canAccess(Resource.services)) return null;

  const serviceAmountById = new Map(fetchedEntity?.services.map((service) => [service.id, service.amount]) ?? []);

  let totalQuantity = 0;
  let totalValue = 0;
  for (const entry of form.services ?? []) {
    const entryQuantity = entry.quantity ?? 0;
    totalQuantity += entryQuantity;
    const amount = entry.serviceId ? (serviceAmountById.get(entry.serviceId) ?? 0) : 0;
    totalValue += amount * entryQuantity;
  }

  async function getServiceOptions(params: { searchTerm?: string }) {
    const result = await getServicesAction(params);
    return {
      ...result,
      items: result.items.map((service) => ({ ...service, quantity: 1 })),
    };
  }

  async function createServiceOption(name: string) {
    const service = await createServiceByNameAction(name, userStore.user?.id);
    return service ? { ...service, quantity: 1 } : null;
  }

  return (
    <div className="flex w-full flex-col space-y-2 items-start">
      {(form.services || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <AppChip>
            <span className="text-subdued mr-1">{t("DealModal.totalQuantityLabel")}</span>

            {intlStore.formatNumber(totalQuantity)}
          </AppChip>

          <AppChip>
            <span className="text-subdued mr-1">{t("DealModal.totalValueLabel")}</span>

            {intlStore.formatCurrency(totalValue)}
          </AppChip>
        </div>
      )}

      <div className="w-full grid grid-cols-[minmax(120px,400px)_68px_40px] gap-2 items-center">
        <label className="text-x-md">{t("DealModal.servicesLabel")}</label>

        <label className="text-x-md">{t("DealModal.quantityLabel")}</label>

        {canManage && (
          <Button size="icon" type="button" variant="secondary" onClick={addService}>
            <Icon icon={Plus} />
          </Button>
        )}
      </div>

      {(form.services || []).map((service, index) => {
        const selectedServiceIds = (form.services || [])
          .map((s) => s.serviceId)
          .filter((id, idx) => idx !== index && id && id.trim() !== "");

        return (
          <div key={index} className="w-full grid grid-cols-[minmax(120px,400px)_68px_40px] gap-2 items-start">
            <FormAutocomplete
              required
              filterFunction={(availableService) => !selectedServiceIds.includes(availableService.id)}
              getItems={getServiceOptions}
              id={`services[${index}].serviceId`}
              items={fetchedEntity?.services.filter((it) => !selectedServiceIds.includes(it.id)) ?? []}
              label={null}
              renderValue={(items) =>
                items.map((item, idx) => <AppChip key={item?.data?.id ?? item?.key ?? idx}>{item?.data?.name}</AppChip>)
              }
              onCreate={createServiceOption}
            >
              {(service) =>
                FormAutocompleteItem({
                  textValue: service.name,

                  children: (
                    <div className="flex w-full flex-col space-y-2 items-start">
                      <span className="text-small">{service.name}</span>

                      <AppChip>{intlStore.formatCurrency(service.amount)}</AppChip>
                    </div>
                  ),
                })
              }
            </FormAutocomplete>

            <FormNumberInput hideStepper required id={`services[${index}].quantity`} label={null} size="sm" />

            {canManage && (
              <Button size="icon" type="button" variant="destructive" onClick={() => deleteService(index)}>
                <Icon icon={Trash2} />
              </Button>
            )}
          </div>
        );
      })}

      {(form.services || []).length === 0 && <p className="text-x-sm text-subdued">{t("DealModal.noServicesAdded")}</p>}
    </div>
  );
});
