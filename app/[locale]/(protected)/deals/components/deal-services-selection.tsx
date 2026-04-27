"use client";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { EntityType, Resource } from "@/generated/prisma";

import { createServiceByNameAction, getServicesAction } from "../../services/actions";

import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { Icon } from "@/components/shared/icon";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";

export const DealServicesSelection = observer(() => {
  const { dealDetailStore, intlStore, userStore } = useRootStore();
  const { form, fetchedEntity, canManage, addService, deleteService, serviceAmountById, totalQuantity, totalValue } =
    dealDetailStore;
  const openEntity = useOpenEntity();
  const t = useTranslations("");

  if (!userStore.canAccess(Resource.services)) return null;

  async function getServiceOptions(params: { searchTerm?: string }) {
    const result = await getServicesAction(params);
    dealDetailStore.rememberServiceAmounts(result.items);
    return {
      ...result,
      items: result.items.map((service) => ({ ...service, quantity: 1 })),
    };
  }

  async function createServiceOption(name: string) {
    const service = await createServiceByNameAction(name, userStore.user?.id);
    if (service) dealDetailStore.rememberServiceAmounts([service]);
    return service ? { ...service, quantity: 1 } : null;
  }

  return (
    <div className="flex w-full flex-col space-y-2 items-start">
      <div className="w-full grid grid-cols-[minmax(40px,1fr)_minmax(40px,68px)_minmax(0,max-content)_40px] gap-2 gap-y-3 items-center">
        <label className="text-x-md truncate min-w-0 text-muted-foreground">{t("DealModal.servicesLabel")}</label>

        <label className="text-x-md text-right pr-3 truncate min-w-0 text-muted-foreground">
          {t("DealModal.quantityLabel")}
        </label>

        <label className="text-x-md text-right truncate min-w-0 text-muted-foreground">
          {t("DealModal.valueLabel")}
        </label>

        {canManage ? (
          <Button size="icon" type="button" variant="default" onClick={addService}>
            <Icon icon={Plus} />
          </Button>
        ) : (
          <span />
        )}

        {(form.services || []).map((service, index) => {
          const selectedServiceIds = (form.services || [])
            .map((s) => s.serviceId)
            .filter((id, idx) => idx !== index && id && id.trim() !== "");

          const lineAmount = service.serviceId ? (serviceAmountById.get(service.serviceId) ?? 0) : 0;
          const lineQuantity = service.quantity ?? 0;
          const lineTotal = lineAmount * lineQuantity;

          return (
            <Fragment key={index}>
              <FormAutocomplete
                required
                filterFunction={(availableService) => !selectedServiceIds.includes(availableService.id)}
                getItems={getServiceOptions}
                id={`services[${index}].serviceId`}
                items={fetchedEntity?.services.filter((it) => !selectedServiceIds.includes(it.id)) ?? []}
                label={null}
                renderValue={(items) =>
                  items.map((item, idx) => (
                    <AppChip key={item?.data?.id ?? item?.key ?? idx}>{item?.data?.name}</AppChip>
                  ))
                }
                onChipClick={(id) => openEntity(EntityType.service, id)}
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

              <FormNumberInput
                hideStepper
                required
                className="text-right font-mono tabular-nums"
                id={`services[${index}].quantity`}
                label={null}
                size="sm"
              />

              <span className="text-x-md text-right font-mono tabular-nums text-foreground/80 truncate min-w-0">
                {lineTotal > 0 ? intlStore.formatCurrency(lineTotal) : ""}
              </span>

              {canManage ? (
                <Button
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
                  size="icon"
                  type="button"
                  variant="outline"
                  onClick={() => deleteService(index)}
                >
                  <Icon icon={Trash2} />
                </Button>
              ) : (
                <span />
              )}
            </Fragment>
          );
        })}

        {(form.services || []).length > 0 && (
          <>
            <span className="text-x-md text-right text-muted-foreground pt-1 pr-3">{t("DealModal.totalLabel")}</span>

            <span className="text-x-md text-right font-mono tabular-nums font-medium pt-1 pr-3">
              {intlStore.formatNumber(totalQuantity)}
            </span>

            <span className="text-x-md text-right font-mono tabular-nums font-medium truncate min-w-0 pt-1">
              {intlStore.formatCurrency(totalValue)}
            </span>

            <span />
          </>
        )}
      </div>

      {(form.services || []).length === 0 && <p className="text-x-sm text-subdued">{t("DealModal.noServicesAdded")}</p>}
    </div>
  );
});
