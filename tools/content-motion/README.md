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

The default `product` asset root is the current product worktree. Additional roots must be named explicitly. Assets cannot escape their declared roots. The generated HTML embeds product CSS, Inter 400–700, JetBrains Mono 400–500, local image assets, component-source metadata, and a deterministic `window.renderFrame` function.

Outer-wrapper motion supports bounded translation, scale, opacity, 2D rotation, 2.5D tilt, blur, directional inset clipping, and transform-origin movement. The schema limits rotation and tilt to ±12 degrees, blur to 24 pixels, and clip/origin values to 0–100 percent. These controls are intended for short explanatory reveals and focus transitions; they do not change component internals or accept arbitrary filters, transforms, classes, or CSS.
