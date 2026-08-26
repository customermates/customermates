"use client";

import type { ReactNode } from "react";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale, useTranslations } from "next-intl";
import { EntityType, Resource } from "@/generated/prisma";

import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormLabel } from "@/components/forms/form-label";
import { Icon } from "@/components/shared/icon";
import { InfoRow } from "@/components/shared/info-row";
import { TruncatedText } from "@/components/shared/truncated-text";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import {
  EntityRelationActions,
  type EntityDetailFieldPersonalization,
} from "@/components/entity-detail/entity-relation-actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { AppChip } from "@/components/chip/app-chip";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { terminologyLabelForSentence } from "@/features/entity-terminology/entity-terminology-label.utils";

type Props = {
  labelEndAddon?: ReactNode;
  personalization?: EntityDetailFieldPersonalization;
  showTotals?: boolean;
};

export const DealServicesSelection = observer(({ labelEndAddon, personalization, showTotals = true }: Props) => {
  const { dealDetailStore, userStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const {
    form,
    fetchedEntity,
    canManage,
    addService,
    deleteService,
    serviceAmountById,
    totalQuantity,
    totalValue,
    weightedValueBreakdown,
  } = dealDetailStore;
  const entityHref = useEntityHref();
  const locale = useLocale();
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const columnLabel = useColumnLabel();

  if (!userStore.canAccess(Resource.services)) return null;

  return (
    <div className="flex w-full flex-col space-y-2 items-start">
      <div className="w-full grid grid-cols-[minmax(40px,1fr)_minmax(70px,112px)_40px] gap-2 gap-y-3 items-center">
        <div className="flex items-center w-full min-w-0 gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <FormLabel className="block truncate min-w-0">{plural(EntityType.service)}</FormLabel>

            <EntityRelationActions
              currentEntityId={fetchedEntity?.id}
              currentEntityType="deal"
              personalization={personalization}
              targetEntityType="service"
            >
              {labelEndAddon}
            </EntityRelationActions>
          </div>

          <FormLabel className="block w-[4.5rem] shrink-0 text-right truncate">
            {t("DealModal.quantityLabel")}
          </FormLabel>
        </div>

        <FormLabel className="block text-right truncate min-w-0">{t("DealModal.valueLabel")}</FormLabel>

        <span />

        {(form.services || []).map((service, index) => {
          const selectedServiceIds = (form.services || [])
            .map((s) => s.serviceId)
            .filter((id, idx) => idx !== index && id && id.trim() !== "");

          const lineAmount = service.serviceId ? (serviceAmountById.get(service.serviceId) ?? 0) : 0;
          const lineQuantity = service.quantity ?? 0;
          const lineTotal = lineAmount * lineQuantity;

          return (
            <Fragment key={index}>
              <div className="flex items-stretch w-full gap-2">
                <FormAutocomplete
                  required
                  chipHref={(id) => entityHref(EntityType.service, id)}
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
                  required
                  className="text-right font-mono tabular-nums"
                  containerClassName="w-[4.5rem] shrink-0"
                  id={`services[${index}].quantity`}
                  label={null}
                />
              </div>

              <TruncatedText className="text-x-md text-right font-mono tabular-nums text-foreground/80">
                {lineTotal > 0 ? intlStore.formatCurrency(lineTotal) : ""}
              </TruncatedText>

              {canManage ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("Common.actions.delete")}
                      className="text-destructive hover:text-destructive"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => deleteService(index)}
                    >
                      <Icon icon={Trash2} />
                    </Button>
                  </TooltipTrigger>

                  <TooltipContent>{t("Common.actions.delete")}</TooltipContent>
                </Tooltip>
              ) : (
                <span />
              )}
            </Fragment>
          );
        })}

        {canManage && (
          <>
            <Button
              className="w-full justify-start text-muted-foreground"
              type="button"
              variant="secondary"
              onClick={addService}
            >
              <Icon icon={Plus} />

              {t("Common.inputs.addService")}
            </Button>

            <span />

            <span />
          </>
        )}
      </div>

      {showTotals && (form.services || []).length > 0 && (
        <div className="mt-3 flex w-full flex-col gap-1.5 pr-12">
          <InfoRow label={columnLabel("totalValue")}>
            <span className="text-x-md font-mono tabular-nums">{intlStore.formatCurrency(totalValue)}</span>
          </InfoRow>

          {weightedValueBreakdown && (
            <InfoRow
              label={`${columnLabel("weightedValue")} · ${weightedValueBreakdown.stage} ${weightedValueBreakdown.percent}%`}
            >
              <span className="text-x-md font-mono tabular-nums">
                {intlStore.formatCurrency(weightedValueBreakdown.weightedValue)}
              </span>
            </InfoRow>
          )}

          <InfoRow label={columnLabel("totalQuantity")}>
            <span className="text-x-md font-mono tabular-nums">{intlStore.formatNumber(totalQuantity)}</span>
          </InfoRow>
        </div>
      )}

      {(form.services || []).length === 0 && (
        <p className="text-x-sm text-subdued">
          {t("DealModal.noServicesAdded", {
            entity: terminologyLabelForSentence(plural(EntityType.service), locale),
          })}
        </p>
      )}
    </div>
  );
});
