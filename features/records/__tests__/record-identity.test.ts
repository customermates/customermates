import { describe, expect, it } from "vitest";
import {
  identityKeys,
  normalizedIdentity,
  updatedIdentities,
  identityAssociations,
  normalizedIdentityAssociation,
} from "../record-identity";
import { RecordIdentityInputsSchema } from "../record-identity.schema";

describe("record identity channels", () => {
  it.each([
    ["mail", " Person@Example.test ", "person@example.test"],
    ["outlook", "Person@Example.test", "person@example.test"],
    ["whatsapp", "+49 (151) 12345678", "+4915112345678"],
    ["linkedin", "https://www.linkedin.com/in/person/", "person"],
    ["telegram", "@person", "person"],
    ["instagram", "https://instagram.com/person", "person"],
  ] as const)("preserves %s normalization", (provider, value, expected) => {
    expect(normalizedIdentity({ provider, value })?.value).toBe(expected);
  });

  it("rejects invalid channels and discards redundant IDs only for deterministic providers", () => {
    expect(normalizedIdentity({ provider: "mail", value: "invalid" })).toBeNull();
    expect(normalizedIdentity({ provider: "whatsapp", value: "123" })).toBeNull();
    expect(normalizedIdentity({ provider: "linkedin", value: "invalid handle" })).toBeNull();
    expect(
      normalizedIdentity({
        provider: "mail",
        value: "person@example.test",
        messagingId: "discard",
      })?.messagingId,
    ).toBeNull();
    expect(
      normalizedIdentity({
        provider: "linkedin",
        value: "person",
        messagingId: "urn:123",
      })?.messagingId,
    ).toBe("urn:123");
    expect(identityKeys({ value: "person", messagingId: "person" })).toEqual(["person"]);
  });

  it("preserves identity IDs and timestamps across unchanged saves and email-provider changes", () => {
    const initial = updatedIdentities([], [{ provider: "google", value: "person@example.test" }]);
    const previous = initial.map((row) => ({
      ...row,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T00:00:00.000Z",
    }));
    expect(updatedIdentities(previous, [{ provider: "google", value: "person@example.test" }])).toEqual(previous);
    const changed = updatedIdentities(previous, [{ provider: "outlook", value: "person@example.test" }]);
    expect(changed[0]).toMatchObject({
      id: previous[0]?.id,
      createdAt: previous[0]?.createdAt,
      provider: "outlook",
    });
    expect(changed[0]?.updatedAt).not.toBe(previous[0]?.updatedAt);
  });

  it("bounds channel payloads and rejects executable profile URLs", () => {
    expect(
      RecordIdentityInputsSchema.safeParse([
        {
          provider: "mail",
          value: "person@example.test",
          profileUrl: "javascript:alert(1)",
        },
      ]).success,
    ).toBe(false);
    expect(
      RecordIdentityInputsSchema.safeParse([{ provider: "mail", value: "person@example.test", extra: true }]).success,
    ).toBe(false);
    expect(
      RecordIdentityInputsSchema.safeParse(
        Array.from({ length: 101 }, () => ({
          provider: "mail",
          value: "person@example.test",
        })),
      ).success,
    ).toBe(false);
  });
});

describe("shared identity associations", () => {
  it("reuses channel IDs and metadata without rewriting another record's shared identity", () => {
    const known = updatedIdentities(
      [],
      [
        {
          provider: "google",
          value: "alice@example.test",
          displayName: "Alice",
        },
      ],
    );
    expect(
      identityAssociations(
        [
          {
            provider: "outlook",
            value: "alice@example.test",
            displayName: "Overwrite",
            messagingId: "untrusted",
          },
        ],
        known,
      ),
    ).toEqual(known);
  });

  it("deduplicates aliases and provider equivalents on the same record", () => {
    const known = updatedIdentities([], [{ provider: "linkedin", value: "alice", messagingId: "urn:123" }]);
    expect(
      identityAssociations(
        [
          { provider: "linkedin", value: "alice" },
          { provider: "linkedin", value: "urn:123" },
        ],
        known,
      ),
    ).toEqual(known);
    expect(
      identityAssociations(
        [
          { provider: "google", value: "alice@example.test" },
          { provider: "outlook", value: "alice@example.test" },
        ],
        [],
      ),
    ).toHaveLength(1);
  });

  it("rejects an alias bundle joining two distinct registered identities", () => {
    const known = updatedIdentities(
      [],
      [
        { provider: "linkedin", value: "alice", messagingId: "urn:alice" },
        { provider: "linkedin", value: "bob", messagingId: "urn:bob" },
      ],
    );
    expect(() =>
      identityAssociations([{ provider: "linkedin", value: "alice", messagingId: "urn:bob" }], known),
    ).toThrow();
  });

  it("retains older provider aliases as valid exact matches", () => {
    const known = updatedIdentities([], [{ provider: "linkedin", value: "alice", messagingId: "urn:new" }]).map(
      (row) => ({ ...row, aliases: ["alice", "urn:new", "urn:old"] }),
    );
    expect(identityAssociations([{ provider: "linkedin", value: "urn:old" }], known)).toEqual(known);
  });
});

describe("registered opaque channel aliases", () => {
  it("allows known provider IDs to reuse a channel while rejecting unregistered malformed values", () => {
    const known = updatedIdentities([], [{ provider: "linkedin", value: "alice", messagingId: "urn:alice" }]);
    expect(normalizedIdentity({ provider: "linkedin", value: "urn:alice" })).toBeNull();
    expect(
      normalizedIdentityAssociation({ provider: "linkedin", value: "urn:alice", displayName: "Overwrite" }, known),
    ).toEqual({
      provider: "linkedin",
      value: "alice",
      messagingId: "urn:alice",
      displayName: null,
      profileUrl: null,
    });
    expect(normalizedIdentityAssociation({ provider: "linkedin", value: "urn:missing" }, known)).toBeNull();
    expect(normalizedIdentityAssociation({ provider: "linkedin", value: "invalid handle" }, known)).toBeNull();
  });
});
