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

6. **Commit Changes:** Commit your changes with a clear and concise commit message.

   ```shell
   git commit -m "Add your detailed description here"
   ```

7. **Push Changes:** Push your changes to your forked repository.

   ```shell
   git push origin your-branch-name
   ```

8. **Create a Pull Request:** Go to the original Customermates repository and create a pull request. Please provide a detailed description of your changes and target the correct base branch according to the branch policy below. Submitting a PR means you agree to the [CLA](./CLA.md).

9. **Code Review:** Your pull request will undergo a code review.

10. **Merge:** Once approved, maintainers will merge your pull request into the main repository.

## Commit Message Convention

This repository enforces Conventional Commits via commit linting.

Use commit messages in this format:

```text
type(scope): short summary
```

Examples:

- `feat(auth): add reset password token validation`
- `fix(api): handle missing webhook signature`
- `docs: update self-hosting setup instructions`

If you add a commit body or footer, separate it from the subject with a blank line.

## Branch Policy

Customermates uses a main-only integration model:

- `main` is the stable release branch.
- All changes arrive through a pull request from a conventional branch such as `feat/contact-import`, `fix/oauth-callback`, or `sandbox/customer-demo`.
- Open pull requests against `main`.

Branch protection and automated checks enforce the merge policy.

## Architecture Conventions

Customermates is **backend-first**: every read and write goes through an interactor in `features/**` or `ee/**`, and the interactor's zod schema is the single source of truth for input validation. The REST API routes (`app/api/v1/**`) and the MCP tools (`features/mcp-tools/**`) are thin adapters: each calls one interactor (or a thin compose of interactors), surfaces its validation result, and at most reshapes the output for presentation. Do not put validation or business logic in a route or tool that the interactor does not own.

- An interactor exposed through an MCP tool or API route uses the `@Validate` decorator, which returns a structured `ok: false` error that the adapter renders for the caller. `@Enforce` (which throws) is reserved for internal/trusted callers such as webhook ingest and background jobs. `features/mcp-tools/__tests__/mcp-validate-contract.test.ts` enforces that no MCP tool is backed by an `@Enforce` interactor.
- Custom validation messages are defined as a `CustomErrorCode` in `core/validation/validation.types.ts` with translations in `i18n/locales/en.json` and `i18n/locales/de.json`; avoid free-text issue messages.

## Reporting Issues

If you face any issues or have suggestions, please feel free to [create an issue on Customermates' GitHub repository](https://github.com/customermates/customermates/issues/new). Please provide as much detail as possible.
