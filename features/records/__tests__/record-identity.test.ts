import { describe, expect, it } from "vitest";
import {
  identityKeys,
  normalizedIdentity,
  updatedIdentities,
  identityAssociations,
  normalizedIdentityAssociation,
  linkedinProfileKey,
} from "../record-identity";
import { RecordIdentityInputsSchema } from "../record-identity.schema";

describe("record identity channels", () => {
  it.each([
    ["mail", " Person@Example.test ", "person@example.test"],
    ["outlook", "Person@Example.test", "person@example.test"],
    ["whatsapp", "+49 (151) 12345678", "+4915112345678"],
    ["phone", "+49 (0) 621 123456", "+49621123456"],
    ["phone", "0049 621 123456", "+49621123456"],
    ["linkedin", "https://www.linkedin.com/in/person/", "person"],
    ["telegram", "@person", "person"],
    ["instagram", "https://instagram.com/person", "person"],
  ] as const)("preserves %s normalization", (provider, value, expected) => {
    expect(normalizedIdentity({ provider, value })?.value).toBe(expected);
  });

  it("normalises typed phone numbers with an explicit region and keeps one identity per number", () => {
    expect(normalizedIdentity({ provider: "phone", value: "0621 123456" }, "de")?.value).toBe("+49621123456");
    expect(normalizedIdentity({ provider: "phone", value: "0621 123456" })).toBeNull();
    expect(normalizedIdentity({ provider: "phone", value: "+49 621 123456 ext. 7" }, "de")).toBeNull();
    expect(normalizedIdentity({ provider: "phone", value: "+49621123456", messagingId: "x" })?.messagingId).toBeNull();
    const whatsapp = updatedIdentities([], [{ provider: "whatsapp", value: "+49621123456" }]);
    expect(identityAssociations([{ provider: "phone", value: "+49621123456" }], whatsapp)).toEqual(whatsapp);
    const phone = updatedIdentities([], [{ provider: "phone", value: "+49621123456" }]);
    expect(identityAssociations([{ provider: "whatsapp", value: "+49621123456" }], phone)).toEqual(phone);
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

describe("LinkedIn member id and username as one profile", () => {
  const member = "ACoAAB8eNoQBhr8Ek4Y-7zwwnasJF849Xk3zums";
  const url = "https://www.linkedin.com/in/francesca-pollard-004a12126/";

  it("derives one canonical key from a username, a profile URL and a percent-encoded URL", () => {
    expect(linkedinProfileKey("Francesca-Pollard-004a12126")).toBe("francesca-pollard-004a12126");
    expect(linkedinProfileKey(url)).toBe("francesca-pollard-004a12126");
    expect(linkedinProfileKey("https://www.linkedin.com/in/j%C3%B6rg-n%C3%BCckel")).toBe("jörg-nückel");
    expect(linkedinProfileKey(member)).toBe(member);
    expect(linkedinProfileKey("https://www.linkedin.com/company/acme")).toBeNull();
    expect(linkedinProfileKey(null)).toBeNull();
  });

  it("keys a synced member-id identity by its profile username as well", () => {
    expect(
      identityKeys({
        provider: "linkedin",
        value: member,
        messagingId: member,
        profileUrl: url,
      }),
    ).toEqual([member, "francesca-pollard-004a12126"]);
    expect(
      identityKeys({
        provider: "telegram",
        value: "Person",
        messagingId: null,
      }),
    ).toEqual(["Person"]);
  });

  it("resolves an imported username to the identity the message sync created", () => {
    const synced = identityAssociations(
      [
        {
          provider: "linkedin",
          value: member,
          messagingId: member,
          profileUrl: url,
        },
      ],
      [],
    );
    expect(synced).toHaveLength(1);
    expect(synced[0]?.aliases).toEqual([member, "francesca-pollard-004a12126"]);
    const imported = identityAssociations([{ provider: "linkedin", value: "francesca-pollard-004a12126" }], synced);
    expect(imported.map((row) => row.id)).toEqual(synced.map((row) => row.id));
  });

  it("teaches a username identity the member id and profile once a synced alias arrives", () => {
    const known = identityAssociations([{ provider: "linkedin", value: "Francesca-Pollard-004a12126" }], []);
    const [merged] = identityAssociations(
      [
        {
          provider: "linkedin",
          value: member,
          messagingId: member,
          profileUrl: url,
          displayName: "Other",
        },
      ],
      known,
    );
    expect(merged).toMatchObject({
      id: known[0]?.id,
      value: "Francesca-Pollard-004a12126",
      messagingId: member,
      profileUrl: url,
      displayName: null,
    });
    expect(merged?.aliases).toEqual(expect.arrayContaining([member, "francesca-pollard-004a12126"]));
  });

  it("keeps saving a record that still holds two identities of one profile without a conflict", () => {
    const [synced, slug] = updatedIdentities(
      [],
      [
        {
          provider: "linkedin",
          value: member,
          messagingId: member,
          profileUrl: url,
        },
        {
          provider: "linkedin",
          value: "francesca-pollard-004a12126",
          profileUrl: url,
        },
      ],
    );
    if (!synced || !slug) throw new Error("Two identities expected");
    const known = [
      { ...synced, aliases: [member] },
      { ...slug, aliases: ["francesca-pollard-004a12126"] },
    ];
    const saved = identityAssociations(
      [
        {
          provider: "linkedin",
          value: member,
          messagingId: member,
          profileUrl: url,
        },
        {
          provider: "linkedin",
          value: "francesca-pollard-004a12126",
          profileUrl: url,
        },
      ],
      known,
    );
    expect(saved.map((row) => row.id)).toEqual(known.map((row) => row.id));
    expect(saved[0]?.aliases).toEqual([member]);
  });

  it("collapses a member id and username of one profile entered together into one channel", () => {
    const rows = identityAssociations(
      [
        {
          provider: "linkedin",
          value: member,
          messagingId: member,
          profileUrl: url,
        },
        { provider: "linkedin", value: "francesca-pollard-004a12126" },
      ],
      [],
    );
    expect(rows).toHaveLength(1);
  });

  it("keeps different usernames of one person apart without proof they are one profile", () => {
    const rows = identityAssociations(
      [
        { provider: "linkedin", value: "glory-yakubu" },
        {
          provider: "linkedin",
          value: "glory-yakubu-5478b522a",
          messagingId: "ACoAADlxH8cBnL3qsKZe4P1xYOCZS1Ft0cuZ4Ts",
        },
      ],
      [],
    );
    expect(rows).toHaveLength(2);
  });
});
