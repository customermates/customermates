import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Status } from "@/generated/prisma";

function toHumanDateTime(date: Date | null): string {
  if (!date) return "No activity";

  const formatter = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find((item) => item.type === "day")?.value ?? "";
  const month = parts.find((item) => item.type === "month")?.value ?? "";
  const year = parts.find((item) => item.type === "year")?.value ?? "";
  const hour = parts.find((item) => item.type === "hour")?.value ?? "";
  const minute = parts.find((item) => item.type === "minute")?.value ?? "";

  return `${day}. ${month} ${year}, ${hour}:${minute}`;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
  });

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeUsersLast24Hours, companies] = await Promise.all([
      prisma.user.count({
        where: {
          lastActiveAt: { gte: since },
          status: { not: Status.inactive },
        },
      }),
      prisma.company.findMany({
        where: {
          users: {
            some: {
              status: {
                not: Status.inactive,
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          subscription: {
            select: {
              status: true,
            },
          },
          users: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              lastActiveAt: true,
            },
            orderBy: [{ lastActiveAt: "desc" }, { email: "asc" }],
          },
          _count: {
            select: {
              users: true,
              contacts: true,
              organizations: true,
              deals: true,
              services: true,
              tasks: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const summary = {
      generatedAt: new Date().toISOString(),
      activeUsersLast24Hours,
      companies: companies.map((company) => ({
        companyId: company.id,
        companyName: company.name ?? "Unnamed company",
        subscriptionStatus: company.subscription?.status ?? null,
        entityCounts: {
          users: company._count.users,
          contacts: company._count.contacts,
          organizations: company._count.organizations,
          deals: company._count.deals,
          services: company._count.services,
          tasks: company._count.tasks,
        },
        users: company.users.map((user) => ({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          lastActivity: toHumanDateTime(user.lastActiveAt),
        })),
      })),
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
