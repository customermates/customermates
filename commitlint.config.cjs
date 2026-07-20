// Aligned with the shared Customermates repository policy: Conventional Commit
// headers of at most 100 characters, a lowercase subject without a trailing
// period, and the conventional type set. Body lines stay unrestricted so that
// long URLs and trailers are not wrapped artificially.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0],
    "header-max-length": [2, "always", 100],
    "scope-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "type-empty": [2, "never"],
  },
};
