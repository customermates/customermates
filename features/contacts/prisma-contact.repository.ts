import type { RepoArgs } from "@/core/utils/types";
import type { GetWidgetFilterableFieldsContactRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { GetCompanyWideContactRepo } from "./get-company-wide-contact.repo";
import type { GetContactsRepo } from "./get/get-contacts.interactor";
import type { GetConfigurationRepo } from "@/core/base/base-get-configuration.interactor";
import type { GetContactByIdRepo } from "./get/get-contact-by-id.interactor";
import type { CreateContactRepo } from "./upsert/create-contact.repo";
import type { UpdateContactRepo } from "./upsert/update-contact.repo";
import type { DeleteContactRepo } from "./delete/delete-contact.repo";
import type { FindContactsByIdsRepo } from "./find-contacts-by-ids.repo";
import type { StartChatContactRepo } from "@/ee/messaging/outbound/start-chat.interactor";
import type { ActivityContactRepo } from "@/ee/messaging/activities/prisma-activities.repository";
import type { ModifyRelationContactRepo } from "@/features/relations/modify-entity-relation.interactor";
import type { ContactIdentifierOwnersRepo } from "./contact-identifier-owners.repo";

import { EntityType, Resource } from "@/generated/prisma";

import type { Prisma, MessagingProvider } from "@/generated/prisma";

import { type ContactDto, type IdentifierInput } from "./contact.schema";

import { channelStrings, identifierKey } from "./upsert/validate-identifiers";
import { parseContactKey } from "./contact-key";
import { normalizeChannelValue } from "./channel-value";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { getCustomColumnRepo, getMessagingRepo } from "@/core/di";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { EMAIL_PROVIDERS, channelClass, classWhere } from "@/ee/messaging/provider";

export class PrismaContactRepo
  extends BaseRepository<Prisma.ContactWhereInput>
  implements
    GetContactsRepo,
    GetContactByIdRepo,
    CreateContactRepo,
    UpdateContactRepo,
    DeleteContactRepo,
    GetWidgetFilterableFieldsContactRepo,
    GetConfigurationRepo,
    FindContactsByIdsRepo,
    GetCompanyWideContactRepo,
    StartChatContactRepo,
    ActivityContactRepo,
    ModifyRelationContactRepo,
    ContactIdentifierOwnersRepo
{
  private get userScopedSelect() {
    return {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      identifiers: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          provider: true,
          value: true,
          messagingId: true,
          displayName: true,
          profileUrl: true,
        },
      },
      organizations: {
        where: { organization: this.accessWhere("organization") },
        select: { organization: { select: { id: true, name: true } } },
      },
      users: {
        where: { user: this.accessWhere("user") },
        select: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              email: true,
            },
          },
        },
      },
      deals: {
        where: { deal: this.accessWhere("deal") },
        select: { deal: { select: { id: true, name: true } } },
      },
      tasks: {
        where: { task: this.accessWhere("task") },
        select: { task: { select: { id: true, name: true, type: true } } },
      },
      customFieldValues: {
        select: {
          columnId: true,
          value: true,
        },
      },
    } as const;
  }

  private get companyScopedSelect() {
    return {
      ...this.userScopedSelect,
      organizations: { select: this.userScopedSelect.organizations.select },
      users: { select: this.userScopedSelect.users.select },
      deals: { select: this.userScopedSelect.deals.select },
      tasks: { select: this.userScopedSelect.tasks.select },
    };
  }

  getSearchableFields() {
    return [
      { field: "firstName" },
      { field: "lastName" },
      { field: "identifiers.value" },
      { field: "organizations.organization.name" },
    ];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["firstName", "lastName"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.contacts)) return [];

    const customFields = await getCustomColumnRepo().getFilterableCustomFields(EntityType.contact);

    const filterFields = [];

    if (this.canAccess(Resource.organizations)) {
      filterFields.push({
        field: FilterFieldKey.organizationIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.organizationIds],
      });
    }

    if (this.canAccess(Resource.deals)) {
      filterFields.push({
        field: FilterFieldKey.dealIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.dealIds],
      });
    }

    if (this.canAccess(Resource.tasks)) {
      filterFields.push({
        field: FilterFieldKey.taskIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.taskIds],
      });
    }

    return [
      ...filterFields,
      ...customFields,
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      {
        field: FilterFieldKey.updatedAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt],
      },
      {
        field: FilterFieldKey.createdAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt],
      },
    ];
  }

  async getCustomColumns() {
    return await getCustomColumnRepo().findByEntityType(EntityType.contact);
  }

  async getContactById(id: string) {
    const resolvedId = (await this.resolveKeysToIds([id])).get(id);
    if (!resolvedId) return null;

    const contact = await this.prisma.contact.findFirst({
      where: {
        id: resolvedId,
        ...this.accessWhere("contact"),
      },
      select: this.userScopedSelect,
    });

    if (!contact) return null;

    return this.toDto(contact);
  }

  async getOrThrowCompanyWide(id: string) {
    const { companyId } = this.user;
    const resolvedId = (await this.resolveKeysToIds([id])).get(id);
    if (!resolvedId) throw new Error("Contact not found");

    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id: resolvedId, companyId },
      select: this.companyScopedSelect,
    });

    return this.toDto(contact);
  }

  async getManyOrThrowCompanyWide(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueKeys = [...new Set(ids)];

    const resolved = await this.resolveKeysToIds(uniqueKeys);
    if (resolved.size !== uniqueKeys.length) throw new Error("One or more contacts not found");
    const uuids = [...new Set(resolved.values())];

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: uuids }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (contacts.length !== uuids.length) throw new Error("One or more contacts not found");

    return contacts.map((contact) => this.toDto(contact));
  }

  private toDto(contact: Prisma.ContactGetPayload<{ select: PrismaContactRepo["userScopedSelect"] }>): ContactDto {
    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "contact",
      baseWhere: this.accessWhere("contact"),
      select: this.userScopedSelect,
      params,
      map: (contact: Prisma.ContactGetPayload<{ select: PrismaContactRepo["userScopedSelect"] }>) =>
        this.toDto(contact),
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("contact"));

    return this.prisma.contact.count({ where });
  }

  @Transaction
  async createContactOrThrow(args: RepoArgs<CreateContactRepo, "createContactOrThrow">) {
    const { companyId } = this.user;
    const { organizationIds, userIds, dealIds, taskIds, customFieldValues, identifiers, firstName, lastName, notes } =
      args;

    const data = {
      firstName,
      lastName,
      notes,
      companyId,
    };

    const contact = await this.prisma.contact.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (organizationIds.length > 0) {
      promises.push(
        this.prisma.contactOrganization.createMany({
          data: organizationIds.map((organizationId) => ({
            contactId: contact.id,
            organizationId,
            companyId,
          })),
        }),
      );
    }

    if (userIds.length > 0) {
      promises.push(
        this.prisma.contactUser.createMany({
          data: userIds.map((userId) => ({
            contactId: contact.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (dealIds.length > 0) {
      promises.push(
        this.prisma.dealContact.createMany({
          data: dealIds.map((dealId) => ({
            contactId: contact.id,
            dealId,
            companyId,
          })),
        }),
      );
    }

    if (taskIds.length > 0) {
      promises.push(
        this.prisma.taskContact.createMany({
          data: taskIds.map((taskId) => ({
            contactId: contact.id,
            taskId,
            companyId,
          })),
        }),
      );
    }

    promises.push(getCustomColumnRepo().writeValuesForCreate(EntityType.contact, contact.id, customFieldValues));

    if (identifiers && identifiers.length > 0) promises.push(this.upsertContactIdentifiers(contact.id, identifiers));

    await Promise.all(promises);

    const createdContact = await this.prisma.contact.findFirstOrThrow({
      where: { id: contact.id, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    return this.toDto(createdContact);
  }

  @Transaction
  async updateContactOrThrow(args: RepoArgs<UpdateContactRepo, "updateContactOrThrow">) {
    const { companyId } = this.user;
    const {
      id: idKey,
      organizationIds,
      userIds,
      dealIds,
      taskIds,
      customFieldValues,
      identifiers,
      ...contactData
    } = args;
    const id = (await this.resolveKeysToIds([idKey])).get(idKey);
    if (!id) throw new Error("Contact not found");

    const data: Prisma.ContactUpdateManyArgs["data"] = { companyId };

    if (contactData.firstName !== undefined) data.firstName = contactData.firstName;
    if (contactData.lastName !== undefined) data.lastName = contactData.lastName;
    if (contactData.notes !== undefined) data.notes = contactData.notes;

    await this.prisma.contact.updateMany({
      where: { id, ...this.accessWhere("contact") },
      data,
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (organizationIds !== undefined) {
      deletePromises.push(
        this.prisma.contactOrganization.deleteMany({
          where: {
            contactId: id,
            companyId,
            organization: this.accessWhere("organization"),
          },
        }),
      );

      if (organizationIds !== null && organizationIds.length > 0) {
        createPromises.push(
          this.prisma.contactOrganization.createMany({
            data: organizationIds.map((organizationId) => ({
              contactId: id,
              organizationId,
              companyId,
            })),
          }),
        );
      }
    }

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.contactUser.deleteMany({
          where: {
            contactId: id,
            companyId,
            user: { is: this.accessWhere("user") },
          },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.contactUser.createMany({
            data: userIds.map((userId) => ({
              contactId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (dealIds !== undefined) {
      deletePromises.push(
        this.prisma.dealContact.deleteMany({
          where: { contactId: id, companyId, deal: this.accessWhere("deal") },
        }),
      );

      if (dealIds !== null && dealIds.length > 0) {
        createPromises.push(
          this.prisma.dealContact.createMany({
            data: dealIds.map((dealId) => ({
              contactId: id,
              dealId,
              companyId,
            })),
          }),
        );
      }
    }

    if (taskIds !== undefined) {
      deletePromises.push(
        this.prisma.taskContact.deleteMany({
          where: { contactId: id, companyId, task: this.accessWhere("task") },
        }),
      );

      if (taskIds !== null && taskIds.length > 0) {
        createPromises.push(
          this.prisma.taskContact.createMany({
            data: taskIds.map((taskId) => ({
              contactId: id,
              taskId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(getCustomColumnRepo().deleteValuesForEntity(EntityType.contact, id));
      else createPromises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.contact, id, customFieldValues));
    }

    if (identifiers !== undefined) createPromises.push(this.replaceContactIdentifiers(id, identifiers));

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    const updatedContact = await this.prisma.contact.findFirstOrThrow({
      where: { id, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    return this.toDto(updatedContact);
  }

  @Transaction
  async deleteContactOrThrow(id: string) {
    const resolvedId = (await this.resolveKeysToIds([id])).get(id);
    if (!resolvedId) throw new Error("Contact not found");

    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id: resolvedId, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    const contactDto: ContactDto = this.toDto(contact);

    await this.prisma.contact.deleteMany({
      where: { id: resolvedId, ...this.accessWhere("contact") },
    });

    return contactDto;
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Map<string, string>();

    const resolved = await this.resolveKeysToIds([...ids]);
    const candidateUuids = [...new Set(resolved.values())];
    if (candidateUuids.length === 0) return new Map<string, string>();

    const contacts = await this.prisma.contact.findMany({
      where: {
        id: { in: candidateUuids },
        ...this.accessWhere("contact"),
      },
      select: { id: true },
    });
    const visible = new Set(contacts.map((contact) => contact.id));

    const out = new Map<string, string>();
    for (const [key, uuid] of resolved) if (visible.has(uuid)) out.set(key, uuid);
    return out;
  }

  private async resolveKeysToIds(keys: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const channelLookups: { key: string; provider: MessagingProvider; value: string }[] = [];

    for (const key of keys) {
      const parsed = parseContactKey(key);
      if (parsed.kind === "id") out.set(key, parsed.id);
      else if (parsed.kind === "channel") {
        const normalized = normalizeChannelValue(parsed.provider, parsed.value);
        if (normalized) channelLookups.push({ key, provider: parsed.provider, value: normalized });
      }
    }

    if (channelLookups.length > 0) {
      const owners = await this.findIdentifierOwnersCompanyWide(
        channelLookups.map(({ provider, value }) => ({ provider, value })),
      );
      for (const { key, provider, value } of channelLookups) {
        const ownerId = owners.get(identifierKey(provider, value));
        if (ownerId) out.set(key, ownerId);
      }
    }

    return out;
  }

  async findIdentifierOwnersCompanyWide(
    pairs: { provider: MessagingProvider; value: string }[],
  ): Promise<Map<string, string>> {
    if (pairs.length === 0) return new Map();

    const rows = await this.prisma.contactIdentifier.findMany({
      where: {
        companyId: this.companyId,
        OR: pairs.map((pair) => ({
          ...classWhere(pair.provider),
          OR: [{ value: pair.value }, { messagingId: pair.value }],
        })),
      },
      select: { provider: true, value: true, messagingId: true, contactId: true },
    });

    const owners = new Map<string, string>();
    for (const row of rows) {
      owners.set(identifierKey(row.provider, row.value), row.contactId);
      if (row.messagingId) owners.set(identifierKey(row.provider, row.messagingId), row.contactId);
    }
    return owners;
  }

  private async upsertContactIdentifiers(contactId: string, identifiers: IdentifierInput[]): Promise<void> {
    if (identifiers.length === 0) return;

    for (const identifier of identifiers) {
      await this.prisma.contactIdentifier.upsert({
        where: {
          companyId_channelClass_value: {
            companyId: this.companyId,
            channelClass: channelClass(identifier.provider),
            value: identifier.value,
          },
        },
        create: {
          companyId: this.companyId,
          contactId,
          provider: identifier.provider,
          channelClass: channelClass(identifier.provider),
          value: identifier.value,
          messagingId: identifier.messagingId ?? null,
          displayName: identifier.displayName ?? null,
          profileUrl: identifier.profileUrl ?? null,
        },
        update: {
          companyId: this.companyId,
          contactId,
          messagingId: identifier.messagingId ?? undefined,
          displayName: identifier.displayName ?? undefined,
          profileUrl: identifier.profileUrl ?? undefined,
        },
      });
    }

    await this.recomputeContactAvatarUnscoped({ contactId, companyId: this.companyId });
  }

  private async replaceContactIdentifiers(contactId: string, identifiers: IdentifierInput[]): Promise<void> {
    const existing = await this.prisma.contactIdentifier.findMany({
      where: { companyId: this.companyId, contactId },
      select: { id: true, provider: true, value: true, messagingId: true },
    });

    const matchesRow = (identifier: IdentifierInput, row: (typeof existing)[number]): boolean =>
      channelClass(identifier.provider) === channelClass(row.provider) &&
      channelStrings(identifier).some((key) => key === row.value || key === row.messagingId);

    const remaining = [...identifiers];

    for (const row of existing) {
      const matchIndex = remaining.findIndex((identifier) => matchesRow(identifier, row));

      if (matchIndex === -1) {
        await this.prisma.contactIdentifier.deleteMany({ where: { id: row.id, companyId: this.companyId } });
        continue;
      }

      const [identifier] = remaining.splice(matchIndex, 1);
      await this.prisma.contactIdentifier.updateMany({
        where: { id: row.id, companyId: this.companyId },
        data: {
          value: identifier.value,
          messagingId: identifier.messagingId ?? undefined,
          displayName: identifier.displayName ?? undefined,
          profileUrl: identifier.profileUrl ?? undefined,
        },
      });
    }

    for (const identifier of remaining) {
      await this.prisma.contactIdentifier.create({
        data: {
          companyId: this.companyId,
          contactId,
          provider: identifier.provider,
          channelClass: channelClass(identifier.provider),
          value: identifier.value,
          messagingId: identifier.messagingId ?? null,
          displayName: identifier.displayName ?? null,
          profileUrl: identifier.profileUrl ?? null,
        },
      });
    }

    await this.recomputeContactAvatarUnscoped({ contactId, companyId: this.companyId });
  }

  @BypassTenantGuard
  async recomputeContactAvatarUnscoped(args: { contactId: string; companyId: string }) {
    const { contactId, companyId } = args;

    await this.runAfterCommit(async () => {
      const pictureUrl = await getMessagingRepo().findParticipantPictureUrlUnscoped({ companyId, contactId });

      await this.prisma.contact.updateMany({
        where: { id: contactId, companyId },
        data: { avatarUrl: pictureUrl ?? null },
      });
    });
  }

  async resolveContactIdsForEntityTypeCompanyWide(
    args: RepoArgs<ActivityContactRepo, "resolveContactIdsForEntityTypeCompanyWide">,
  ) {
    const { entityType, entityIds, limit } = args;
    const ids = entityIds?.length ? entityIds : undefined;

    if (entityType === EntityType.contact) {
      const rows = await this.prisma.contact.findMany({
        where: {
          ...(ids ? { id: { in: ids } } : {}),
          ...this.accessWhere("contact"),
        },
        select: { id: true },
        take: limit,
      });
      return rows.map((r) => r.id);
    }

    if (entityType === EntityType.organization) {
      const rows = await this.prisma.contactOrganization.findMany({
        where: {
          companyId: this.companyId,
          ...(ids ? { organizationId: { in: ids } } : {}),
          organization: this.accessWhere("organization"),
        },
        select: { contactId: true },
        distinct: ["contactId"],
        take: limit,
      });
      return rows.map((r) => r.contactId);
    }

    if (entityType === EntityType.deal) {
      const rows = await this.prisma.dealContact.findMany({
        where: {
          companyId: this.companyId,
          ...(ids ? { dealId: { in: ids } } : {}),
          deal: this.accessWhere("deal"),
        },
        select: { contactId: true },
        distinct: ["contactId"],
        take: limit,
      });
      return rows.map((r) => r.contactId);
    }

    if (entityType === EntityType.service) {
      const rows = await this.prisma.dealContact.findMany({
        where: {
          companyId: this.companyId,
          deal: {
            services: {
              some: {
                ...(ids ? { serviceId: { in: ids } } : {}),
                service: this.accessWhere("service"),
              },
            },
          },
        },
        select: { contactId: true },
        distinct: ["contactId"],
        take: limit,
      });
      return rows.map((row) => row.contactId);
    }

    if (entityType === EntityType.task) {
      const rows = await this.prisma.taskContact.findMany({
        where: {
          companyId: this.companyId,
          ...(ids ? { taskId: { in: ids } } : {}),
          task: this.accessWhere("task"),
        },
        select: { contactId: true },
        distinct: ["contactId"],
        take: limit,
      });
      return rows.map((r) => r.contactId);
    }

    return [];
  }

  async findContactIdentifierTargetsCompanyWide(contactIds: string[]) {
    if (contactIds.length === 0) return [];

    return this.prisma.contactIdentifier.findMany({
      where: { contactId: { in: contactIds }, companyId: this.companyId },
      select: { contactId: true, provider: true, value: true, messagingId: true },
    });
  }

  async classGroupedIdentifierWhereCompanyWide(contactIds: string[]) {
    if (contactIds.length === 0) return [];

    const identifiers = await this.findContactIdentifierTargetsCompanyWide(contactIds);
    const byClass = new Map<string, { provider: MessagingProvider; values: Set<string> }>();
    for (const { provider, value, messagingId } of identifiers) {
      const key = channelClass(provider);
      const entry = byClass.get(key) ?? { provider, values: new Set<string>() };
      entry.values.add(value);
      if (messagingId) entry.values.add(messagingId);
      byClass.set(key, entry);
    }

    return [...byClass.values()].map(({ provider, values }) => ({
      providerWhere: classWhere(provider),
      identifier: { in: [...values] },
    }));
  }

  async findContactChannelCompanyWide(args: RepoArgs<StartChatContactRepo, "findContactChannelCompanyWide">) {
    return this.prisma.contactIdentifier.findFirst({
      where: {
        companyId: this.companyId,
        provider: args.provider,
        OR: [{ value: args.identifier }, { messagingId: args.identifier }],
      },
      select: { id: true, messagingId: true, displayName: true, profileUrl: true },
    });
  }

  async saveResolvedContactChannel(args: RepoArgs<StartChatContactRepo, "saveResolvedContactChannel">) {
    await this.prisma.contactIdentifier.updateMany({
      where: { id: args.id, companyId: this.companyId },
      data: {
        messagingId: args.messagingId,
        displayName: args.displayName ?? undefined,
        profileUrl: args.profileUrl ?? undefined,
      },
    });
  }

  @BypassTenantGuard
  async findContactByEmailUnscoped(args: { companyId: string; email: string }) {
    const { companyId, email } = args;
    const normalized = email.toLowerCase();

    const row = await this.prisma.contactIdentifier.findFirst({
      where: {
        companyId,
        provider: { in: EMAIL_PROVIDERS as MessagingProvider[] },
        value: normalized,
      },
      select: { contactId: true },
    });

    return row ? { id: row.contactId } : null;
  }

  @BypassTenantGuard
  async findContactBySocialIdentifierUnscoped(args: {
    companyId: string;
    provider: MessagingProvider;
    identifier: string;
  }) {
    const { companyId, provider, identifier } = args;
    const trimmed = identifier.trim();

    if (!trimmed) return null;

    const row = await this.prisma.contactIdentifier.findFirst({
      where: { companyId, provider, OR: [{ value: trimmed }, { messagingId: trimmed }] },
      select: { contactId: true },
    });

    return row ? { id: row.contactId } : null;
  }
}
