# Transactional email previews

Run `yarn email:dev` from a clean checkout. The preview server needs no database, application server, provider credentials, or customer data.

The sidebar contains one fixture for each production send behavior, plus separate contract and information fixtures for the legal notice. Recipient emails accept `en`, `de`, `fr`, `it`, or `es` in the locale preview prop. Operator notifications intentionally stay in English.

Every address, token, company, message, and URL in these fixtures is synthetic. The preview logo is served from the tracked `static/` directory; production delivery continues to use the public application asset.
