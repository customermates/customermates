import { createHash } from "node:crypto";

const ID_DOMAIN = "customermates:hosted-agent:support-ticket:v1";

function appendLengthPrefixed(hash: ReturnType<typeof createHash>, value: string) {
  hash.update(`${Buffer.byteLength(value, "utf8")}:`);
  hash.update(value, "utf8");
}

export function deriveChatSupportTicketId(args: { turnRequestId: string; toolCallId: string }): string {
  const hash = createHash("sha256");
  appendLengthPrefixed(hash, ID_DOMAIN);
  appendLengthPrefixed(hash, args.turnRequestId);
  appendLengthPrefixed(hash, args.toolCallId);

  const bytes = Array.from(hash.digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
