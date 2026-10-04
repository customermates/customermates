import type { ComponentType, ReactNode } from "react";
import type { AgentUsageView } from "@/ee/agent-chat/agent-usage.service";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatAllowanceSharePct } from "@/core/commercial/agent-credits";

const harness = vi.hoisted(() => ({ usage: null as AgentUsageView | null }));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}(${Object.entries(values)
          .map(([name, value]) => `${name}=${value}`)
          .join(",")})`
      : key,
}));
vi.mock("../agent-chat-store-context", () => ({
  useAgentChatStore: () => ({ usage: harness.usage }),
  useAgentChatUiTargets: () => ({ usageId: "agent-usage" }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatDayMonth: () => "15 Aug",
    formatAllowanceShare: (pct: number) => formatAllowanceSharePct(pct, "en"),
  }),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  PopoverTrigger: ({ children, ...props }: { children: ReactNode }) =>
    createElement("button", { "aria-label": (props as { "aria-label"?: string })["aria-label"] }, children),
  PopoverContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/modal/assistant-surface", () => ({ assistantSurfaceProps: () => ({}) }));

import { UsageRing } from "../usage-ring";

const usage: AgentUsageView = {
  hasAllowance: true,
  usedPct: 20.58,
  multiplier: 10,
  plan: "business",
  resetAt: new Date("2026-08-15T10:30:00.000Z"),
  recentTurnPct: 0.04,
  blockedReason: null,
};

beforeEach(() => {
  harness.usage = usage;
});

describe("UsageRing", () => {
  it("shows the monthly share, the plan multiple and the last request as percentages only", () => {
    const html = renderToStaticMarkup(createElement(UsageRing));

    expect(html).toContain("AgentChat.credits.usage(used=21%)");
    expect(html).toContain("AgentChat.credits.usedOfMonthly(used=21%,resetAt=15 Aug)");
    expect(html).toContain("AgentChat.credits.planWithMultiplier(plan=Subscription.planNames.business,multiplier=10)");
    expect(html).toContain("AgentChat.credits.recentTurn(used=&lt;0.1%)");
    expect(html).not.toMatch(/credits\.remaining|creditsLimit|credits remaining/);
  });

  it("uses one decimal for a small last request and omits the multiple for a contracted plan", () => {
    harness.usage = { ...usage, plan: "enterprise", multiplier: null, recentTurnPct: 0.375 };
    const html = renderToStaticMarkup(createElement(UsageRing));

    expect(html).toContain("AgentChat.credits.plan(plan=Subscription.planNames.enterprise)");
    expect(html).toContain("AgentChat.credits.recentTurn(used=0.4%)");
  });

  it("stays hidden without an allowance", () => {
    harness.usage = { ...usage, hasAllowance: false };
    expect(renderToStaticMarkup(createElement(UsageRing))).toBe("");
  });
});
