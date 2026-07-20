# Contributing to Customermates

Thanks for considering contributing to Customermates!

Please make sure to go through the [documentation](https://customermates.com/docs) before.

## How to Contribute

1. **Fork the Repository:** Click on the 'Fork' button in the upper right corner of the repository's GitHub page. This will create a copy of the repository in your GitHub account.

2. **Clone the Repository:** Clone your forked repository to your local machine using `git clone`.

   ```shell
   git clone https://github.com/yourusername/customermates.git
   cd customermates
   ```

3. **Create a New Branch:** Create a conventional branch from the latest `main` instead of working directly on `main`.

   ```shell
   git checkout main
   git pull --ff-only
   git checkout -b feat/your-change
   ```

4. **Make Changes:** Make your desired changes and ensure that your code adheres to Customermates' coding standards.

5. **Test Locally:** Test your changes locally to ensure they work as expected.

6. **Commit Changes:** Commit your changes using a Conventional Commit header.

   ```shell
   git commit -m "feat(contacts): import contacts from a csv file"
   ```

7. **Push Changes:** Push your changes to your forked repository.

   ```shell
   git push origin your-branch-name
   ```

8. **Create a Pull Request:** Open a pull request against `main` in the Customermates repository. Use a Conventional Commit header as the pull-request title and fill in every required description section. Submitting a pull request means you agree to the [CLA](./CLA.md).

9. **Code Review:** Your pull request runs the automated checks and is reviewed by a Code Owner.

10. **Merge:** Once the checks pass and the review is approved, the pull request is squash-merged into `main` and its branch is deleted automatically.

## Branch Policy

Customermates uses a main-only integration model:

- `main` is the only long-lived branch and always holds the latest stable state. There is no integration or release branch.
- Every change arrives through a pull request that targets `main`. Direct pushes, force pushes, and branch deletion are blocked for everyone.
- Pull requests are squash-merged, and the branch is deleted automatically afterwards.

Branch names use `<type>/<lowercase-kebab-case-description>`, for example `feat/contact-import`, `fix/oauth-callback`, or `sandbox/customer-demo`. The permitted types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`, plus `sandbox` for throwaway exploration.

## Commit, Title, and Description Conventions

Commit headers and the pull-request title both use the Conventional Commit format:

```text
type(scope): short summary
type: short summary
```

Examples:

- `feat(auth): add reset password token validation`
- `fix(api): handle missing webhook signature`
- `docs: update self-hosting setup instructions`

The header is at most 100 characters, the scope is lowercase, the summary starts in lowercase, and it carries no trailing period. If you add a commit body or footer, separate it from the subject with a blank line.

Every pull-request description must contain these sections, in this order:

```text
## Summary
## Context
## Validation
## Impact and rollback
```

The organization pull-request template pre-fills them, so open the pull request and replace the guidance text.

Because every pull request is squash-merged, avoid updating your branch with a merge commit — the generated `Merge branch main into …` header does not satisfy the convention. Rebase onto `main` instead.

### Automatic Validation

Formatting is checked for you: local commit linting enforces the commit header, and the shared `repository-policy` check re-validates the branch name, every commit header, the pull-request title, and the required description sections on each pull request. A pull request cannot merge until that check and the repository CI both pass.

## Review and Approval

Reviews follow the Code Owners listed in [CODEOWNERS](./CODEOWNERS):

- A pull request from an external contributor, or from anyone who is not a Code Owner, requires an approving review from a Code Owner.
- A Code Owner does not need a second person to approve their own pull request.
- In every case, all CI and policy checks still apply, and no one can merge a pull request whose checks are failing or whose conversations are unresolved.

## Architecture Conventions

Customermates is **backend-first**: every read and write goes through an interactor in `features/**` or `ee/**`, and the interactor's zod schema is the single source of truth for input validation. The REST API routes (`app/api/v1/**`) and the MCP tools (`features/mcp-tools/**`) are thin adapters: each calls one interactor (or a thin compose of interactors), surfaces its validation result, and at most reshapes the output for presentation. Do not put validation or business logic in a route or tool that the interactor does not own.

- An interactor exposed through an MCP tool or API route uses the `@Validate` decorator, which returns a structured `ok: false` error that the adapter renders for the caller. `@Enforce` (which throws) is reserved for internal/trusted callers such as webhook ingest and background jobs. `features/mcp-tools/__tests__/mcp-validate-contract.test.ts` enforces that no MCP tool is backed by an `@Enforce` interactor.
- Custom validation messages are defined as a `CustomErrorCode` in `core/validation/validation.types.ts` with translations in `i18n/locales/en.json` and `i18n/locales/de.json`; avoid free-text issue messages.

## Reporting Issues

GitHub issue tracking is disabled on this repository. If you face a problem or have a suggestion, please use the contact options at [customermates.com](https://customermates.com) and provide as much detail as possible. Suspected security vulnerabilities go through private vulnerability reporting on the repository's Security tab, as described in the [security policy](https://github.com/customermates/.github/blob/main/SECURITY.md) — never through a public channel.
