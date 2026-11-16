import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";

import messages from "@/i18n/locales/en.json";
import { AccountConnectionDetails } from "../account-connection-details";

function render(connectionDetails: ConnectedAccountDto["connectionDetails"]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AccountConnectionDetails account={{ connectionDetails }} />
    </NextIntlClientProvider>,
  );
}

describe("connection details in Settings", () => {
  it("shows each product's state and the provider's reason without losing calendar connectivity", () => {
    const markup = render({
      status: "partial",
      products: { gmail: "disconnected", calendar: "running" },
      reason: "Mailbox unavailable <provider>",
    });
    expect(markup).toContain("Gmail");
    expect(markup).toContain("Not available");
    expect(markup).not.toContain("Reconnect needed");
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Connected");
    expect(markup).toContain("Mailbox unavailable &lt;provider&gt;");
  });

  it("asks for a reconnect only when the whole account is disconnected", () => {
    const markup = render({
      status: "disconnected",
      products: { gmail: "disconnected", calendar: "disconnected" },
      reason: null,
    });
    expect(markup).toContain("Reconnect needed");
    expect(markup).not.toContain("Not available");
    expect(markup).toContain("The provider did not return a reason.");
  });
});
