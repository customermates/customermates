"use client";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { EntityType, Resource } from "@/generated/prisma";

import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { Icon } from "@/components/shared/icon";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

export const DealServicesSelection = observer(() => {
  const { dealDetailStore, intlStore, userStore } = useRootStore();
  const { form, fetchedEntity, canManage, addService, deleteService, serviceAmountById, totalQuantity, totalValue } =
    dealDetailStore;
  const entityHref = useEntityHref();
  const t = useTranslations();
  const { plural } = useEntityTerminology();

  if (!userStore.canAccess(Resource.services)) return null;

  return (
    <div className="flex w-full flex-col space-y-2 items-start">
      <div className="w-full grid grid-cols-[minmax(40px,1fr)_minmax(70px,130px)_40px] gap-2 gap-y-3 items-center">
        <div className="flex items-center w-full min-w-0">
          <label className="flex-1 text-x-md truncate min-w-0 text-muted-foreground">
            {plural(EntityType.service)}
          </label>

          <label className="text-x-md text-right truncate min-w-0 text-muted-foreground pl-2">
            {t("DealModal.quantityLabel")}
          </label>
        </div>

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
              <div className="flex items-stretch w-full">
                <FormAutocomplete
                  required
                  chipHref={(id) => entityHref(EntityType.service, id)}
                  className="rounded-r-none border-r-0"
                  containerClassName="flex-1 min-w-0"
                  filterFunction={(availableService) => !selectedServiceIds.includes(availableService.id)}
                  getItems={dealDetailStore.searchServiceOptions}
                  id={`services[${index}].serviceId`}
                  items={fetchedEntity?.services.filter((it) => !selectedServiceIds.includes(it.id)) ?? []}
                  label={null}
                  popoverFitContent={true}
                  renderValue={(items) =>
                    items.map((item, idx) => {
                      const unitAmount = item?.data?.amount ?? 0;
                      return (
                        <AppChip
                          key={item?.data?.id ?? item?.key ?? idx}
                          endContent={
                            unitAmount > 0 ? (
                              <span className="flex shrink-0 items-center gap-1">
                                <span className="opacity-60">·</span>

                                <span className="tabular-nums">{intlStore.formatCurrency(unitAmount)}</span>
                              </span>
                            ) : undefined
                          }
                        >
                          {item?.data?.name}
                        </AppChip>
                      );
                    })
                  }
                  onCreate={dealDetailStore.createServiceOption}
                >
                  {(service) =>
                    FormAutocompleteItem({
                      textValue: service.name,

                      children: (
                        <div className="flex w-full items-center gap-3 whitespace-nowrap">
                          <span className="text-sm">{service.name}</span>

                          <span className="opacity-60">·</span>

                          <span className="text-xs tabular-nums text-muted-foreground">
                            {intlStore.formatCurrency(service.amount)}
                          </span>
                        </div>
                      ),
                    })
                  }
                </FormAutocomplete>

                <FormNumberInput
                  hideStepper
                  required
                  className="rounded-l-none border-l-0 text-right font-mono tabular-nums"
                  containerClassName="w-20 shrink-0"
                  id={`services[${index}].quantity`}
                  label={null}
                  size="sm"
                />
              </div>

              <span
                className="text-x-md text-right font-mono tabular-nums text-foreground/80 truncate min-w-0"
                title={lineTotal > 0 ? intlStore.formatCurrency(lineTotal) : undefined}
              >
                {lineTotal > 0 ? intlStore.formatCurrency(lineTotal) : ""}
              </span>

              {canManage ? (
                <Button size="icon" type="button" variant="destructiveOutline" onClick={() => deleteService(index)}>
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
            <div className="flex items-center w-full min-w-0 gap-2">
              <span className="flex-1 text-x-md text-right text-muted-foreground pt-1 truncate min-w-0">
                {t("DealModal.totalLabel")}
              </span>

              <span
                className="text-x-md text-right font-mono tabular-nums font-medium pt-1 truncate min-w-0 px-3"
                title={intlStore.formatNumber(totalQuantity)}
              >
                {intlStore.formatNumber(totalQuantity)}
              </span>
            </div>

            <span
              className="text-x-md text-right font-mono tabular-nums font-medium truncate min-w-0 pt-1"
              title={intlStore.formatCurrency(totalValue)}
            >
              {intlStore.formatCurrency(totalValue)}
            </span>

            <span />
          </>
        )}
      </div>

      {(form.services || []).length === 0 && (
        <p className="text-x-sm text-subdued">
          {t("DealModal.noServicesAdded", { entity: plural(EntityType.service).toLocaleLowerCase() })}
        </p>
      )}
    </div>
  );
});
