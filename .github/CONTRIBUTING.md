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

## Overlay Conventions

Overlay primitives come from shadcn (`new-york-v4`). shadcn ships **no** mobile viewport safety — no dynamic viewport units, no safe-area insets, no collision padding, and no scroll container in Dialog or Sheet — so this repository layers that on top of upstream and enforces it in `tests/conventions/overlay-contract.test.ts`.

Pick the overlay by what the interaction *is*, not by how much room is left:

| Use | When | Width | Max height | Scroll owner | Small screens |
| --- | --- | --- | --- | --- | --- |
| **Tooltip** | Supplementary hint only. Never the sole carrier of a label, state or action, since touch users never hover | `w-fit`, capped at available width | content | none | unchanged |
| **Dropdown menu** | Short contextual action list | `min-w-32`, capped at available width | available height | the content | unchanged |
| **Select** | Bounded value choice | trigger width | available height | the content | unchanged |
| **Popover** | Lightweight anchored content | `w-72` default, capped at available width | available height | exactly one region | promote with `ResponsiveOverlay` when form-heavy |
| **`AppModal`** | Focused blocking task or form | `sm:max-w-{sm,md,lg,xl}` | `--overlay-block-budget` | `AppCardBody` | Dialog at `md`+, Drawer below |
| **`AlertDialog`** | Destructive or consequential confirmation | `max-w-xs` / `sm:max-w-lg` | `--overlay-block-budget` | the content | stays a centred dialog at every size |
| **Sheet** | Side surface tied to the current page | `w-3/4 sm:max-w-sm`, widened per call site | viewport | `SheetBody` | unchanged |
| **Drawer** | The mobile presentation of a modal | full width | `--sheet-block-budget` | `DrawerBody` | this *is* the small-screen form |
| **`CommandDialog`** | Search or command workflow | `sm:max-w-lg` | `--overlay-block-budget` | `CommandList` | unchanged |

Rules the convention test enforces:

- **No `vh` and no `h-screen`.** Block sizes come from `--overlay-block-budget` (centred overlays) or `--sheet-block-budget` (edge-anchored ones), both defined in `styles/globals.css` and upgraded to `dvh` behind `@supports`. Inline-axis `vw` stays allowed; only the block axis has the mobile-toolbar problem.
- **No raw `env(safe-area-inset-*)`.** Use `var(--safe-top|right|bottom|left)`, and add them (`calc(1rem + var(--safe-left))`) so existing desktop padding survives.
- **No hand-positioned floating surface.** A `fixed` or `absolute` layer with a `z-` class does not flip near an edge, does not follow scroll, and is clipped by any scrolling ancestor. Anchor a `Popover` instead, using `PopoverAnchor` with a virtual ref where there is no DOM trigger (see `components/editor/editor-floating-menu.tsx`).
- **One scroll owner per overlay**, with `min-h-0` on every ancestor between it and the positioned root. A second `max-h` scroller nested inside a modal steals the dialog's own budget.
- Raw `radix-ui` overlay roots and `cmdk` are importable only inside `components/ui/*`; everything else composes the wrappers.

`/test/overlays` renders every overlay against long, overflowing, German, long-identifier and many-action fixtures. Cases are deep-linkable (`?case=&content=&actions=&anchor=&state=&safe=`) so a change can be checked at any viewport without clicking.

## Reporting Issues

GitHub issue tracking is disabled on this repository. If you face a problem or have a suggestion, please use the contact options at [customermates.com](https://customermates.com) and provide as much detail as possible. Suspected security vulnerabilities go through private vulnerability reporting on the repository's Security tab, as described in the [security policy](https://github.com/customermates/.github/blob/main/SECURITY.md) — never through a public channel.
