import type { RepoArgs } from "@/core/utils/types";
import type { GetWidgetFilterableFieldsContactRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { GetUnscopedContactRepo } from "./get-unscoped-contact.repo";
import type { GetContactsRepo } from "./get/get-contacts.interactor";
import type { GetContactsConfigurationRepo } from "./get/get-contacts-configuration.interactor";
import type { GetContactByIdRepo } from "./get/get-contact-by-id.interactor";
import type { CreateContactRepo } from "./upsert/create-contact.repo";
import type { UpdateContactRepo } from "./upsert/update-contact.repo";
import type { DeleteContactRepo } from "./delete/delete-contact.repo";
import type { FindContactsByIdsRepo } from "./find-contacts-by-ids.repo";
import type { StartChatContactRepo } from "@/ee/messaging/outbound/start-chat.interactor";
import type { AssignContactToThreadContactRepo } from "@/ee/messaging/contact-assignment/assign-contact-to-thread.interactor";
import type { ActivityContactRepo } from "@/ee/messaging/activities/prisma-activities.repository";

import { EntityType, Resource } from "@/generated/prisma";

import type { Prisma, MessagingProvider } from "@/generated/prisma";

import { type ContactDto, type IdentifierInput } from "./contact.schema";

import { channelStrings, identifierKey } from "./upsert/validate-identifiers";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { getContactAvatarRepo, getCustomColumnRepo } from "@/core/di";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { EMAIL_PROVIDERS, isHandleProvider } from "@/ee/messaging/provider-icon";

export class PrismaContactRepo
  extends BaseRepository<Prisma.ContactWhereInput>
  implements
    GetContactsRepo,
    GetContactByIdRepo,
    CreateContactRepo,
    UpdateContactRepo,
    DeleteContactRepo,
    GetWidgetFilterableFieldsContactRepo,
    GetContactsConfigurationRepo,
    FindContactsByIdsRepo,
    GetUnscopedContactRepo,
    StartChatContactRepo,
    AssignContactToThreadContactRepo,
    ActivityContactRepo
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
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        ...this.accessWhere("contact"),
      },
      select: this.userScopedSelect,
    });

    if (!contact) return null;

    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };
  }

  async getOrThrowUnscoped(id: string) {
    const { companyId } = this.user;

    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id, companyId },
      select: this.companyScopedSelect,
    });

    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };
  }

  async getManyOrThrowUnscoped(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (contacts.length !== uniqueIds.length) throw new Error("One or more contacts not found");

    return contacts.map((contact) => ({
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    }));
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "contact",
      baseWhere: this.accessWhere("contact"),
      select: this.userScopedSelect,
      params,
      map: (
        contact: Prisma.ContactGetPayload<{
          select: PrismaContactRepo["userScopedSelect"];
        }>,
      ) => ({
        ...contact,
        organizations: contact.organizations.map((it) => it.organization),
        users: contact.users.map((it) => it.user),
        deals: contact.deals.map((it) => it.deal),
        tasks: contact.tasks.map((it) => it.task),
      }),
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

    return {
      ...createdContact,
      organizations: createdContact.organizations.map((it) => it.organization),
      users: createdContact.users.map((it) => it.user),
      deals: createdContact.deals.map((it) => it.deal),
      tasks: createdContact.tasks.map((it) => it.task),
    };
  }

  @Transaction
  async updateContactOrThrow(args: RepoArgs<UpdateContactRepo, "updateContactOrThrow">) {
    const { companyId } = this.user;
    const { id, organizationIds, userIds, dealIds, taskIds, customFieldValues, identifiers, ...contactData } = args;

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

    return {
      ...updatedContact,
      organizations: updatedContact.organizations.map((it) => it.organization),
      users: updatedContact.users.map((it) => it.user),
      deals: updatedContact.deals.map((it) => it.deal),
      tasks: updatedContact.tasks.map((it) => it.task),
    };
  }

  @Transaction
  async deleteContactOrThrow(id: string) {
    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    const contactDto: ContactDto = {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };

    await this.prisma.contact.deleteMany({
      where: { id, ...this.accessWhere("contact") },
    });

    return contactDto;
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const contacts = await this.prisma.contact.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("contact"),
      },
      select: { id: true },
    });

    return new Set(contacts.map((contact) => contact.id));
  }

  async findIdentifierOwners(pairs: { provider: MessagingProvider; value: string }[]): Promise<Map<string, string>> {
    if (pairs.length === 0) return new Map();

    const rows = await this.prisma.contactIdentifier.findMany({
      where: {
        companyId: this.companyId,
        OR: pairs.map((pair) => ({
          provider: pair.provider,
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
          companyId_provider_value: {
            companyId: this.companyId,
            provider: identifier.provider,
            value: identifier.value,
          },
        },
        create: {
          companyId: this.companyId,
          contactId,
          provider: identifier.provider,
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

    await getContactAvatarRepo().recomputeContactAvatar({ contactId, companyId: this.companyId });
  }

  private async replaceContactIdentifiers(contactId: string, identifiers: IdentifierInput[]): Promise<void> {
    const existing = await this.prisma.contactIdentifier.findMany({
      where: { companyId: this.companyId, contactId },
      select: { id: true, provider: true, value: true, messagingId: true },
    });

    const matchesRow = (identifier: IdentifierInput, row: (typeof existing)[number]): boolean =>
      identifier.provider === row.provider &&
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
          value: identifier.value,
          messagingId: identifier.messagingId ?? null,
          displayName: identifier.displayName ?? null,
          profileUrl: identifier.profileUrl ?? null,
        },
      });
    }

    await getContactAvatarRepo().recomputeContactAvatar({ contactId, companyId: this.companyId });
  }

  async resolveContactIdsForEntity(args: RepoArgs<ActivityContactRepo, "resolveContactIdsForEntity">) {
    const { entityType, entityId } = args;

    if (entityType === EntityType.contact) return [entityId];

    if (entityType === EntityType.organization) {
      const rows = await this.prisma.contactOrganization.findMany({
        where: { organizationId: entityId, companyId: this.companyId },
        select: { contactId: true },
      });
      return rows.map((r) => r.contactId);
    }

    if (entityType === EntityType.deal) {
      const rows = await this.prisma.dealContact.findMany({
        where: { dealId: entityId, companyId: this.companyId },
        select: { contactId: true },
      });
      return rows.map((r) => r.contactId);
    }

    if (entityType === EntityType.task) {
      const rows = await this.prisma.taskContact.findMany({
        where: { taskId: entityId, companyId: this.companyId },
        select: { contactId: true },
      });
      return rows.map((r) => r.contactId);
    }

    return [];
  }

  async findContactEmails(contactIds: string[]) {
    if (contactIds.length === 0) return [];

    const identifiers = await this.prisma.contactIdentifier.findMany({
      where: {
        contactId: { in: contactIds },
        companyId: this.companyId,
        provider: { in: EMAIL_PROVIDERS as MessagingProvider[] },
      },
      select: { value: true },
    });

    return identifiers.map((i) => i.value.toLowerCase());
  }

  async findContactChannel(args: RepoArgs<StartChatContactRepo, "findContactChannel">) {
    return this.prisma.contactIdentifier.findFirst({
      where: {
        companyId: this.companyId,
        provider: args.provider,
        OR: [{ value: args.identifier }, { messagingId: args.identifier }],
      },
      select: { id: true, messagingId: true },
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

  async removeContactIdentifier(args: RepoArgs<AssignContactToThreadContactRepo, "removeContactIdentifier">) {
    const { provider, value } = args;
    const trimmed = value.trim();

    if (!trimmed) return;

    const removed = await this.prisma.contactIdentifier.findMany({
      where: { companyId: this.companyId, provider, value: trimmed, contact: this.accessWhere("contact") },
      select: { contactId: true },
    });

    await this.prisma.contactIdentifier.deleteMany({
      where: { companyId: this.companyId, provider, value: trimmed, contact: this.accessWhere("contact") },
    });

    for (const { contactId } of removed)
      await getContactAvatarRepo().recomputeContactAvatar({ contactId, companyId: this.companyId });
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

  async findContactCoreByIdOrThrow(contactId: string) {
    return this.prisma.contact.findFirstOrThrow({
      where: { id: contactId, ...this.accessWhere("contact") },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  async updateContactEnrichment(args: RepoArgs<AssignContactToThreadContactRepo, "updateContactEnrichment">) {
    const { contactId } = args;

    if (args.firstName !== undefined || args.lastName !== undefined) {
      await this.prisma.contact.updateMany({
        where: { id: contactId, ...this.accessWhere("contact") },
        data: {
          firstName: args.firstName,
          lastName: args.lastName,
        },
      });
    }

    for (const u of args.identifierUpserts ?? []) {
      const isHandle = isHandleProvider(u.provider);
      const existing = await this.prisma.contactIdentifier.findFirst({
        where: {
          companyId: this.companyId,
          provider: u.provider,
          OR: [{ value: u.value }, { messagingId: u.value }],
        },
        select: { id: true, contactId: true, messagingId: true },
      });
      if (existing && existing.contactId !== contactId) continue;

      if (existing) {
        await this.prisma.contactIdentifier.updateMany({
          where: { id: existing.id, companyId: this.companyId },
          data: {
            contactId,
            messagingId: existing.messagingId ?? (isHandle ? u.value : undefined),
            displayName: u.displayName ?? null,
            pictureUrl: u.pictureUrl ?? null,
            profileUrl: u.profileUrl ?? null,
            headline: u.headline ?? null,
            occupation: u.occupation ?? null,
          },
        });
        continue;
      }

      await this.prisma.contactIdentifier.create({
        data: {
          companyId: this.companyId,
          contactId,
          provider: u.provider,
          value: u.value,
          messagingId: isHandle ? u.value : null,
          displayName: u.displayName ?? null,
          pictureUrl: u.pictureUrl ?? null,
          profileUrl: u.profileUrl ?? null,
          headline: u.headline ?? null,
          occupation: u.occupation ?? null,
        },
      });
    }

    if (args.identifierUpserts?.length)
      await getContactAvatarRepo().recomputeContactAvatar({ contactId, companyId: this.companyId });
  }
}
