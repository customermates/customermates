import { describe, expect, it } from "vitest";

import {
  SESSION_HINT_COOKIE_NAME,
  SESSION_HINT_DOCUMENT_ATTRIBUTE,
  sessionHintDocumentScript,
} from "@/features/auth/session-hint";

describe("sessionHintDocumentScript", () => {
  it("checks the session hint cookie and marks the document with the hint attribute", () => {
    expect(sessionHintDocumentScript).toContain(`.indexOf(${JSON.stringify(`${SESSION_HINT_COOKIE_NAME}=`)})===0`);
    expect(sessionHintDocumentScript).toContain(
      `document.documentElement.setAttribute(${JSON.stringify(SESSION_HINT_DOCUMENT_ATTRIBUTE)},"")`,
    );
  });
});
