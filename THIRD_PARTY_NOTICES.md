# Third-party notices

Customermates includes or uses the third-party data listed below. This data is not covered by the Customermates licenses in [LICENSE](./LICENSE) and [ee/LICENSE.md](./ee/LICENSE.md); its own license applies.

## Address formats: Google libaddressinput address metadata

Address metadata © Google, from Google's Address Data Service used by [libaddressinput](https://github.com/google/libaddressinput), licensed under the [Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

- Source: https://chromium-i18n.appspot.com/ssl-address/data
- In this repository: `scripts/address-metadata/libaddressinput.json` holds the entries of the data service for each country and language, with the date they were retrieved. `scripts/generate-address-metadata.ts` converts them into `features/addresses/address-metadata.json`, which ships with the application and its container image.
- Changes: the converted file keeps, for each country, the postal code pattern and examples, the address parts the country's postal format requires, the regions with their names, codes and postal code patterns, and the order and labels of the address parts, in a format of its own. The other fields of the source are left out.

## Postal codes: GeoNames

Postal code data from [GeoNames](https://www.geonames.org/), licensed under the [Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

- Source: https://download.geonames.org/export/zip/
- Not part of this repository or of the container image. A running server downloads the file of a country the first time someone enters an address in that country, downloads it again after 90 days, and keeps the postal codes with their places, regions and coordinates in its own PostgreSQL database. `POSTAL_CODE_DATA_URL` points the download at a mirror or turns it off.
- Changes: while a file is loaded, its postal codes are written in the country's format, place names are cleaned up and matched to the country's regions, and the entries are grouped by postal code.

## Map: Natural Earth

Map data from [Natural Earth](https://www.naturalearthdata.com/), which is in the public domain ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). No permission is needed to use it; the map credits Natural Earth as a courtesy.

- Source: https://github.com/nvkelso/natural-earth-vector, release v5.1.2
- In this repository: `scripts/generate-basemap.mjs` downloads the 1:50m and 1:10m countries without boundary lakes, the 1:10m first-order administrative boundary lines and the 1:10m populated places of that release, checks each file against its pinned SHA-256 and writes `public/maps/v1/`, which ships with the application and its container image. The map loads these files from the application's own origin.
- Changes: the files keep the land, the coastlines, the country borders, the first-order administrative boundaries up to a minimum zoom and the populated places with their minimum zoom and their names in the application languages. The shapes are simplified, quantized as TopoJSON and split into Web Mercator tiles; the other fields of the source are left out.

## No warranty

The CC BY 4.0 data sets are provided as is, without warranties of any kind, as set out in section 5 of the CC BY 4.0 license. GeoNames states that its data is provided without any representation of accuracy, timeliness or completeness. Natural Earth data comes without warranties of any kind as well.
