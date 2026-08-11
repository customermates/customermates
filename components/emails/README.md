# Transactional email previews

Run `yarn email:dev` from a clean checkout. The preview server needs no database, application server, provider credentials, or customer data.

React Email discovers the production templates directly and renders their inline English `PreviewProps`. Two additional entries exist because React Email supports only one preview fixture per component: the informational legal notice and the subscription-inactivation variant of the shared inactivation template.

The automated preview registry renders every recipient-facing behavior in `en`, `de`, `fr`, `it`, and `es`; operator notifications intentionally stay in English. Every address, token, company, message, and URL in the fixtures is synthetic.

The preview logo is served from the tracked `static/` directory. Production delivery continues to use the absolute public application asset.
