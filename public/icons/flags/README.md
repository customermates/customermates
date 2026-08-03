# Country flags

Bundled so the application makes no third-party browser request for flag images.
Before this, both the language selector and the country picker loaded from
`flagcdn.com`, which disclosed every visitor's IP address to a third party.

- Source: https://flagcdn.com (Flagpedia), `w40` raster variant.
- Artwork: public domain, as stated by Flagpedia.
- Retrieved: 2026-08-03.
- Coverage: one file per value of the `CountryCode` enum in `prisma/schema.prisma`.

Rendered at 12 to 20 pixels, so the 40 pixel wide raster is sufficient and keeps
the bundled set small. `tests/conventions/third-party-requests.test.ts` asserts a
file exists for every enum value, so a missing flag fails the test suite rather
than rendering a blank avatar in production.

To add a country, add the enum value and place the matching `w40/<code>.png` here.
