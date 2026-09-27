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
| **Sheet**         | Side surface tied to the current page                                        | `w-3/4 sm:max-w-sm`, widened per call site | viewport                 | `SheetBody`, or a delegated `AppCardBody` | unchanged                              |
| **Drawer**        | Mobile presentation of a modal                                               | full width                                 | `--sheet-block-budget`   | `DrawerBody`       | this is the small-screen form                    |
| **CommandDialog** | Search or command workflow                                                   | `sm:max-w-lg`                              | `--overlay-block-budget` | `CommandList`      | unchanged                                        |

## Required composition

- Give each overlay exactly one vertical scroll owner, with `min-h-0` on every ancestor between that owner and the positioned root.
- Align every visible overlay header left across Dialog, Drawer, Sheet, Popover, AlertDialog, and AppModal presentations. Non-overlay card compositions may opt into another alignment explicitly.
- Keep AppModal headers limited to titles and non-interactive metadata. Pass zero to two typed action descriptors through the AppModal `actions` slot. AppModal alone renders their 36×36 controls, 16px icons, semantic color, accessible name, tooltip, disabled/busy behavior, and fixed top-right row beside Close; callers cannot override those visual dimensions.
- Keep task-overlay headers and action footers divider-free. Use separators inside structured content only; retain each primitive's outer surface or edge border.
- Keep ordinary anchored overlays at `z-50`. Persistent assistant panels use `OVERLAY_RAISED_PANEL_LAYER_CLASS`, and overlays or guidance launched from those panels use `OVERLAY_TOPMOST_LAYER_CLASS`, so page filters cannot cover the assistant without hiding its own controls.
- Page overlays stay modal and mounted beside the assistant. Opening or closing the assistant panel, or a spotlight or tour starting or ending, never changes the modality of an open dialog, drawer (including the vaul drawer on small screens), popover, or record sheet and never remounts it, so its tab, typed text, and focus survive.
- Spread `assistantSurfaceProps` from [`assistant-surface.ts`](../modal/assistant-surface.ts) on every interactive assistant surface: the panel, its tour card, and any non-modal overlay the panel opens. The surface opts itself out of the page modal instead: it takes pointer events through the body lock, carries `aria-live` so the modal's `aria-hidden` spares it, and stops its own focus, wheel, and touch events after React has handled them, so the modal's focus trap and scroll lock never see them.
- AppModal, the record drawer, and ResponsiveOverlay pass `keepOpenForAssistantSurface` as `onInteractOutside` and `onEscapeKeyDown`, and their modal presentations pass `releaseFocusToAssistantSurface` as `onBlur`. A press, focus, or Escape inside `[data-agent-surface]` therefore never closes them; a press anywhere else still does.
- Escape closes only the top layer. Pressed inside an assistant surface, it belongs to the assistant, which takes it with `claimEscapeForAssistant`: it ends a running tour, or closes the panel while no spotlight is showing, and the page overlay beneath stays open. Pressed anywhere else, only the most recently opened layer closes, and the panel closes only when no other layer is open.
- An AppModal launched from the assistant passes `layerClassName={OVERLAY_TOPMOST_LAYER_CLASS}`, covers the panel, and keeps its focus trap.
- Drawers and ResponsiveOverlay move focus into themselves when they open, as the desktop dialog does, and an overlay without a description renders no `aria-describedby`.
- Controlled overlays without a primitive trigger use `useOverlayFocusReturn`. Custom navigation lifecycles reuse `overlay-focus-target` rather than duplicating element, stable-ID, visibility, or remount logic.
- Always provide a stable focus fallback when an opener can unmount. Never return focus into an inert or closing overlay.
- Import raw `radix-ui` overlay roots and `cmdk` only inside `components/ui/*`; all other code composes these wrappers.

Preferred patterns:

- Derive block size from `--overlay-block-budget` or `--sheet-block-budget` in [`styles/globals.css`](../../styles/globals.css).
- Read safe areas through `var(--safe-top|right|bottom|left)` and add them to existing padding, for example `calc(1rem + var(--safe-left))`.
- Anchor floating content with Popover or Floating UI. Use `PopoverAnchor` with a virtual reference when no DOM trigger exists, as in [`editor-floating-menu.tsx`](../editor/editor-floating-menu.tsx).
- Cap anchored content with the matching Radix available-width and available-height variables.
- When a Sheet hosts an AppCard, constrain `SheetBody` as a non-scrolling flex column and delegate scrolling to `AppCardBody`; do not leave both regions scrollable.

Prohibited patterns:

- Block-axis `vh`, `h-screen`, or new hard-coded viewport arithmetic.
- Raw `env(safe-area-inset-*)` outside the shared tokens.
- Hand-positioned `fixed` or `absolute` floating surfaces with a `z-` class.
- A second `max-h` scroller nested inside a modal.
- `border-t` or `border-b` dividers on task-overlay headers and action footers.

## Reviewed limits

Nested dropdown submenus cannot always fit beside their parent on a small screen. The shared cap handles negative available-width reports, but prefer a flat menu or the responsive Dialog/Drawer path for phone-critical actions. There are currently no `DropdownMenuSubContent` production call sites.

`SelectContent` deliberately defaults to `position="popper"` rather than shadcn's `item-aligned`. Item-aligned does not provide inline-axis collision avoidance or `--radix-select-content-available-width`; Popper keeps the surface inside the viewport gutter. The shared width cap still protects a call site that opts back into item-aligned.

The `/test/overlays` gallery covers long and overflowing content, German copy, long identifiers, nested states, validation, and many-action layouts. Cases are deep-linkable with `?case=&content=&actions=&anchor=&state=&safe=`.
