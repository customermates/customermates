import { describe, expect, it } from "vitest";

import { MESSAGING_SYSTEM_ACTOR, RECORD_SYSTEM_ACTOR } from "@/features/records/record-system-actor";

import { systemActorProcess } from "../system-actor-process";

describe("system actor process", () => {
  it.each([
    [MESSAGING_SYSTEM_ACTOR, "messaging"],
    [RECORD_SYSTEM_ACTOR, "trash"],
    ["system:synthetic-seed", "other"],
    [null, "other"],
  ])("names %s as %s", (actorId, process) => {
    expect(systemActorProcess(actorId)).toBe(process);
  });
});
