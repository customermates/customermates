import { describe, expect, it } from "vitest";

import { DomainEvent } from "../domain-events";
import { getEntityName } from "../entity-name.utils";

function accountEvent(overrides: Record<string, unknown>) {
  return {
    payload: {
      displayName: null,
      emailAddress: null,
      provider: "mail",
      ...overrides,
    },
  } as never;
}

describe("connected-account entity names", () => {
  it("prefers the account display name and email before provider fallback", () => {
    const translate = (key: string) => `translated:${key}`;

    expect(
      getEntityName(
        DomainEvent.CONNECTED_ACCOUNT_CREATED,
        accountEvent({ displayName: "Sales inbox", emailAddress: "sales@example.com" }),
        translate,
      ),
    ).toBe("Sales inbox");
    expect(
      getEntityName(
        DomainEvent.CONNECTED_ACCOUNT_CREATED,
        accountEvent({ emailAddress: "sales@example.com" }),
        translate,
      ),
    ).toBe("sales@example.com");
  });

  it("uses the translated provider in UI contexts and the raw enum in protocol contexts", () => {
    const event = accountEvent({});

    expect(getEntityName(DomainEvent.CONNECTED_ACCOUNT_CREATED, event, (key) => `translated:${key}`)).toBe(
      "translated:Common.providers.mail",
    );
    expect(getEntityName(DomainEvent.CONNECTED_ACCOUNT_CREATED, event)).toBe("mail");
  });
});
