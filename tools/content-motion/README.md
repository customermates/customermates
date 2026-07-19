# Customermates Motion Kit

This product-owned tool compiles deterministic, network-free motion surfaces from the real Customermates React components, theme tokens, and pinned fonts. Composition specifications may control layout and outer-wrapper motion, but cannot supply class names or visual CSS overrides.

Run from a clean product worktree whose `HEAD` equals the specification's full `productRef`:

```sh
yarn content-motion:build \
  --spec /absolute/path/composition.json \
  --output /absolute/path/composition.html \
  --expected-ref <full-product-commit> \
  --asset-root skill=/absolute/path/to/approved/skill/assets
```

The default `product` asset root is the current product worktree. Additional roots must be named explicitly. Assets cannot escape their declared roots. The generated HTML embeds product CSS, Inter 400–700, JetBrains Mono 400–500, local image assets, component-source metadata, stable `data-cm-id` component addresses, and `window.cmAuditLayout()` for rendered geometry QA. Version 3 scene documents expose `window.getProductScenes()`, `window.setProductScene()`, and deterministic `window.renderScene()`; `window.renderFrame()` remains as the single-scene compatibility route.

## Reusable scene architecture

Use `scenes` for new compositions. A scene owns a bounded node tree, motions, actions, duration, and optional density budget. The director selects one named scene and supplies its normalized progress. IDs and motion/action targets are scene-local, so a single product document can carry primitive, molecule, pattern, and story previews without target collisions.

Inside product components, use semantic flow nodes (`stack`, `inline`, `grid`, and `field`), compound product slots (`cardHeader`, `cardAction`, `cardContent`, `cardFooter`, `tableHeader`, `tableBody`, `tableRow`, `tableHead`, and `tableCell`), and spacing tokens from `none` through `2xl`. Free `x`/`y` positioning is reserved for top-level stages. A bounded stage may declare `layout.overflow` when a child such as a table body moves through a fixed product viewport; intentional crops must additionally declare `qa.allowClipping`, while every undeclared crop still fails geometry QA. `qa.insetParent` plus `qa.inset` verifies actual rendered child-to-parent rails; it does not infer correctness from a wrapper's computed padding.

Forms may opt into the named `layout.rhythm: "social-form"` recipe instead of restating gaps per scene. It fixes a 48-pixel social surface inset, 32-pixel section rhythm, 24-pixel field rhythm, 8-pixel label gap, 16-pixel inline gap, and a shared 56/22/28-pixel height/font/line-height contract for single-line controls. Input, Select, and Textarea retain their actual product implementations; the renderer only applies this bounded presentation and fails geometry QA when sibling control metrics or declared rhythm drift.

Use `social-hero-form` only for a phone-first macro proof. It retains the same spatial rhythm while raising single-line controls to 64 pixels and their text/line height to 28/36 pixels. The Select trigger overrides its product `data-size` height explicitly, so its rendered box remains equal to Input rather than merely sharing a nominal utility class.

Control parity compares untransformed layout metrics. A declared focus or camera transform may scale a complete field temporarily, but it cannot conceal a different Input/Select `offsetHeight`, font size, line height, or horizontal inset in the underlying product layout.

`catalog.json` is the product-owned capability manifest. It records supported layers, node types, variants, presentations, state actions, motion families, and QA contracts. Add a capability and its focused tests there before using it as a one-off composition workaround. Legacy aggregate `input` and `table` nodes remain temporarily readable, but new work should use their granular replacements.

Outer-wrapper motion supports bounded translation, content-driven width and height, scale, opacity, 2D rotation, 2.5D tilt, blur, directional inset clipping, and transform-origin movement. Width and height motion is intended for a product surface that grows with newly revealed rows or fields; pair it with `x` or `y` when the surface should retain a stable visual center. The schema limits dimensions to 2160 pixels, rotation and tilt to ±12 degrees, blur to 24 pixels, and clip/origin values to 0–100 percent. These controls are intended for short explanatory reveals and focus transitions; they do not change component internals or accept arbitrary filters, transforms, classes, or CSS.

Focus nodes, connectors, and attached elements derive their geometry from stable target IDs and named anchors. They cannot supply independent `x` or `y` coordinates. Positioning is recalculated after frame transforms so feedback remains attached during camera motion. The runtime audit reports out-of-bounds content, box and text-paint clipping, unintended declared-box overlap, asymmetric declared padding, declared-inset drift, alignment drift, focus misses, and critical phone-size type below its configured threshold. Scene density budgets reject excess node count, text leaves, characters, or primary regions before rendering.

Supported product-backed content primitives currently include cards and their real slots, buttons and provider tiles, badges, chips, avatars, compound tables, text inputs, textareas, selects, checkboxes, switches, labels, tabs, alerts, separators, overlapping stacks, counters, state swaps, focus geometry, and connectors. Cards expose product, social, and hero presentations. Tables expose product, compact, comfortable, social, and social-hero density presentations, selected or muted row states, and semantic alignment and width at column level. Social presentation variants are bounded adaptations of the real component rather than downstream reconstructions.

Form and state changes remain deterministic while scrubbing. `typeValue`, `selectValue`, and `toggleBoolean` always derive the rendered value from the action threshold and the node's declared initial state; they do not accumulate browser state. Tabs are controlled by their declared value and use the actual product primitives.

The node graph is format-independent. A still samples one declared scene state, a carousel samples one or more named scenes as slides, and video advances normalized progress through the same scenes. A scene may run for up to 60 seconds; longer stories chain scenes in the director instead of creating a different component implementation. Format adapters may choose canvas, sampling point, scene order, pacing, and camera treatment, but they may not fork product markup or component styling. Extend the schema, catalog, and tests before exposing another product component; never approximate it in a downstream content repository.
