# Transactional email previews

Run `yarn email:dev` from a clean checkout. The preview server needs no database, application server, provider credentials, or customer data.

React Email discovers all production templates directly and renders their inline English `PreviewProps`. Contractual and informational legal notices, and trial and subscription inactivation notices, are separate production templates because they are separate email behaviors.

The automated preview inventory test maps every production send to its template and renders each recipient-facing behavior in `en`, `de`, `fr`, `it`, and `es`; operator notifications intentionally stay in English. Every address, token, company, message, and URL in the fixtures is synthetic.

The preview logo is served from the tracked `static/` directory. Production delivery continues to use the absolute public application asset.
