import { describe, expect, it } from "vitest";

import { parseOnboardingJob, preselectedOnboardingJob } from "../onboarding-job";

describe("onboarding job", () => {
  it.each([
    ["followup", "followup"],
    [" Agent ", "agent"],
    [["workspace", "agent"], "workspace"],
    ["crm", null],
    [undefined, null],
    [42, null],
  ])("parses %j as %j", (value, expected) => {
    expect(parseOnboardingJob(value)).toBe(expected);
  });

  it("preselects the chosen job, then the signup job, then the user's own agent", () => {
    expect(preselectedOnboardingJob({ selectedJob: "workspace", signupJob: "followup" })).toBe("workspace");
    expect(preselectedOnboardingJob({ selectedJob: null, signupJob: "followup" })).toBe("followup");
    expect(preselectedOnboardingJob({ selectedJob: null, signupJob: null })).toBe("agent");
  });
});
