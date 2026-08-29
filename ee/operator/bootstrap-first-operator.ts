import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { prisma } from "@/prisma/db";

import { PrismaOperatorBootstrapService } from "./operator-bootstrap.service";

if (!stdin.isTTY || !stdout.isTTY) throw new Error("First-operator bootstrap requires an interactive terminal.");

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const email = await prompt.question("Verified account email to grant first-operator access: ");
  const confirmationEmail = await prompt.question("Type the same email again to confirm: ");
  const result = await new PrismaOperatorBootstrapService().bootstrapFirstOperatorUnscoped({
    email,
    confirmationEmail,
  });
  stdout.write(`Granted first-operator access to ${result.email}. Audit operation: ${result.auditOperationId}\n`);
} finally {
  prompt.close();
  await prisma.$disconnect();
}
