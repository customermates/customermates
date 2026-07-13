import "dotenv/config";

import { MessagingService } from "@/ee/messaging/messaging.service";

async function main() {
  if (process.env.VERCEL_ENV !== "preview") {
    console.log("preview-wipe-unipile: not a preview environment, skipping");
    return;
  }
  if (!process.env.UNIPILE_API_KEY) {
    console.log("preview-wipe-unipile: no UNIPILE_API_KEY configured, skipping");
    return;
  }

  const messagingService = new MessagingService();
  let deleted = 0;

  for (let pass = 0; pass < 5; pass++) {
    const accounts = await messagingService.listAccounts();
    if (accounts.length === 0) break;

    for (const account of accounts) await messagingService.deleteAccount({ accountId: account.id });
    deleted += accounts.length;
  }

  console.log(`preview-wipe-unipile: deleted ${deleted} pre-existing Unipile accounts`);
}

main().catch((err) => {
  console.error("preview-wipe-unipile: failed, continuing build", err);
});
