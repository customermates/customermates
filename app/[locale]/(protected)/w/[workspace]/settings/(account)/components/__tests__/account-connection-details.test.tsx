import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";

import messages from "@/i18n/locales/en.json";
import { AccountConnectionDetails } from "../account-connection-details";

describe("connection details in Settings", () => {
  it("shows each product's state and the provider's reason without losing calendar connectivity", () => {
    const account: Pick<ConnectedAccountDto, "connectionDetails"> = {
      connectionDetails: {
        status: "partial",
        products: { gmail: "disconnected", calendar: "running" },
        reason: "Mailbox unavailable <provider>",
      },
    };
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <AccountConnectionDetails account={account} />
      </NextIntlClientProvider>,
    );
    expect(markup).toContain("Gmail");
    expect(markup).toContain("Reconnect needed");
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Connected");
    expect(markup).toContain("Mailbox unavailable &lt;provider&gt;");
  });
});
