import type { Prisma } from "@/generated/prisma";

import type { ContactSeedData } from "./contacts";
import type { SeedContext } from "./context";
import { SYNTHETIC_SERVICE_DEAL_LINKS, type DealSeedData } from "./deals";
import { fixtureId, upsertFixturesById } from "./helpers";
import type { OrganizationSeedData } from "./organizations";
import type { ServiceSeedData } from "./services";
import { SYNTHETIC_ASSIGNED_TASK_INDEXES, type TaskSeedData } from "./tasks";

export type RelationshipSeedInput = ContactSeedData &
  DealSeedData &
  OrganizationSeedData &
  ServiceSeedData &
  TaskSeedData;

export async function seedRelationships(context: SeedContext, entities: RelationshipSeedInput): Promise<void> {
  const { prisma, ids } = context;
  const { contactDefinitions, contacts, dealDefinitions, deals, organizations, services, taskDefinitions, tasks } =
    entities;

  const contactIdentifiers = contacts.map(
    (contact, index) =>
      ({
        id: fixtureId("b0000000", index + 1),
        channelClass: "email",
        companyId: ids.company,
        contactId: contact.id,
        provider: "mail",
        value: contactDefinitions[index][2],
      }) satisfies Prisma.ContactIdentifierCreateManyInput,
  );
  await upsertFixturesById(contactIdentifiers, (identifier) =>
    prisma.contactIdentifier.upsert({
      where: { id: identifier.id },
      update: identifier,
      create: identifier,
    }),
  );

  const contactOrganizations = contacts.map(
    (contact, index) =>
      ({
        id: fixtureId("c0000000", index + 1),
        companyId: ids.company,
        contactId: contact.id,
        organizationId: organizations[contactDefinitions[index][3]].id,
      }) satisfies Prisma.ContactOrganizationCreateManyInput,
  );
  await upsertFixturesById(contactOrganizations, (contactOrganization) =>
    prisma.contactOrganization.upsert({
      where: { id: contactOrganization.id },
      update: contactOrganization,
      create: contactOrganization,
    }),
  );

  const contactUsers = contacts.map(
    (contact, index) =>
      ({
        id: fixtureId("d0000000", index + 1),
        companyId: ids.company,
        contactId: contact.id,
        userId: ids.user,
      }) satisfies Prisma.ContactUserCreateManyInput,
  );
  await upsertFixturesById(contactUsers, (contactUser) =>
    prisma.contactUser.upsert({
      where: { id: contactUser.id },
      update: contactUser,
      create: contactUser,
    }),
  );

  const organizationUsers = organizations.map(
    (organization, index) =>
      ({
        id: fixtureId("e0000000", index + 1),
        companyId: ids.company,
        organizationId: organization.id,
        userId: ids.user,
      }) satisfies Prisma.OrganizationUserCreateManyInput,
  );
  await upsertFixturesById(organizationUsers, (organizationUser) =>
    prisma.organizationUser.upsert({
      where: { id: organizationUser.id },
      update: organizationUser,
      create: organizationUser,
    }),
  );

  const dealOrganizations = deals.map(
    (deal, index) =>
      ({
        id: fixtureId("f0000000", index + 1),
        companyId: ids.company,
        dealId: deal.id,
        organizationId: organizations[dealDefinitions[index][1]].id,
      }) satisfies Prisma.DealOrganizationCreateManyInput,
  );
  await upsertFixturesById(dealOrganizations, (dealOrganization) =>
    prisma.dealOrganization.upsert({
      where: { id: dealOrganization.id },
      update: dealOrganization,
      create: dealOrganization,
    }),
  );

  const dealUsers = deals.map(
    (deal, index) =>
      ({
        id: fixtureId("11000000", index + 1),
        companyId: ids.company,
        dealId: deal.id,
        userId: ids.user,
      }) satisfies Prisma.DealUserCreateManyInput,
  );
  await upsertFixturesById(dealUsers, (dealUser) =>
    prisma.dealUser.upsert({
      where: { id: dealUser.id },
      update: dealUser,
      create: dealUser,
    }),
  );

  const serviceDeals = SYNTHETIC_SERVICE_DEAL_LINKS.map(
    ([dealIndex, serviceIndex, quantity], index) =>
      ({
        id: fixtureId("12000000", index + 1),
        companyId: ids.company,
        dealId: deals[dealIndex].id,
        quantity,
        serviceId: services[serviceIndex].id,
      }) satisfies Prisma.ServiceDealCreateManyInput,
  );
  await upsertFixturesById(serviceDeals, (serviceDeal) =>
    prisma.serviceDeal.upsert({
      where: { id: serviceDeal.id },
      update: serviceDeal,
      create: serviceDeal,
    }),
  );
  await prisma.serviceDeal.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "12000000-", notIn: serviceDeals.map(({ id }) => id) },
    },
  });

  const dealContacts = dealDefinitions.flatMap(([, , contactIndexes], dealIndex) =>
    contactIndexes.map(
      (contactIndex, relationIndex) =>
        ({
          id: fixtureId("19000000", dealIndex * 10 + relationIndex + 1),
          companyId: ids.company,
          contactId: contacts[contactIndex].id,
          dealId: deals[dealIndex].id,
        }) satisfies Prisma.DealContactCreateManyInput,
    ),
  );
  await upsertFixturesById(dealContacts, (dealContact) =>
    prisma.dealContact.upsert({
      where: { id: dealContact.id },
      update: dealContact,
      create: dealContact,
    }),
  );
  await prisma.dealContact.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "19000000-", notIn: dealContacts.map(({ id }) => id) },
    },
  });

  const serviceUsers = services.map(
    (service, index) =>
      ({
        id: fixtureId("13000000", index + 1),
        companyId: ids.company,
        serviceId: service.id,
        userId: ids.user,
      }) satisfies Prisma.ServiceUserCreateManyInput,
  );
  await upsertFixturesById(serviceUsers, (serviceUser) =>
    prisma.serviceUser.upsert({
      where: { id: serviceUser.id },
      update: serviceUser,
      create: serviceUser,
    }),
  );

  const assignedTaskIndexes = new Set<number>(SYNTHETIC_ASSIGNED_TASK_INDEXES);
  const taskUsers = tasks.flatMap((task, index) =>
    assignedTaskIndexes.has(index)
      ? [
          {
            id: fixtureId("14000000", index + 1),
            companyId: ids.company,
            taskId: task.id,
            userId: ids.user,
          } satisfies Prisma.TaskUserCreateManyInput,
        ]
      : [],
  );
  await upsertFixturesById(taskUsers, (taskUser) =>
    prisma.taskUser.upsert({
      where: { id: taskUser.id },
      update: taskUser,
      create: taskUser,
    }),
  );
  await prisma.taskUser.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "14000000-", notIn: taskUsers.map(({ id }) => id) },
    },
  });

  const taskContacts = taskDefinitions.flatMap(([, contactIndexes], taskIndex) =>
    contactIndexes.map(
      (contactIndex, relationIndex) =>
        ({
          id: fixtureId("1a000000", taskIndex * 10 + relationIndex + 1),
          companyId: ids.company,
          contactId: contacts[contactIndex].id,
          taskId: tasks[taskIndex].id,
        }) satisfies Prisma.TaskContactCreateManyInput,
    ),
  );
  await upsertFixturesById(taskContacts, (taskContact) =>
    prisma.taskContact.upsert({
      where: { id: taskContact.id },
      update: taskContact,
      create: taskContact,
    }),
  );
  await prisma.taskContact.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1a000000-", notIn: taskContacts.map(({ id }) => id) },
    },
  });

  const taskOrganizations = taskDefinitions.flatMap(([, , organizationIndexes], taskIndex) =>
    organizationIndexes.map(
      (organizationIndex, relationIndex) =>
        ({
          id: fixtureId("1b000000", taskIndex * 10 + relationIndex + 1),
          companyId: ids.company,
          organizationId: organizations[organizationIndex].id,
          taskId: tasks[taskIndex].id,
        }) satisfies Prisma.TaskOrganizationCreateManyInput,
    ),
  );
  await upsertFixturesById(taskOrganizations, (taskOrganization) =>
    prisma.taskOrganization.upsert({
      where: { id: taskOrganization.id },
      update: taskOrganization,
      create: taskOrganization,
    }),
  );
  await prisma.taskOrganization.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1b000000-", notIn: taskOrganizations.map(({ id }) => id) },
    },
  });

  const taskDeals = taskDefinitions.flatMap(([, , , dealIndexes], taskIndex) =>
    dealIndexes.map(
      (dealIndex, relationIndex) =>
        ({
          id: fixtureId("1c000000", taskIndex * 10 + relationIndex + 1),
          companyId: ids.company,
          dealId: deals[dealIndex].id,
          taskId: tasks[taskIndex].id,
        }) satisfies Prisma.TaskDealCreateManyInput,
    ),
  );
  await upsertFixturesById(taskDeals, (taskDeal) =>
    prisma.taskDeal.upsert({
      where: { id: taskDeal.id },
      update: taskDeal,
      create: taskDeal,
    }),
  );
  await prisma.taskDeal.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1c000000-", notIn: taskDeals.map(({ id }) => id) },
    },
  });

  const taskServices = taskDefinitions.flatMap(([, , , , serviceIndexes], taskIndex) =>
    serviceIndexes.map(
      (serviceIndex, relationIndex) =>
        ({
          id: fixtureId("1d000000", taskIndex * 10 + relationIndex + 1),
          companyId: ids.company,
          serviceId: services[serviceIndex].id,
          taskId: tasks[taskIndex].id,
        }) satisfies Prisma.TaskServiceCreateManyInput,
    ),
  );
  await upsertFixturesById(taskServices, (taskService) =>
    prisma.taskService.upsert({
      where: { id: taskService.id },
      update: taskService,
      create: taskService,
    }),
  );
  await prisma.taskService.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1d000000-", notIn: taskServices.map(({ id }) => id) },
    },
  });
}
