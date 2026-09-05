import type { ConnectedAccountDto, ConnectedAccountRecord } from "../messaging.schema";

import { resolveStoredEmailSettings } from "../email-settings";
import { renderSignature } from "../outbound/email-signature";

export function toConnectedAccountDto(account: ConnectedAccountRecord): ConnectedAccountDto {
  const { signatureFields, ...record } = account;
  const email = resolveStoredEmailSettings(record.signature, signatureFields);

  return {
    ...record,
    signature: record.isOwner || email.settings.signature.enabled ? email.markdown || null : null,
    emailSettings: email.settings,
    signatureHtml: renderSignature(email.markdown, email.settings)?.html ?? null,
  };
}
