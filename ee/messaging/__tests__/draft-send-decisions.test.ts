import { describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";

import {
  DRAFT_SEND_STALE_AFTER_MS,
  decideDraftSend,
  decideMissingDraftSend,
  effectiveDraftSendState,
  providerSendOutcome,
  type DraftSendRecord,
  type DraftSendState,
} from "../draft-send";
import { draftBindingConflict, type DraftThreadTarget } from "../draft-thread";

const NOW = new Date("2026-10-16T10:00:00.000Z");
const REVISION = new Date("2026-10-16T09:59:00.000Z");
const OTHER_REVISION = new Date("2026-10-16T09:59:30.000Z");

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
    ["no earlier send", null, REVISION, "claim"],
    ["a running send of this revision", record("sending"), REVISION, "in_progress"],
    ["a running send of another revision", record("sending"), OTHER_REVISION, "in_progress"],
    ["an accepted send of this revision", record("sent"), REVISION, "replay"],
    ["an accepted send of another revision", record("sent"), OTHER_REVISION, "already_sent"],
    ["an unknown outcome of this revision", record("unknown"), REVISION, "outcome_unknown"],
    ["an unknown outcome of an older revision", record("unknown"), OTHER_REVISION, "take_over"],
    ["a send that never finished, same revision", record("sending", stale), REVISION, "outcome_unknown"],
    ["a send that never finished, newer revision", record("sending", stale), OTHER_REVISION, "take_over"],
  ] as const)("answers %s with %s", (_label, existing, revision, decision) => {
    expect(decideDraftSend(existing, revision, NOW)).toBe(decision);
  });
});

describe("decideMissingDraftSend", () => {
  it.each([
    ["a draft that was never sent", null, REVISION, "not_found"],
    ["a draft still being sent", record("sending"), REVISION, "in_progress"],
    ["a draft sent with this revision", record("sent"), REVISION, "replay"],
    ["a draft sent with another revision", record("sent"), OTHER_REVISION, "already_sent"],
    ["a draft whose send could not be confirmed", record("unknown"), REVISION, "outcome_unknown"],
    ["an unconfirmed send of another revision", record("unknown"), OTHER_REVISION, "not_found"],
  ] as const)("answers %s with %s", (_label, existing, revision, decision) => {
    expect(decideMissingDraftSend(existing, revision, NOW)).toBe(decision);
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
