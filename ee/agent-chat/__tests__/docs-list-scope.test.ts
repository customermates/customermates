import { describe, expect, it } from "vitest";
import { docsRankEvidence } from "../docs-rank-evidence";

describe("source list operation scope", () => {
  it("retains an existing-owned-item prerequisite before a matching recovery action", () => {
    const scope = "Open the saved connection from its card. Only its owner sees these actions:";
    const action = "Reactivate after an Error sends the browser to the same account’s connection page.";
    const body = [
      scope,
      "",
      "- " + action,
      "- Disconnect removes all downloaded messages permanently.",
      "",
      "Unrelated background. ".repeat(30),
    ].join("\n");
    const excerpt = docsRankEvidence(body, "error connecting MailBox", 190, {
      label: "Reactivate a connection",
      locale: "en",
    });
    expect(excerpt).toContain(scope);
    expect(excerpt).toContain(action);
    expect(excerpt).not.toContain("Disconnect");
    expect(excerpt.length).toBeLessThanOrEqual(190);
  });

  it("does not carry a former list prerequisite into a different heading or later prose", () => {
    for (const separator of ["## Separate task", "Independent operation."]) {
      const scope = "Only administrators of a stored catalog may use these actions:";
      const body = [
        scope,
        "- Remove the saved connection.",
        "",
        separator,
        "",
        "- Retry the initial connection with the Connect button.",
        "",
        "Background. ".repeat(30),
      ].join("\n");
      const excerpt = docsRankEvidence(body, "retry initial connection", 130, { locale: "en" });
      expect(excerpt).toContain("Retry the initial connection");
      expect(excerpt).not.toContain("Only administrators");
      expect(excerpt.length).toBeLessThanOrEqual(130);
    }
  });

  it("does not emit a fragment of a non-fitting introducer or expand the existing option bound", () => {
    const scope =
      "Only after reviewing the complete ownership, authorization and backup requirements may the owner of the saved connection use these actions:";
    const excerpt = docsRankEvidence(
      [scope, "", "- Reactivate the Error connection.", "", "Background. ".repeat(30)].join("\n"),
      "Error connection",
      60,
      { locale: "en" },
    );
    expect(excerpt).toContain("Reactivate");
    expect(excerpt).not.toContain("Only after");
    expect(excerpt.length).toBeLessThanOrEqual(60);
  });
  it("does not let a long form introducer displace a complete self-contained read-scope rule", () => {
    const scope =
      "The editor has a required name, description and the resource controls below. " +
      "The form retains the current role configuration. ".repeat(4) +
      "Choose each resource’s permissions:";
    const rule = "Read access: All shows every record; Assigned shows only assigned records; None hides records.";
    const body = [scope, "", "- " + rule, "", "Unrelated background. ".repeat(30)].join("\n");
    const excerpt = docsRankEvidence(body, "read access assigned records", 120, { label: "Roles", locale: "en" });
    expect(excerpt).toContain(rule);
    expect(excerpt).not.toContain("required name");
    expect(excerpt.length).toBeLessThanOrEqual(120);
  });
});
