import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { ExtendedWidget, DiagramDataPoint } from "../widget.types";

import { DealRecord, GroupAccumulator, EntityForGrouping } from "./widget-calculator.types";

import { PrismaCustomColumnRepo } from "@/features/custom-column/prisma-custom-column.repository";
import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { di } from "@/core/dependency-injection/container";

@Repository
export class WidgetGroupingService extends BaseRepository {
  private get customColumnRepo() {
    return di.get(PrismaCustomColumnRepo);
  }

  groupDealsByEntityType(widget: ExtendedWidget, deals: DealRecord[]): DiagramDataPoint[] {
    const { groupByType, aggregationType } = widget;
    const acc: GroupAccumulator = new Map();

    switch (groupByType) {
      case WidgetGroupByType.contact:
        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          const contacts = deal.contacts ?? [];
          if (contacts.length === 0) {
            const existing = acc.get("no-group");
            acc.set("no-group", { label: "No Group", value: (existing?.value ?? 0) + dealValue });
          } else {
            contacts.forEach((contact) => {
              const label = `${contact.contact.firstName ?? ""} ${contact.contact.lastName ?? ""}`.trim();
              const existing = acc.get(contact.contact.id);
              acc.set(contact.contact.id, { label, value: (existing?.value ?? 0) + dealValue });
            });
          }
        }
        break;

      case WidgetGroupByType.organization:
        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          const organizations = deal.organizations ?? [];
          if (organizations.length === 0) {
            const existing = acc.get("no-group");
            acc.set("no-group", { label: "No Group", value: (existing?.value ?? 0) + dealValue });
          } else {
            organizations.forEach((organization) => {
              const label = organization.organization.name || organization.organization.id;
              const existing = acc.get(organization.organization.id);
              acc.set(organization.organization.id, { label, value: (existing?.value ?? 0) + dealValue });
            });
          }
        }
        break;

      case WidgetGroupByType.deal:
        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          const label = deal.name || deal.id;
          const existing = acc.get(deal.id);
          acc.set(deal.id, { label, value: (existing?.value ?? 0) + dealValue });
        }
        break;

      case WidgetGroupByType.service:
        for (const deal of deals) {
          for (const service of deal.services ?? []) {
            const serviceValue = this.getServiceValue(service, aggregationType);
            const label = service.service.name || service.service.id;
            const existing = acc.get(service.service.id);
            acc.set(service.service.id, { label, value: (existing?.value ?? 0) + serviceValue });
          }
        }
        break;

      default:
        break;
    }

    return Array.from(acc.values());
  }

  private getDealValue(deal: { totalValue: number; totalQuantity: number }, aggregationType: AggregationType): number {
    switch (aggregationType) {
      case AggregationType.dealValue:
        return deal.totalValue;
      case AggregationType.dealQuantity:
        return deal.totalQuantity;
      default:
        return 0;
    }
  }

  private getServiceValue(
    service: { service: { amount: number }; quantity: number },
    aggregationType: AggregationType,
  ): number {
    switch (aggregationType) {
      case AggregationType.dealValue:
        return service.service.amount * service.quantity;
      case AggregationType.dealQuantity:
        return service.quantity;
      default:
        return 0;
    }
  }

  async groupDealsByCustomColumn(widget: ExtendedWidget, deals: DealRecord[]): Promise<DiagramDataPoint[]> {
    const { groupByCustomColumnId, entityType, aggregationType } = widget;

    if (!groupByCustomColumnId) return [];

    const customColumn = await this.customColumnRepo.find(groupByCustomColumnId);
    if (!customColumn || customColumn.type !== "singleSelect") return [];

    const optionsMap = new Map<string, string>();
    customColumn.options?.options?.forEach((opt) => {
      if (opt.value && opt.label) optionsMap.set(opt.value, opt.label);
    });

    const items: Array<{ id: string; value: number }> = [];

    switch (entityType) {
      case EntityType.contact: {
        const contactIds = new Set<string>();
        deals.forEach((deal) => {
          (deal.contacts ?? []).forEach((contact) => contactIds.add(contact.contact.id));
        });

        const valueByContactId = await this.customColumnRepo.findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.contact,
          Array.from(contactIds),
        );

        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          (deal.contacts ?? []).forEach((contact) => {
            items.push({ id: contact.contact.id, value: dealValue });
          });
        }

        return this.accumulateCustomColumnValues(items, valueByContactId, optionsMap);
      }

      case EntityType.organization: {
        const organizationIds = new Set<string>();
        deals.forEach((deal) => {
          (deal.organizations ?? []).forEach((organization) => organizationIds.add(organization.organization.id));
        });

        const valueByOrganizationId = await this.customColumnRepo.findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.organization,
          Array.from(organizationIds),
        );

        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          (deal.organizations ?? []).forEach((organization) => {
            items.push({ id: organization.organization.id, value: dealValue });
          });
        }

        return this.accumulateCustomColumnValues(items, valueByOrganizationId, optionsMap);
      }

      case EntityType.deal: {
        const dealIds = deals.map((deal) => deal.id);

        const valueByDealId = await this.customColumnRepo.findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.deal,
          dealIds,
        );

        for (const deal of deals) {
          const dealValue = this.getDealValue(deal, aggregationType);
          items.push({ id: deal.id, value: dealValue });
        }

        return this.accumulateCustomColumnValues(items, valueByDealId, optionsMap);
      }

      case EntityType.service: {
        const serviceIds = new Set<string>();
        deals.forEach((deal) => {
          (deal.services ?? []).forEach((service) => {
            serviceIds.add(service.service.id);
            const serviceValue = this.getServiceValue(service, aggregationType);
            items.push({ id: service.service.id, value: serviceValue });
          });
        });

        const valueByServiceId = await this.customColumnRepo.findCustomFieldValuesMap(
          groupByCustomColumnId,
          EntityType.service,
          Array.from(serviceIds),
        );

        return this.accumulateCustomColumnValues(items, valueByServiceId, optionsMap);
      }

      case EntityType.task: {
        return [];
      }
    }
  }

  private accumulateCustomColumnValues(
    items: Array<{ id: string; value: number }>,
    valueById: Map<string, string>,
    optionsMap: Map<string, string>,
  ): DiagramDataPoint[] {
    const acc: GroupAccumulator = new Map();

    for (const item of items) {
      const customValueId = valueById.get(item.id);
      if (!customValueId) {
        const existing = acc.get("no-group");
        acc.set("no-group", { label: "No Group", value: (existing?.value ?? 0) + item.value });
        continue;
      }

      const label = optionsMap.get(customValueId) || customValueId;
      const existing = acc.get(customValueId);
      acc.set(customValueId, { label, value: (existing?.value ?? 0) + item.value });
    }

    return Array.from(acc.values());
  }

  async groupEntitiesByCustomColumn(
    entityType: EntityType,
    entities: EntityForGrouping[],
    customColumnId: string,
  ): Promise<DiagramDataPoint[]> {
    const customColumn = await this.customColumnRepo.find(customColumnId);

    if (!customColumn || customColumn.type !== "singleSelect") return [];

    const optionsMap = new Map<string, string>();

    customColumn.options?.options?.forEach((opt) => {
      if (opt.value && opt.label) optionsMap.set(opt.value, opt.label);
    });

    const entityIds = entities.map((e) => e.id);
    const valueByEntityId = await this.customColumnRepo.findCustomFieldValuesMap(customColumnId, entityType, entityIds);

    const acc: GroupAccumulator = new Map();

    for (const entity of entities) {
      const customValueId = valueByEntityId.get(entity.id);
      if (!customValueId) {
        const existing = acc.get("no-group");
        acc.set("no-group", { label: "No Group", value: (existing?.value ?? 0) + 1 });
        continue;
      }

      const label = optionsMap.get(customValueId) || customValueId;
      const existing = acc.get(customValueId);
      acc.set(customValueId, { label, value: (existing?.value ?? 0) + 1 });
    }

    return Array.from(acc.values());
  }

  groupEntitiesByEntityType(entities: EntityForGrouping[], entityType: EntityType): DiagramDataPoint[] {
    const acc: GroupAccumulator = new Map();

    for (const entity of entities) {
      const label = this.getEntityLabel(entity, entityType);
      const existing = acc.get(entity.id);
      acc.set(entity.id, { label, value: (existing?.value ?? 0) + 1 });
    }

    return Array.from(acc.values());
  }

  private getEntityLabel(entity: EntityForGrouping, entityType: EntityType): string {
    switch (entityType) {
      case EntityType.contact:
        return `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim();
      case EntityType.organization:
        return entity.name || entity.id;
      case EntityType.deal:
        return entity.name || entity.id;
      case EntityType.service:
        return entity.name || entity.id;
      case EntityType.task:
        return entity.name || entity.id;
    }
  }
}
