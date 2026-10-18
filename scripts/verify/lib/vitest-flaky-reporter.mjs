import { appendFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

/**
 * Vitest reporter that keeps retried tests visible: every test that failed and then passed on a retry is written to
 * $VITEST_FLAKY_REPORT (JSON) and, in GitHub Actions, to the job summary and as a warning annotation.
 */
export default class FlakyReporter {
  flaky = [];

  onInit(vitest) {
    this.root = vitest.config.root;
  }

  onTestCaseResult(testCase) {
    const diagnostic = testCase.diagnostic();
    if (!diagnostic?.flaky || testCase.result().state !== "passed") return;
    this.flaky.push({
      file: relative(this.root ?? process.cwd(), testCase.module.moduleId),
      test: testCase.fullName,
      retries: diagnostic.retryCount,
    });
  }

  onTestRunEnd() {
    if (process.env.VITEST_FLAKY_REPORT) writeFileSync(process.env.VITEST_FLAKY_REPORT, JSON.stringify(this.flaky, null, 2));
    if (this.flaky.length === 0) return;
    console.log(`\n${this.flaky.length} flaky test(s) passed only on a retry:`);
    for (const entry of this.flaky) {
      console.log(`  FLAKY ${entry.file} > ${entry.test} (retries: ${entry.retries})`);
      if (process.env.GITHUB_ACTIONS) console.log(`::warning file=${entry.file}::Flaky test passed on retry: ${entry.test}`);
    }
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\n### Flaky Vitest tests (passed on retry)\n\n${this.flaky.map((entry) => `- \`${entry.file}\` › ${entry.test}`).join("\n")}\n`,
      );
  }
}
