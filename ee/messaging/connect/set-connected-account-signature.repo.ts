import type { ConnectedAccountRecord } from "../messaging.schema";
import type { EmailSettings } from "../email-settings";

export abstract class SetConnectedAccountSignatureRepo {
  abstract setAccountSignatureOrThrow(args: {
    id: string;
    signature: string | null;
    settings: EmailSettings;
  }): Promise<ConnectedAccountRecord>;
}
