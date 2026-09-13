import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import type * as IntlModule from "next-intl";
import { describe, expect, it, vi } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itLocale from "@/i18n/locales/it.json";

const context = vi.hoisted(() => ({ translator: (key: string) => key }));

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof IntlModule>()),
  useTranslations: () => context.translator,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: {} }),
}));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => vi.fn(),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (entity: string) => entity }),
}));
vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: () => null,
}));

import { AgentChatItemView } from "../agent-chat-items";

describe("Interrupted agent turn notice", () => {
  it.each([
    ["de", de],
    ["en", en],
    ["es", es],
    ["fr", fr],
    ["it", itLocale],
  ] as const)("renders a localized alert without a retry action in %s", (locale, messages) => {
    const translator = createTranslator({ locale, messages });
    context.translator = translator as unknown as (key: string) => string;
    const markup = renderToStaticMarkup(
      createElement(AgentChatItemView, {
        item: {
          kind: "turn_interrupted",
          id: "notice-1",
          messageId: "user-message-1",
        },
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-testid="agent-turn-interrupted"');
    expect(markup).not.toContain("AgentChat.ui.turnInterrupted");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain(messages.AgentChat.ui.retryTurn);
    expect(translator("AgentChat.ui.turnInterrupted")).toBe(messages.AgentChat.ui.turnInterrupted);
  });
});
