# Locales

`i18n/locale-registry.ts` is the only place a locale is declared. Every other module derives its
locale set from one of three exported domains.

| Domain | Meaning | Drives |
| --- | --- | --- |
| `APP_LOCALES` | offered as a persisted display language | the profile language select, `User.displayLanguage` validation, background and cron emails |
| `CONTENT_LOCALES` | has published MDX under `content/` | Fumadocs resolution, `sitemap.xml`, hreflang, the footer language switcher, hero images, the raw-docs manifest, the MCP docs tools |
| `ROUTING_LOCALES` | the union of both | the URL prefixes the proxy recognises, message loading, prefix stripping |

A locale in `ROUTING_LOCALES` must have a complete message bundle, including one that is only a
content locale: public pages render their chrome from the JSON catalog, and `(protected)` routes are
not locale-gated, so any locale reachable by URL renders the full product UI. What "content only"
removes is the *persisted preference*, not the message bundle.

## Source contract

The deciding question for any string is **does its absence mean the application is broken, or that a
URL does not exist?**

| | `i18n/locales/<locale>.json` | `content/<collection>/<locale>/*.mdx` |
| --- | --- | --- |
| Read by | the running app, through a stable dotted key | the page renderer and search engines, through a URL |
| Absence means | the app is broken, so the gate fails | that URL does not exist, so it 404s |
| Completeness | total: exact key and ICU-placeholder parity across app locales | per locale: a gap is a legitimate 404, never default-language prose at a localized URL |
| Validated by | `i18n-parity`, `i18n-key-resolution`, `jsonc/sort-keys` | Fumadocs zod frontmatter schemas, plus the content-tree half of `i18n-parity` |

The two formats are kept apart deliberately, and neither is generated from the other.

- Converging them is impossible in one direction: an MDX page's body compiles to a React component,
  which JSON cannot express and next-intl cannot render.
- Generating localized MDX from a canonical source would place `content/legal/<locale>/` downstream
  of an engineer-editable artifact, and those pages need counsel approval before publication.
- `fallbackLanguage` is `null` in `core/fumadocs/i18n.ts`. Without it a missing translation silently
  serves default-language prose under a localized URL, keeps the page in `getPages(locale)`, and
  emits a localized canonical and hreflang for content that was never written.

`User.formattingLocale` is a **third axis** and is deliberately not constrained to either domain. It
selects number, date and currency formatting, which is a region choice unrelated to which
translations exist.

## Add an application-only language

The product UI is translated; the public site is not. The new locale never appears in `sitemap.xml`,
in any hreflang set, or in the footer language switcher.

1. Add one row to `LOCALE_REGISTRY` in `i18n/locale-registry.ts`:

   ```ts
   fr: { offeredAsDisplayLanguage: true, hasPublishedContent: false, formattingTag: "fr-FR", flagCode: "fr" },
   ```

2. Create `i18n/locales/fr.json` from `i18n/locales/en.json` and translate the values. Keep the keys
   byte-identical, keep ICU placeholder names unchanged, and keep every object alphabetically sorted.
   Translate every value rather than leaving a partial bundle: `yarn i18n:audit` blocks on a key or
   placeholder gap and reports untranslated values, glossary drift, and namespaces where two distinct
   English strings collapsed onto one translation. Product nouns follow the `GLOSSARY` in
   `scripts/audit-i18n.ts`; add the new locale's stems there.
3. Add the new language's name under `Common.locales` in **every** bundle, including its own.
4. Register the timeago language in `core/stores/intl.store.ts`. TypeScript names the missing key.
5. Confirm `node_modules/zod/v4/locales/fr.js` exists. If it does not, the validation messages fall
   back to English, which is acceptable but worth noting in the pull request.
6. Add an `ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'fr';` migration so the display-language
   preference can be persisted. Keep it in its own migration file and do not reference the new value
   in the same transaction. Add the value to the enum in `prisma/schema.prisma` in the same position
   the migration puts it, using `BEFORE`/`AFTER` when appending would not match, so
   `prisma migrate diff` stays empty.
7. Run `yarn openapi:generate && yarn typecheck && yarn lint && yarn test && yarn i18n:audit`. The
   `Locale` enum is part of the published API schema, so a display language shows up in
   `public/v1/openapi.json` even though it changes nothing about the public site.

**Must change:** `i18n/locale-registry.ts`, `i18n/locales/*.json`, `core/stores/intl.store.ts`,
`prisma/schema.prisma` plus its migration, `public/v1/openapi.json`.

**Must not change:** anything under `content/` or `public/images/`, `app/sitemap.ts`,
`core/fumadocs/*`, `core/seo/*`, `components/shared/language-selector.tsx`, `scripts/generate-*.ts`,
`features/mcp-tools/*`, or any convention test. If one of those needs an edit, the registry has
leaked and the change is wrong.

## Add a public-content language

1. Set `hasPublishedContent: true` on that locale's registry row. A brand-new locale also needs steps
   2 to 6 above first, because every public page renders chrome from the message catalog.
2. For every directory under `content/`, create `<collection>/<locale>/` and author a file for every
   filename present in the default locale. Skip `content/api/`; `yarn openapi:generate` produces it.
3. Add `public/images/light/<locale>/` and `public/images/dark/<locale>/` with every filename present
   in the default locale's variants.
4. Have counsel review `content/legal/<locale>/` before merge.
5. Run `yarn openapi:generate && yarn raw-docs:generate && yarn typecheck && yarn lint && yarn test && yarn build`.
6. Submitting the changed sitemap to search engines is a human step.

To stop offering a locale as a display language, set `offeredAsDisplayLanguage: false`. Stored
preferences pointing at it resolve to the default locale through `resolveUserLocale`, so no data
migration is required and no user sees an error.
