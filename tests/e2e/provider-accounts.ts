import { readRemovedAccounts } from "./local-email-provider.mjs";
import { localE2eEnvironment } from "./local-environment";

export function providerRemovals(accounts: Array<{ unipileAccountId: string }>): number[] {
  const removed = readRemovedAccounts(localE2eEnvironment().providerDirectory) as string[];
  return accounts.map((account) => removed.filter((id) => id === account.unipileAccountId).length);
}
