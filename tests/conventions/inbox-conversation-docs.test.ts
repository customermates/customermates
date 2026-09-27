import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const SECTION_ANCHOR = "how-do-i-open-a-specific-conversation";

function mateSentence(locale: string) {
  const section = read(`content/docs/${locale}/app-inbox.mdx`)
    .split("\n## ")
    .find(
      (block) => block.includes(`[#${SECTION_ANCHOR}]`) || block.startsWith("How do I open a specific conversation?"),
    );
  const linkLine = section
    ?.split("\n")
    .find((line) => line.includes("/inbox?threadId=<id>") && line.includes("**Mate:**"));
  return linkLine?.slice(linkLine.indexOf("**Mate:**"));
}

describe("how the inbox guide says Mate points at one conversation", () => {
  it("follows the assistant prompt, which names records instead of linking them", () => {
    const prompt = buildAgentSystemPrompt({ userName: "Ada", locale: "en", surface: "chat" });

    expect(prompt).toContain("Refer to records by their names.");
    expect(prompt).not.toContain("threadId");
  });

  it.each(CONTENT_LOCALES)("does not promise a conversation link from Mate in %s", (locale) => {
    const sentence = mateSentence(locale);

    expect(sentence).toBeDefined();
    expect(sentence).toContain("`nav-inbox`");
    expect(sentence?.toLowerCase()).not.toContain("link");
  });
});
