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
  await prisma.contactIdentifier.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "b0000000-" },
    },
  });
  await upsertFixturesById(contactIdentifiers, ({ id: _id, ...identifier }) =>
    prisma.contactIdentifier.upsert({
      where: {
        companyId_channelClass_value: {
          companyId: identifier.companyId,
          channelClass: identifier.channelClass,
          value: identifier.value,
        },
      },
      update: identifier,
      create: { id: _id, ...identifier },
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
  await prisma.contactOrganization.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "c0000000-" },
    },
  });
  await upsertFixturesById(contactOrganizations, ({ id: _id, ...contactOrganization }) =>
    prisma.contactOrganization.upsert({
      where: {
        contactId_organizationId: {
          contactId: contactOrganization.contactId,
          organizationId: contactOrganization.organizationId,
        },
      },
      update: contactOrganization,
      create: { id: _id, ...contactOrganization },
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
  await prisma.contactUser.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "d0000000-" },
    },
  });
  await upsertFixturesById(contactUsers, ({ id: _id, ...contactUser }) =>
    prisma.contactUser.upsert({
      where: { contactId_userId: { contactId: contactUser.contactId, userId: contactUser.userId } },
      update: contactUser,
      create: { id: _id, ...contactUser },
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
  await prisma.organizationUser.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "e0000000-" },
    },
  });
  await upsertFixturesById(organizationUsers, ({ id: _id, ...organizationUser }) =>
    prisma.organizationUser.upsert({
      where: {
        organizationId_userId: {
          organizationId: organizationUser.organizationId,
          userId: organizationUser.userId,
        },
      },
      update: organizationUser,
      create: { id: _id, ...organizationUser },
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
  await prisma.dealOrganization.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "f0000000-" },
    },
  });
  await upsertFixturesById(dealOrganizations, ({ id: _id, ...dealOrganization }) =>
    prisma.dealOrganization.upsert({
      where: {
        dealId_organizationId: {
          dealId: dealOrganization.dealId,
          organizationId: dealOrganization.organizationId,
        },
      },
      update: dealOrganization,
      create: { id: _id, ...dealOrganization },
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
  await prisma.dealUser.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "11000000-" },
    },
  });
  await upsertFixturesById(dealUsers, ({ id: _id, ...dealUser }) =>
    prisma.dealUser.upsert({
      where: { dealId_userId: { dealId: dealUser.dealId, userId: dealUser.userId } },
      update: dealUser,
      create: { id: _id, ...dealUser },
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
  await prisma.serviceDeal.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "12000000-" },
    },
  });
  await upsertFixturesById(serviceDeals, ({ id: _id, ...serviceDeal }) =>
    prisma.serviceDeal.upsert({
      where: { serviceId_dealId: { serviceId: serviceDeal.serviceId, dealId: serviceDeal.dealId } },
      update: serviceDeal,
      create: { id: _id, ...serviceDeal },
    }),
  );

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
  await prisma.dealContact.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "19000000-" },
    },
  });
  await upsertFixturesById(dealContacts, ({ id: _id, ...dealContact }) =>
    prisma.dealContact.upsert({
      where: { dealId_contactId: { dealId: dealContact.dealId, contactId: dealContact.contactId } },
      update: dealContact,
      create: { id: _id, ...dealContact },
    }),
  );

  const serviceUsers = services.map(
    (service, index) =>
      ({
        id: fixtureId("13000000", index + 1),
        companyId: ids.company,
        serviceId: service.id,
        userId: ids.user,
      }) satisfies Prisma.ServiceUserCreateManyInput,
  );
  await prisma.serviceUser.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "13000000-" },
    },
  });
  await upsertFixturesById(serviceUsers, ({ id: _id, ...serviceUser }) =>
    prisma.serviceUser.upsert({
      where: { serviceId_userId: { serviceId: serviceUser.serviceId, userId: serviceUser.userId } },
      update: serviceUser,
      create: { id: _id, ...serviceUser },
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
  await prisma.taskUser.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "14000000-" },
    },
  });
  await upsertFixturesById(taskUsers, ({ id: _id, ...taskUser }) =>
    prisma.taskUser.upsert({
      where: { taskId_userId: { taskId: taskUser.taskId, userId: taskUser.userId } },
      update: taskUser,
      create: { id: _id, ...taskUser },
    }),
  );

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
  await prisma.taskContact.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1a000000-" },
    },
  });
  await upsertFixturesById(taskContacts, ({ id: _id, ...taskContact }) =>
    prisma.taskContact.upsert({
      where: { taskId_contactId: { taskId: taskContact.taskId, contactId: taskContact.contactId } },
      update: taskContact,
      create: { id: _id, ...taskContact },
    }),
  );

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
  await prisma.taskOrganization.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1b000000-" },
    },
  });
  await upsertFixturesById(taskOrganizations, ({ id: _id, ...taskOrganization }) =>
    prisma.taskOrganization.upsert({
      where: {
        taskId_organizationId: {
          taskId: taskOrganization.taskId,
          organizationId: taskOrganization.organizationId,
        },
      },
      update: taskOrganization,
      create: { id: _id, ...taskOrganization },
    }),
  );

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
  await prisma.taskDeal.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1c000000-" },
    },
  });
  await upsertFixturesById(taskDeals, ({ id: _id, ...taskDeal }) =>
    prisma.taskDeal.upsert({
      where: { taskId_dealId: { taskId: taskDeal.taskId, dealId: taskDeal.dealId } },
      update: taskDeal,
      create: { id: _id, ...taskDeal },
    }),
  );

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
  await prisma.taskService.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "1d000000-" },
    },
  });
  await upsertFixturesById(taskServices, ({ id: _id, ...taskService }) =>
    prisma.taskService.upsert({
      where: { taskId_serviceId: { taskId: taskService.taskId, serviceId: taskService.serviceId } },
      update: taskService,
      create: { id: _id, ...taskService },
    }),
  );
}
