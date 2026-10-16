# Basemap data (v1)

The map widget draws its basemap from these files. They ship with the application and are served from its own origin, so a map makes no request to a map, tile, font or geocoding provider.

## Source

[Natural Earth](https://www.naturalearthdata.com/) vector data, version 5.1.2, in the public domain ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). The script downloads these files of the `v5.1.2` release from https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson and checks each against its pinned SHA-256:

- `ne_50m_admin_0_countries_lakes.geojson` (`b4c14911c7eec4a5d920b90294de6c16fdb078425b2caa6974a38a0b261f9667`)
- `ne_10m_admin_0_countries_lakes.geojson` (`4caf607838c3cfd211a52edda259e315513390a717a11067c5eb280f766cfb78`)
- `ne_10m_admin_1_states_provinces_lines.geojson` (`1a1f30ccaaf4cc9c4bde34266f0b8cbb955d3a4cf254b756912255f2ec7c75b6`)
- `ne_10m_populated_places.geojson` (`9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b`)

## Contents

- `world.json`: countries at 1:50m with lakes cut out, simplified to about 5 km, as `land` polygons, `coast` and `borders` lines, and the populated places with a minimum zoom up to 5 as `places`. Its `regions` member lists the detail files by Web Mercator tile (`zoom/x/y`).
- `region-<zoom>-<x>-<y>.json`: one Web Mercator tile at 1:10m with the same layers plus `states` (first-order administrative boundaries up to Natural Earth minimum zoom 9, merged per rounded minimum zoom `z`) and the remaining populated places. Land is simplified to about 1 km, boundaries to 1.5 km. A tile is split into four while its gzipped size exceeds 150.0 KB.
- Places keep only the name `n` (English), the Natural Earth minimum zoom `z` and the names in the application languages (de, en, es, fr, it) where they differ from the English one. Coordinates are TopoJSON quantized per file; nothing else of the source attributes is kept.

## Regenerate

```sh
yarn basemap:generate [--cache <directory>]
```

The script downloads only when it runs, never in CI or at run time; `--cache` keeps the verified downloads between runs. It rewrites this directory. A new data version belongs in a new `public/maps/v<n>/` directory, because the files are served with an immutable cache header.

## Files

| File | Size | Gzipped |
| --- | --- | --- |
| `world.json` | 360.0 KB | 111.6 KB |
| `region-1-0-1.json` | 387.4 KB | 113.7 KB |
| `region-2-0-0.json` | 97.2 KB | 34.1 KB |
| `region-2-0-1.json` | 279.5 KB | 82.4 KB |
| `region-2-1-0.json` | 125.5 KB | 43.9 KB |
| `region-2-2-0.json` | 91.5 KB | 32.3 KB |
| `region-2-2-2.json` | 224.3 KB | 68.0 KB |
| `region-2-2-3.json` | 19.5 KB | 7.4 KB |
| `region-2-3-0.json` | 41.0 KB | 15.0 KB |
| `region-2-3-2.json` | 264.5 KB | 80.6 KB |
| `region-2-3-3.json` | 25.0 KB | 9.3 KB |
| `region-3-2-2.json` | 170.4 KB | 53.9 KB |
| `region-3-2-3.json` | 235.0 KB | 70.1 KB |
| `region-3-3-2.json` | 96.2 KB | 31.2 KB |
| `region-3-3-3.json` | 144.0 KB | 46.1 KB |
| `region-3-4-2.json` | 441.8 KB | 141.0 KB |
| `region-3-4-3.json` | 354.3 KB | 110.1 KB |
| `region-3-5-2.json` | 125.2 KB | 39.0 KB |
| `region-3-5-3.json` | 239.0 KB | 73.5 KB |
| `region-3-6-2.json` | 80.4 KB | 25.6 KB |
| `region-3-6-3.json` | 390.4 KB | 117.3 KB |
| `region-3-7-2.json` | 59.7 KB | 19.9 KB |
| `region-3-7-3.json` | 24.7 KB | 8.3 KB |

Total on disk: 4276.5 KB.
