import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting database seeding...");

  try {
    const companies = await import("./seeds/company.json");
    const apiKeys = await import("./seeds/apikey.json");
    const webhooks = await import("./seeds/webhook.json");
    const webhookDeliveries = await import("./seeds/webhookdelivery.json");
    const subscriptions = await import("./seeds/subscription.json");
    const contacts = await import("./seeds/contact.json");
    const deals = await import("./seeds/deal.json");
    const organizations = await import("./seeds/organization.json");
    const services = await import("./seeds/service.json");
    const users = await import("./seeds/user.json");
    const widgets = await import("./seeds/widget.json");
    const tasks = await import("./seeds/task.json");
    const customColumns = await import("./seeds/customcolumn.json");
    const customFieldValues = await import("./seeds/customfieldvalue.json");
    const dealContacts = await import("./seeds/dealcontact.json");
    const dealOrganizations = await import("./seeds/dealorganization.json");
    const dealUsers = await import("./seeds/dealuser.json");
    const inviteTokens = await import("./seeds/invitetoken.json");
    const organizationUsers = await import("./seeds/organizationuser.json");
    const serviceDeals = await import("./seeds/servicedeal.json");
    const serviceUsers = await import("./seeds/serviceuser.json");
    const contactUsers = await import("./seeds/contactuser.json");
    const contactOrganizations = await import("./seeds/contactorganization.json");
    const auditLogs = await import("./seeds/auditlog.json");
    const userRoles = await import("./seeds/userrole.json");
    const taskUsers = await import("./seeds/taskuser.json");
    const rolePermissions = await import("./seeds/rolepermission.json");
    const authAccounts = await import("./seeds/authaccount.json");
    const authUsers = await import("./seeds/authuser.json");
    const p13n = await import("./seeds/p13n.json");

    console.log("Inserting data...");

    if (companies.default?.length > 0) {
      await prisma.company.createMany({ data: companies.default as any });
      console.log("✅ Inserted companies");
    }
    if (webhooks.default?.length > 0) {
      await prisma.webhook.createMany({ data: webhooks.default as any });
      console.log("✅ Inserted webhooks");
    }

    if (webhookDeliveries.default?.length > 0) {
      await prisma.webhookDelivery.createMany({ data: webhookDeliveries.default as any });
      console.log("✅ Inserted webhook deliveries");
    }

    if (subscriptions.default?.length > 0) {
      await prisma.subscription.createMany({ data: subscriptions.default as any });
      console.log("✅ Inserted subscriptions");
    }

    if (userRoles.default?.length > 0) {
      await prisma.userRole.createMany({ data: userRoles.default as any });
      console.log("✅ Inserted user roles");
    }

    if (rolePermissions.default?.length > 0) {
      await prisma.rolePermission.createMany({ data: rolePermissions.default as any });
      console.log("✅ Inserted role permissions");
    }

    if (users.default?.length > 0) {
      await prisma.user.createMany({ data: users.default as any });
      console.log("✅ Inserted users");
    }

    if (organizations.default?.length > 0) {
      await prisma.organization.createMany({ data: organizations.default as any });
      console.log("✅ Inserted organizations");
    }

    if (contacts.default?.length > 0) {
      await prisma.contact.createMany({ data: contacts.default as any });
      console.log("✅ Inserted contacts");
    }

    if (deals.default?.length > 0) {
      await prisma.deal.createMany({ data: deals.default as any });
      console.log("✅ Inserted deals");
    }

    if (services.default?.length > 0) {
      await prisma.service.createMany({ data: services.default as any });
      console.log("✅ Inserted services");
    }

    if (customColumns.default?.length > 0) {
      await prisma.customColumn.createMany({ data: customColumns.default as any });
      console.log("✅ Inserted custom columns");
    }

    if (tasks.default?.length > 0) {
      await prisma.task.createMany({ data: tasks.default as any });
      console.log("✅ Inserted tasks");
    }

    if (customFieldValues.default?.length > 0) {
      await prisma.customFieldValue.createMany({ data: customFieldValues.default as any });
      console.log("✅ Inserted custom field values");
    }

    if (dealContacts.default?.length > 0) {
      await prisma.dealContact.createMany({ data: dealContacts.default as any });
      console.log("✅ Inserted deal contacts");
    }

    if (dealOrganizations.default?.length > 0) {
      await prisma.dealOrganization.createMany({ data: dealOrganizations.default as any });
      console.log("✅ Inserted deal organizations");
    }

    if (dealUsers.default?.length > 0) {
      await prisma.dealUser.createMany({ data: dealUsers.default as any });
      console.log("✅ Inserted deal users");
    }

    if (inviteTokens.default?.length > 0) {
      await prisma.inviteToken.createMany({ data: inviteTokens.default as any });
      console.log("✅ Inserted invite tokens");
    }

    if (organizationUsers.default?.length > 0) {
      await prisma.organizationUser.createMany({ data: organizationUsers.default as any });
      console.log("✅ Inserted organization users");
    }

    if (serviceDeals.default?.length > 0) {
      await prisma.serviceDeal.createMany({ data: serviceDeals.default as any });
      console.log("✅ Inserted service deals");
    }

    if (serviceUsers.default?.length > 0) {
      await prisma.serviceUser.createMany({ data: serviceUsers.default as any });
      console.log("✅ Inserted service users");
    }

    if (contactUsers.default?.length > 0) {
      await prisma.contactUser.createMany({ data: contactUsers.default as any });
      console.log("✅ Inserted contact users");
    }

    if (contactOrganizations.default?.length > 0) {
      await prisma.contactOrganization.createMany({ data: contactOrganizations.default as any });
      console.log("✅ Inserted contact organizations");
    }

    if (widgets.default?.length > 0) {
      await prisma.widget.createMany({ data: widgets.default as any });
      console.log("✅ Inserted widgets");
    }

    if (auditLogs.default?.length > 0) {
      await prisma.auditLog.createMany({ data: auditLogs.default as any });
      console.log("✅ Inserted audit logs");
    }

    if (authUsers.default?.length > 0) {
      await prisma.authUser.createMany({ data: authUsers.default as any });
      console.log("✅ Inserted auth users");
    }

    if (authAccounts.default?.length > 0) {
      await prisma.authAccount.createMany({ data: authAccounts.default as any });
      console.log("✅ Inserted auth accounts");
    }

    if (taskUsers.default?.length > 0) {
      await prisma.taskUser.createMany({ data: taskUsers.default as any });
      console.log("✅ Inserted task users");
    }

    if (p13n.default?.length > 0) {
      await prisma.p13n.createMany({ data: p13n.default as any });
      console.log("✅ Inserted p13n");
    }

    if (apiKeys.default?.length > 0) {
      await prisma.apikey.createMany({ data: apiKeys.default as any });
      console.log("✅ Inserted api keys");
    }

    console.log("🎉 Database seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
