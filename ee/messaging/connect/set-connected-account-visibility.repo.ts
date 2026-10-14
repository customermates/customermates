import type { ConnectedAccountRecord } from "../messaging.schema";

export abstract class SetConnectedAccountVisibilityRepo {
  abstract getAccountByIdOrThrow(id: string): Promise<ConnectedAccountRecord>;
  abstract setAccountSharedOrThrow(args: { id: string; shared: boolean }): Promise<ConnectedAccountRecord>;
}
