import { describe, expect, it } from "vitest";

import { messagePreview } from "../message-preview";

const email = {
  provider: "google" as const,
  bodyText: null,
  bodyHtml: null,
  subject: "Subject fallback",
  isDeleted: false,
};

describe("messagePreview", () => {
  it("uses the plain body first, like the Inbox snippet, instead of replacing it with the subject", () => {
    expect(messagePreview({ ...email, bodyText: "  Current\n\nreply  ", bodyHtml: "<p>HTML alternative</p>" })).toBe(
      "Current reply",
    );
  });

  it("uses the Inbox HTML-to-text converter when plain text is absent", () => {
    expect(
      messagePreview({ ...email, bodyHtml: '<p>One</p><p>Two &amp; <a href="https://example.com">docs</a></p>' }),
    ).toBe("One Two & docs (https://example.com)");
  });

  it("does not expose styling or script content from HTML-only messages", () => {
    expect(
      messagePreview({ ...email, bodyHtml: "<style>secret style</style><script>secret script</script><p>Body</p>" }),
    ).toBe("Body");
  });

  it("uses the email subject only when neither body contains visible text", () => {
    expect(messagePreview({ ...email, bodyText: "  ", bodyHtml: "<p> </p>" })).toBe("Subject fallback");
  });

  it("does not turn a non-email subject into a body preview", () => {
    expect(messagePreview({ ...email, provider: "linkedin" })).toBeNull();
  });

  it("does not reveal deleted bodies or subjects", () => {
    expect(messagePreview({ ...email, isDeleted: true, bodyText: "Deleted body" })).toBeNull();
  });

  it("keeps provider unsupported bodies out of the visible snippet", () => {
    expect(messagePreview({ ...email, bodyText: "Unipile cannot display this type of message" })).toBeNull();
  });
});
