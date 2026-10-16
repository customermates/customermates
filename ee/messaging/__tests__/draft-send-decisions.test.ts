import { describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";

import {
  DRAFT_SEND_COPY_EARLIEST_MS,
  DRAFT_SEND_COPY_LATEST_MS,
  DRAFT_SEND_STALE_AFTER_MS,
  canReconcileDraftSend,
  decideDraftSend,
  decideMissingDraftSend,
  draftSendClaimWindow,
  draftSendCopyWindow,
  effectiveDraftSendState,
  providerSendOutcome,
  type DraftSendRecord,
  type DraftSendState,
} from "../draft-send";
import { draftBindingConflict, type DraftThreadTarget } from "../draft-thread";

const NOW = new Date("2026-10-16T10:00:00.000Z");
const REVISION = new Date("2026-10-16T09:59:00.000Z");
const OTHER_REVISION = new Date("2026-10-16T09:59:30.000Z");
const CONTENT = "content-sent-first";
const OTHER_CONTENT = "content-edited-later";

function record(state: DraftSendState, overrides: Partial<DraftSendRecord> = {}): DraftSendRecord {
  return {
    id: "claim",
    draftMessageId: "draft",
    draftRevision: REVISION,
    connectedAccountId: "account",
    state,
    unipileMessageId: null,
    providerMessageId: null,
    sentMessageId: null,
    sentThreadId: null,
    contentHash: CONTENT,
    matchHashes: ["copy-hash"],
    claimedAt: REVISION,
    updatedAt: NOW,
    ...overrides,
  };
}

const stale = { updatedAt: new Date(NOW.getTime() - DRAFT_SEND_STALE_AFTER_MS - 1) };

describe("effectiveDraftSendState", () => {
  it("treats a send that is still running as sending", () => {
    expect(effectiveDraftSendState(record("sending"), NOW)).toBe("sending");
  });

  it("treats a send that never finished as unknown, so it is never retried automatically", () => {
    expect(effectiveDraftSendState(record("sending", stale), NOW)).toBe("unknown");
  });

  it("keeps settled states", () => {
    expect(effectiveDraftSendState(record("sent", stale), NOW)).toBe("sent");
    expect(effectiveDraftSendState(record("unknown"), NOW)).toBe("unknown");
  });
});

describe("decideDraftSend", () => {
  it.each([
    ["no earlier send", null, REVISION, CONTENT, "claim"],
    ["a running send of this revision", record("sending"), REVISION, CONTENT, "in_progress"],
    ["a running send of another revision", record("sending"), OTHER_REVISION, OTHER_CONTENT, "in_progress"],
    ["an accepted send of this revision and content", record("sent"), REVISION, CONTENT, "replay"],
    ["an accepted send of this revision with other content", record("sent"), REVISION, OTHER_CONTENT, "already_sent"],
    ["an accepted send of another revision", record("sent"), OTHER_REVISION, OTHER_CONTENT, "already_sent"],
    ["an unknown outcome of this revision", record("unknown"), REVISION, CONTENT, "outcome_unknown"],
    [
      "an unknown outcome of this revision with other content",
      record("unknown"),
      REVISION,
      OTHER_CONTENT,
      "outcome_unknown",
    ],
    [
      "an unknown outcome, then an edited newer revision",
      record("unknown"),
      OTHER_REVISION,
      OTHER_CONTENT,
      "take_over",
    ],
    [
      "an unknown outcome, then a newer revision with the same content",
      record("unknown"),
      OTHER_REVISION,
      CONTENT,
      "outcome_unknown",
    ],
    ["a send that never finished, same revision", record("sending", stale), REVISION, CONTENT, "outcome_unknown"],
    [
      "a send that never finished, edited newer revision",
      record("sending", stale),
      OTHER_REVISION,
      OTHER_CONTENT,
      "take_over",
    ],
    [
      "a send that never finished, newer revision with the same content",
      record("sending", stale),
      OTHER_REVISION,
      CONTENT,
      "outcome_unknown",
    ],
  ] as const)("answers %s with %s", (_label, existing, revision, content, decision) => {
    expect(decideDraftSend(existing, revision, content, NOW)).toBe(decision);
  });
});

describe("decideMissingDraftSend", () => {
  it.each([
    ["a draft that was never sent", null, REVISION, CONTENT, "not_found"],
    ["a draft still being sent", record("sending"), REVISION, CONTENT, "in_progress"],
    ["a draft sent with this revision and content", record("sent"), REVISION, CONTENT, "replay"],
    ["a draft sent with this revision but other content", record("sent"), REVISION, OTHER_CONTENT, "already_sent"],
    ["a draft sent with another revision", record("sent"), OTHER_REVISION, CONTENT, "already_sent"],
    ["a draft whose send could not be confirmed", record("unknown"), REVISION, CONTENT, "outcome_unknown"],
    ["an unconfirmed send of another revision", record("unknown"), OTHER_REVISION, OTHER_CONTENT, "not_found"],
  ] as const)("answers %s with %s", (_label, existing, revision, content, decision) => {
    expect(decideMissingDraftSend(existing, revision, content, NOW)).toBe(decision);
  });
});

describe("canReconcileDraftSend", () => {
  it("looks for a synced copy when the outcome is unknown or a send never finished", () => {
    expect(canReconcileDraftSend(record("unknown"), NOW)).toBe(true);
    expect(canReconcileDraftSend(record("sending", stale), NOW)).toBe(true);
  });

  it("looks for a synced copy of an accepted send that has no reference yet", () => {
    expect(canReconcileDraftSend(record("sent"), NOW)).toBe(true);
  });

  it("leaves running sends, referenced sends and claims without copy hashes alone", () => {
    expect(canReconcileDraftSend(record("sending"), NOW)).toBe(false);
    expect(canReconcileDraftSend(record("sent", { unipileMessageId: "email" }), NOW)).toBe(false);
    expect(canReconcileDraftSend(record("sent", { sentMessageId: "message" }), NOW)).toBe(false);
    expect(canReconcileDraftSend(record("sent", { providerMessageId: "<id@example.test>" }), NOW)).toBe(false);
    expect(canReconcileDraftSend(record("unknown", { matchHashes: [] }), NOW)).toBe(false);
  });
});

describe("synced copy windows", () => {
  it("accepts copies from shortly before the claim until an hour after it", () => {
    expect(draftSendCopyWindow(REVISION)).toEqual({
      earliest: new Date(REVISION.getTime() - DRAFT_SEND_COPY_EARLIEST_MS),
      latest: new Date(REVISION.getTime() + DRAFT_SEND_COPY_LATEST_MS),
    });
  });

  it("matches a copy only to claims made before the copy was stored", () => {
    const sentAt = new Date("2026-10-16T10:00:00.000Z");
    const storedSoon = new Date("2026-10-16T10:00:20.000Z");
    const storedLate = new Date("2026-10-16T11:00:00.000Z");

    expect(draftSendClaimWindow({ sentAt, createdAt: storedSoon })).toEqual({
      earliest: new Date(sentAt.getTime() - DRAFT_SEND_COPY_LATEST_MS),
      latest: storedSoon,
    });
    expect(draftSendClaimWindow({ sentAt, createdAt: storedLate }).latest).toEqual(
      new Date(sentAt.getTime() + DRAFT_SEND_COPY_EARLIEST_MS),
    );
  });
});

describe("providerSendOutcome", () => {
  it("counts an accepted send whose answer could not be read as accepted", () => {
    expect(providerSendOutcome(CustomErrorCode.unipileSendUnconfirmed)).toBe("accepted");
  });

  it("counts provider 5xx, proxy timeouts and our own timeout as unknown", () => {
    expect(providerSendOutcome(CustomErrorCode.unipileSendOutcomeUnknown)).toBe("unknown");
    expect(providerSendOutcome(CustomErrorCode.unipileRequestTimeout)).toBe("unknown");
  });

  it("counts a definitive refusal as rejected", () => {
    expect(providerSendOutcome(CustomErrorCode.unipileProviderRejected)).toBe("rejected");
  });
});

describe("draftBindingConflict for a new email", () => {
  const draft: DraftThreadTarget = {
    id: "draft",
    messagingThreadId: "thread",
    connectedAccountId: "account",
    unipileThreadId: "draft_00000000-0000-4000-8000-000000000001",
    recipientIdentifiers: [],
    ccIdentifiers: ["visible@example.com"],
    bccIdentifiers: ["hidden@example.com", "visible@example.com"],
    updatedAt: REVISION,
  };
  const send = (cc: string[], to: string[] = []) =>
    draftBindingConflict({
      provider: MessagingProvider.google,
      draft,
      connectedAccountId: "account",
      draftRevision: REVISION.toISOString(),
      replyThreadId: null,
      to,
      cc,
    });

  it("sends an unchanged draft that lists an address in both Cc and Bcc", () => {
    expect(send(["visible@example.com"])).toBeNull();
  });

  it("refuses to move a Bcc-only address into Cc or To", () => {
    expect(send(["visible@example.com", "Hidden@example.com"])).toBe("recipients");
    expect(send(["visible@example.com"], ["hidden@example.com"])).toBe("recipients");
  });
});
