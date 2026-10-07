import type { ConnectedAccountRecord } from "../messaging.schema";

export abstract class GetMyConnectedAccountsRepo {
  abstract listAccounts(): Promise<ConnectedAccountRecord[]>;
}
