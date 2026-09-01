import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

import { env } from "@/env";
import { htmlToPlainText } from "@/ee/messaging/email-body-text";
import { EMAIL_PROVIDERS } from "@/ee/messaging/provider";

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

  let cursor: string | undefined;
  let scanned = 0;
  let derived = 0;
  let blank = 0;

  try {
    for (;;) {
      const rows = await prisma.messagingMessage.findMany({
        where: { bodyText: null, bodyHtml: { not: null }, provider: { in: [...EMAIL_PROVIDERS] } },
        select: { id: true, bodyHtml: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;

      cursor = rows[rows.length - 1].id;
      scanned += rows.length;

      const updates = rows
        .map((row) => ({ id: row.id, bodyText: htmlToPlainText(row.bodyHtml) }))
        .filter((row): row is { id: string; bodyText: string } => row.bodyText !== null);

      blank += rows.length - updates.length;
      derived += updates.length;

      if (apply && updates.length > 0) {
        await prisma.$transaction(
          updates.map((row) => prisma.messagingMessage.update({ where: { id: row.id }, data: { bodyText: row.bodyText } })),
        );
      }

      console.log(`scanned ${scanned} | derived ${derived} | no readable text ${blank}`);
    }

    console.log(
      apply
        ? `Done. Updated ${derived} messages; ${blank} had no readable text and were left null.`
        : `Dry run. Would update ${derived} messages; ${blank} have no readable text. Re-run with --apply.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
