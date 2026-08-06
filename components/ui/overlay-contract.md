# Overlay contract

Customermates composes its overlays from the shadcn `new-york-v4` primitives in this directory. The wrappers add the repository's mobile viewport, safe-area, collision, scrolling, dismissal, and focus-return contract. Mechanically decidable rules are enforced by [the convention suite](../../tests/conventions/overlay-contract.test.ts); runtime behavior is exercised in the [overlay gallery](<../../app/[locale]/(protected)/test/overlays/page.tsx>).

## Decision matrix

Choose an overlay by what the interaction is, not by how much room is left.

| Use               | When                                                                         | Width                                      | Max height               | Scroll owner       | Small screens                                    |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------ | ------------------------ | ------------------ | ------------------------------------------------ |
| **Tooltip**       | Supplementary hint only; never the sole carrier of a label, state, or action | `w-fit`, capped at available width         | content                  | none               | unchanged                                        |
| **Dropdown menu** | Short contextual action list                                                 | `min-w-32`, capped at available width      | available height         | the content        | unchanged                                        |
| **Select**        | Bounded value choice                                                         | trigger width                              | available height         | the content        | unchanged                                        |
| **Popover**       | Lightweight anchored content                                                 | `w-72` default, capped at available width  | available height         | exactly one region | promote with `ResponsiveOverlay` when form-heavy |
| **AppModal**      | Focused blocking task or form                                                | `sm:max-w-{sm,md,lg,xl}`                   | `--overlay-block-budget` | `AppCardBody`      | Dialog at `md`+, Drawer below                    |
| **AlertDialog**   | Destructive or consequential confirmation                                    | `max-w-xs` / `sm:max-w-lg`                 | `--overlay-block-budget` | the content        | stays a centered dialog                          |
| **Sheet**         | Side surface tied to the current page                                        | `w-3/4 sm:max-w-sm`, widened per call site | viewport                 | `SheetBody`        | unchanged                                        |
| **Drawer**        | Mobile presentation of a modal                                               | full width                                 | `--sheet-block-budget`   | `DrawerBody`       | this is the small-screen form                    |
| **CommandDialog** | Search or command workflow                                                   | `sm:max-w-lg`                              | `--overlay-block-budget` | `CommandList`      | unchanged                                        |

## Required composition

- Give each overlay exactly one vertical scroll owner, with `min-h-0` on every ancestor between that owner and the positioned root.
- Controlled overlays without a primitive trigger use `useOverlayFocusReturn`. Custom navigation lifecycles reuse `overlay-focus-target` rather than duplicating element, stable-ID, visibility, or remount logic.
- Always provide a stable focus fallback when an opener can unmount. Never return focus into an inert or closing overlay.
- Import raw `radix-ui` overlay roots and `cmdk` only inside `components/ui/*`; all other code composes these wrappers.

Preferred patterns:

- Derive block size from `--overlay-block-budget` or `--sheet-block-budget` in [`styles/globals.css`](../../styles/globals.css).
- Read safe areas through `var(--safe-top|right|bottom|left)` and add them to existing padding, for example `calc(1rem + var(--safe-left))`.
- Anchor floating content with Popover or Floating UI. Use `PopoverAnchor` with a virtual reference when no DOM trigger exists, as in [`editor-floating-menu.tsx`](../editor/editor-floating-menu.tsx).
- Cap anchored content with the matching Radix available-width and available-height variables.

Prohibited patterns:

- Block-axis `vh`, `h-screen`, or new hard-coded viewport arithmetic.
- Raw `env(safe-area-inset-*)` outside the shared tokens.
- Hand-positioned `fixed` or `absolute` floating surfaces with a `z-` class.
- A second `max-h` scroller nested inside a modal.

## Reviewed limits

Nested dropdown submenus cannot always fit beside their parent on a small screen. The shared cap handles negative available-width reports, but prefer a flat menu or the responsive Dialog/Drawer path for phone-critical actions. There are currently no `DropdownMenuSubContent` production call sites.

`SelectContent` deliberately defaults to `position="popper"` rather than shadcn's `item-aligned`. Item-aligned does not provide inline-axis collision avoidance or `--radix-select-content-available-width`; Popper keeps the surface inside the viewport gutter. The shared width cap still protects a call site that opts back into item-aligned.

The `/test/overlays` gallery covers long and overflowing content, German copy, long identifiers, nested states, validation, and many-action layouts. Cases are deep-linkable with `?case=&content=&actions=&anchor=&state=&safe=`.
