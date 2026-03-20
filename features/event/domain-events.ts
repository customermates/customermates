import type { ContactDto } from "@/features/contacts/contact.schema";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { DealDto } from "@/features/deals/deal.schema";
import type { ServiceDto } from "@/features/services/service.schema";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { UserRoleDto } from "@/features/role/get-roles.interactor";
import type { WebhookDto } from "@/features/webhook/webhook.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import type { CountryCode, Status, Currency } from "@/generated/prisma";

export enum DomainEvent {
  USER_REGISTERED = "user.registered",
  USER_UPDATED = "user.updated",
  COMPANY_UPDATED = "company.updated",
  CONTACT_CREATED = "contact.created",
  CONTACT_UPDATED = "contact.updated",
  CONTACT_DELETED = "contact.deleted",
  ORGANIZATION_CREATED = "organization.created",
  ORGANIZATION_UPDATED = "organization.updated",
  ORGANIZATION_DELETED = "organization.deleted",
  DEAL_CREATED = "deal.created",
  DEAL_UPDATED = "deal.updated",
  DEAL_DELETED = "deal.deleted",
  SERVICE_CREATED = "service.created",
  SERVICE_UPDATED = "service.updated",
  SERVICE_DELETED = "service.deleted",
  TASK_CREATED = "task.created",
  TASK_UPDATED = "task.updated",
  TASK_DELETED = "task.deleted",
  ROLE_CREATED = "role.created",
  ROLE_UPDATED = "role.updated",
  ROLE_DELETED = "role.deleted",
  WEBHOOK_CREATED = "webhook.created",
  WEBHOOK_UPDATED = "webhook.updated",
  WEBHOOK_DELETED = "webhook.deleted",
  CUSTOM_COLUMN_CREATED = "custom_column.created",
  CUSTOM_COLUMN_UPDATED = "custom_column.updated",
  CUSTOM_COLUMN_DELETED = "custom_column.deleted",
}

export type DomainEventMap = {
  [DomainEvent.USER_REGISTERED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      email: string;
      firstName: string;
      lastName: string;
      country: CountryCode;
      status: Status;
      avatarUrl: string | null;
      roleId: string | null;
      isNewCompany: boolean;
    };
  };
  [DomainEvent.USER_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      firstName: string;
      lastName: string;
      country: CountryCode;
      status?: Status;
      avatarUrl: string | null;
      roleId?: string;
    };
  };
  [DomainEvent.COMPANY_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      name: string;
      street: string;
      city: string;
      postalCode: string;
      country: CountryCode;
      currency: Currency;
    };
  };
  [DomainEvent.CONTACT_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ContactDto;
  };
  [DomainEvent.CONTACT_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      contact: ContactDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.CONTACT_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ContactDto;
  };
  [DomainEvent.ORGANIZATION_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: OrganizationDto;
  };
  [DomainEvent.ORGANIZATION_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      organization: OrganizationDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.ORGANIZATION_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: OrganizationDto;
  };
  [DomainEvent.DEAL_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: DealDto;
  };
  [DomainEvent.DEAL_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      deal: DealDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.DEAL_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: DealDto;
  };
  [DomainEvent.SERVICE_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ServiceDto;
  };
  [DomainEvent.SERVICE_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      service: ServiceDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.SERVICE_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ServiceDto;
  };
  [DomainEvent.TASK_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: TaskDto;
  };
  [DomainEvent.TASK_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      task: TaskDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.TASK_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: TaskDto;
  };
  [DomainEvent.ROLE_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: UserRoleDto;
  };
  [DomainEvent.ROLE_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      role: UserRoleDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.ROLE_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: UserRoleDto;
  };
  [DomainEvent.WEBHOOK_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WebhookDto;
  };
  [DomainEvent.WEBHOOK_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      webhook: WebhookDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.WEBHOOK_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WebhookDto;
  };
  [DomainEvent.CUSTOM_COLUMN_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: CustomColumnDto;
  };
  [DomainEvent.CUSTOM_COLUMN_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      customColumn: CustomColumnDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.CUSTOM_COLUMN_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: CustomColumnDto;
  };
};
