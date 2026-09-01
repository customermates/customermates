import type { ContactSeedData } from "./contacts";
import type { SeedContext } from "./context";
import type { DealSeedData } from "./deals";
import type { OrganizationSeedData } from "./organizations";
import type { ServiceSeedData } from "./services";
import type { TaskSeedData } from "./tasks";

import { seedContacts } from "./contacts";
import { seedCustomFields } from "./custom-fields";
import { seedDeals } from "./deals";
import {
  seedHostedAiOperatorFixtures,
  seedHostedAiOperatorUserTableFixtures,
  seedLocalHostedAiOperatorAccess,
} from "./hosted-ai-operator";
import { seedIdentity } from "./identity";
import { seedAgentConversations } from "./agent-chat";
import { seedDemoMessagingFixtures } from "./messaging/seed";
import { seedSyntheticAuditLogs } from "./audit-logs";
import { seedOrganizations } from "./organizations";
import { seedPersonalization } from "./personalization";
import { seedRelationships } from "./relationships";
import { seedServices } from "./services";
import { seedTasks } from "./tasks";
import { seedWebhooks } from "./webhooks";
import { seedWidgets } from "./widgets";

export type SyntheticSeedData = OrganizationSeedData & ContactSeedData & DealSeedData & ServiceSeedData & TaskSeedData;

export async function runSyntheticSeed(
  context: SeedContext,
  options: { includeLocalOperatorAccess?: boolean } = {},
): Promise<SyntheticSeedData> {
  await seedIdentity(context);
  await seedHostedAiOperatorFixtures(context);
  if (options.includeLocalOperatorAccess) await seedLocalHostedAiOperatorAccess(context);
  await seedHostedAiOperatorUserTableFixtures(context, options);

  const organizationData = await seedOrganizations(context);
  const contactData = await seedContacts(context, organizationData.organizations);
  const serviceData = await seedServices(context);
  const dealData = await seedDeals(context, serviceData);
  const taskData = await seedTasks(context);
  const entities = {
    ...organizationData,
    ...contactData,
    ...dealData,
    ...serviceData,
    ...taskData,
  };

  const customFieldData = await seedCustomFields(context, entities);
  await seedWidgets(context, customFieldData);
  await seedPersonalization(context, customFieldData);
  await seedRelationships(context, entities);
  await seedWebhooks(context);
  await seedDemoMessagingFixtures(context.prisma, {
    companyId: context.ids.company,
    contactIds: contactData.contacts.map(({ id }) => id),
    seedUserEmail: context.seedUserEmail,
    userId: context.ids.user,
  });
  await seedSyntheticAuditLogs(context, entities);
  await seedAgentConversations(context);

  return entities;
}
