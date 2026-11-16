import { describe, expect, it } from "vitest";

import { orderedEmailChannels } from "../channel-suggestions";

const MICROSOFT_ADDRESSES = [
  "hotmail.co.uk",
  "hotmail.com",
  "hotmail.de",
  "hotmail.fr",
  "hotmail.it",
  "live.com",
  "live.de",
  "msn.com",
  "outlook.com",
  "outlook.de",
  "outlook.fr",
].map((domain) => `jane@${domain}`);

describe("orderedEmailChannels", () => {
  it.each(MICROSOFT_ADDRESSES)("puts Outlook first for %s", (email) => {
    expect(orderedEmailChannels(email)).toEqual(["outlook", "google", "imap"]);
  });

  it("puts Google first for other free-mail and business addresses and for an invalid one", () => {
    for (const email of ["jane@gmail.com", "jane@gmx.de", "jane@acme.example", "jane@", "not an address"])
      expect(orderedEmailChannels(email)).toEqual(["google", "outlook", "imap"]);
  });

  it("reads the domain case-insensitively", () => {
    expect(orderedEmailChannels("Jane@Outlook.COM")).toEqual(["outlook", "google", "imap"]);
  });
});
