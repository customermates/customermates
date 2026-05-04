import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Status } from "@/generated/prisma";

function toHumanDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toHumanDateTime(date: Date | null): string {
  if (!date) return "Never";
  return date.toLocaleString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function trialLabel(trialEndDate: Date | null, status: string): string {
  if (status !== "trial") return status;
  if (!trialEndDate) return "trial (no end date)";

  const now = Date.now();
  const diffMs = trialEndDate.getTime() - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `trial · ${diffDays}d left (ends ${toHumanDate(trialEndDate)})`;
  if (diffDays === 0) return `trial · expires today`;
  return `trial expired ${Math.abs(diffDays)}d ago`;
}

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
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
          users: { some: { status: { not: Status.inactive } } },
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          subscription: {
            select: {
              status: true,
              trialEndDate: true,
              currentPeriodEnd: true,
            },
          },
          users: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              lastActiveAt: true,
              createdAt: true,
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

    const sep = "─".repeat(60);

    console.log(`\nGenerated: ${toHumanDateTime(new Date())}`);
    console.log(`Active users (last 24h): ${activeUsersLast24Hours}`);
    console.log(`Companies: ${companies.length}\n`);

    for (const company of companies) {
      const sub = company.subscription;
      const status = sub?.status ?? "no subscription";
      const label = sub ? trialLabel(sub.trialEndDate, status) : status;

      console.log(sep);
      console.log(`  ${company.name ?? "Unnamed company"}  [${label}]`);
      console.log(`  Signed up: ${toHumanDate(company.createdAt)}`);
      if (sub?.currentPeriodEnd && status !== "trial")
        console.log(`  Current period ends: ${toHumanDate(sub.currentPeriodEnd)}`);

      const c = company._count;
      console.log(
        `  Data: ${c.users} users · ${c.contacts} contacts · ` +
          `${c.organizations} orgs · ${c.deals} deals · ` +
          `${c.services} services · ${c.tasks} tasks`,
      );

      if (company.users.length > 0) {
        console.log();
        for (const user of company.users) {
          const name = pad(`${user.firstName} ${user.lastName}`, 24);
          const email = pad(`<${user.email}>`, 36);
          const activity = toHumanDateTime(user.lastActiveAt);
          console.log(`  ${name} ${email} Last active: ${activity}`);
        }
      }

      console.log();
    }

    if (companies.length === 0) console.log("No active companies found.");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
