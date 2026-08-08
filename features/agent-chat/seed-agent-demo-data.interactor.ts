import type { Validated } from "@/core/validation/validation.utils";
import type { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import type { CreateManyOrganizationsInteractor } from "@/features/organizations/upsert/create-many-organizations.interactor";
import type { CreateManyDealsInteractor } from "@/features/deals/upsert/create-many-deals.interactor";
import type { CreateManyServicesInteractor } from "@/features/services/upsert/create-many-services.interactor";
import type { CreateManyTasksInteractor } from "@/features/tasks/upsert/create-many-tasks.interactor";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export type SeedAgentDemoDataResult = { created: boolean; recordCount: number };

async function dataOrThrow<T>(resultPromise: Validated<T>): Promise<T> {
  const result = await resultPromise;
  if (!result.ok) throw result.error;
  return result.data;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.create },
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.contacts, action: Action.create },
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.services, action: Action.create },
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.deals, action: Action.create },
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.tasks, action: Action.create },
    { resource: Resource.tasks, action: Action.readAll },
  ],
  condition: "AND",
})
export class SeedAgentDemoDataInteractor extends AuthenticatedInteractor<void, SeedAgentDemoDataResult> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private createOrganizations: CreateManyOrganizationsInteractor,
    private createContacts: CreateManyContactsInteractor,
    private createServices: CreateManyServicesInteractor,
    private createDeals: CreateManyDealsInteractor,
    private createTasks: CreateManyTasksInteractor,
  ) {
    super();
  }

  @Transaction(BULK_WRITE_TRANSACTION)
  async invoke(): Validated<SeedAgentDemoDataResult> {
    const signals = await this.repo.getWorkspaceSetupSignals();
    if (signals.contacts || signals.organizations || signals.deals || signals.services || signals.tasks)
      return { ok: true, data: { created: false, recordCount: 0 } };

    const userId = getTenantUser().id;
    const organizations = await dataOrThrow(
      this.createOrganizations.invoke({
        organizations: [
          {
            name: "Northlight Labs",
            contactIds: [],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            name: "Harbor and Line",
            contactIds: [],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            name: "Kestrel Studio",
            contactIds: [],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
        ],
      }),
    );
    const [northlight, harbor, kestrel] = organizations;
    if (!northlight || !harbor || !kestrel) throw new Error("Example organizations could not be created.");

    const contacts = await dataOrThrow(
      this.createContacts.invoke({
        contacts: [
          {
            firstName: "Alex",
            lastName: "Morgan",
            identifiers: [{ provider: "mail", value: "alex.morgan@example.com" }],
            organizationIds: [northlight.id],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            firstName: "Priya",
            lastName: "Shah",
            identifiers: [{ provider: "mail", value: "priya.shah@example.com" }],
            organizationIds: [northlight.id],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            firstName: "Marius",
            lastName: "Cole",
            identifiers: [{ provider: "mail", value: "marius.cole@example.com" }],
            organizationIds: [harbor.id],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            firstName: "Elena",
            lastName: "Rossi",
            identifiers: [{ provider: "mail", value: "elena.rossi@example.com" }],
            organizationIds: [harbor.id],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            firstName: "Linnea",
            lastName: "Berg",
            identifiers: [{ provider: "mail", value: "linnea.berg@example.com" }],
            organizationIds: [kestrel.id],
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
        ],
      }),
    );
    const [alex, priya, marius, elena, linnea] = contacts;
    if (!alex || !priya || !marius || !elena || !linnea) throw new Error("Example contacts could not be created.");

    const services = await dataOrThrow(
      this.createServices.invoke({
        services: [
          {
            name: "Discovery workshop",
            amount: 1200,
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            name: "Implementation sprint",
            amount: 6400,
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
          {
            name: "Success retainer",
            amount: 2400,
            userIds: [userId],
            dealIds: [],
            taskIds: [],
            customFieldValues: [],
          },
        ],
      }),
    );
    const [discovery, implementation, retainer] = services;
    if (!discovery || !implementation || !retainer) throw new Error("Example services could not be created.");

    const deals = await dataOrThrow(
      this.createDeals.invoke({
        deals: [
          {
            name: "Northlight pilot",
            organizationIds: [northlight.id],
            contactIds: [alex.id, priya.id],
            services: [{ serviceId: discovery.id, quantity: 2 }],
            userIds: [userId],
            taskIds: [],
            customFieldValues: [],
          },
          {
            name: "Harbor rollout",
            organizationIds: [harbor.id],
            contactIds: [marius.id, elena.id],
            services: [{ serviceId: implementation.id, quantity: 1 }],
            userIds: [userId],
            taskIds: [],
            customFieldValues: [],
          },
          {
            name: "Kestrel renewal",
            organizationIds: [kestrel.id],
            contactIds: [linnea.id],
            services: [{ serviceId: retainer.id, quantity: 6 }],
            userIds: [userId],
            taskIds: [],
            customFieldValues: [],
          },
        ],
      }),
    );
    const [pilot, rollout, renewal] = deals;
    if (!pilot || !rollout || !renewal) throw new Error("Example deals could not be created.");

    const tasks = await dataOrThrow(
      this.createTasks.invoke({
        tasks: [
          {
            name: "Prepare discovery agenda",
            contactIds: [alex.id, priya.id],
            organizationIds: [northlight.id],
            dealIds: [pilot.id],
            serviceIds: [discovery.id],
            userIds: [userId],
            customFieldValues: [],
          },
          {
            name: "Send rollout proposal",
            contactIds: [marius.id, elena.id],
            organizationIds: [harbor.id],
            dealIds: [rollout.id],
            serviceIds: [implementation.id],
            userIds: [userId],
            customFieldValues: [],
          },
          {
            name: "Schedule renewal review",
            contactIds: [linnea.id],
            organizationIds: [kestrel.id],
            dealIds: [renewal.id],
            serviceIds: [retainer.id],
            userIds: [userId],
            customFieldValues: [],
          },
          {
            name: "Review next steps",
            contactIds: [],
            organizationIds: [],
            dealIds: [pilot.id, rollout.id, renewal.id],
            serviceIds: [],
            userIds: [userId],
            customFieldValues: [],
          },
        ],
      }),
    );

    return {
      ok: true,
      data: {
        created: true,
        recordCount: organizations.length + contacts.length + services.length + deals.length + tasks.length,
      },
    };
  }
}
