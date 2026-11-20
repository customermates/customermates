# Licensing

Copyright (c) 2026-present Benjamin Wagner, doing business as Customermates.

Customermates is source-available and fair-code. The source code is public and you can read, run and change it for your own business. Two licences apply: the Sustainable Use License for the code base and the Customermates Enterprise License for the folder `ee/`. This page answers the common questions. The licence texts decide; if this page and a licence text differ, the licence text applies.

## What licence do you use?

- The [Sustainable Use License](./LICENSE.md), version 1.0, covers all first-party files outside `ee/`. It is the licence n8n uses, with Benjamin Wagner, doing business as Customermates, as the licensor.
- The [Customermates Enterprise License](./ee/LICENSE.md) covers all first-party files in `ee/`. Production use needs an enterprise licence, except for the limited Community Build permission described below.
- Third-party components keep the licences their owners supplied. [`NOTICE`](./NOTICE), [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) list them.
- The folder `plugins/cursor/` keeps the MIT License in `plugins/cursor/LICENSE`.
- The names and logos are covered by the [trademark policy](./TRADEMARK.md).

## What is covered by which licence?

The path decides the licence of a source file. Everything outside `ee/` is under the Sustainable Use License. Everything in `ee/` is under the Customermates Enterprise License. The folder is not checked while the software runs: code in `ee/` that gates a paid feature still asks the entitlement service whether the feature is on.

The Community Edition is the self-hosted version without an enterprise licence: the first-party code outside `ee/` plus the unmodified commercial support code that the official image contains because the Cloud and the Community Edition share one build. The Community Build permission in `ee/LICENSE.md` lets you run that support code, in production too, to operate the Community Edition. It does not switch on any Enterprise Feature. Buying a Cloud plan unlocks nothing in a self-hosted installation.

## What can I do?

- Use Customermates as the CRM of your own business, for any number of users, records and workspaces, and run several instances for your own company.
- Read, change and extend the code for your own internal use.
- Use it for non-commercial or personal projects.
- Share your copy or your changes with others free of charge and for non-commercial purposes, with the licence text and the notices attached, and a prominent notice if you changed the software.
- Build your own tools around it with the API, webhooks, n8n and MCP.
- Charge for services around Customermates: setup, data modelling, migrations, training, workshops and consulting.
- Send patches to the code outside `ee/` and, under the rules of `ee/LICENSE.md`, to the code in `ee/`. Every contribution comes with the [Contributor License Agreement](./.github/CLA.md).

## What can't I do?

- Host Customermates as a service for third parties, so that your customers sign in to your instance.
- Sell, resell or distribute Customermates or a modified version of it, for money or as a paid product.
- Offer a fork as your own CRM product.
- White-label it: remove or replace the Customermates name, logo or notices, and offer it under your own brand.
- Switch on or use an Enterprise Feature, or bypass the entitlement checks, without an enterprise licence.
- Remove or hide licence, copyright or other notices.

## Examples

| Situation | Answer |
| --- | --- |
| An agency uses Customermates to manage its own clients, deals and tasks | Allowed. This is an internal business purpose, and there is no limit on the number of clients. |
| An agency deploys an instance for a client and charges the client for the instance | Needs an enterprise licence. |
| A company hosts Customermates for third parties who sign in to it | Not allowed. |
| A product embeds Customermates, or a company white-labels it | By agreement. Branding stays visible. |
| A consultant runs a workshop, trains a team or sets up a data model and charges for the work | Allowed, as long as the client receives the result and your own instance stays an internal tool. |
| A company runs the official image for its own team and adds its own n8n workflows | Allowed. |
| A company changes the code in `ee/` and runs it in production | Needs an enterprise licence. |

The test is who administers the CRM workspace and whose customers pay for the CRM. If the CRM serves your own business, you are inside the Sustainable Use License. If the CRM, or access to it, is the thing you sell, you need an agreement with Customermates.

## Is Customermates open source?

No. The source code is available under the Sustainable Use License, and the Open Source Initiative says open-source licences cannot limit use, so we do not call the product open source. The accurate terms are source-available and fair-code. In practice the Community Edition gives most teams the benefits they look for in open source: you can read the code, host it yourself, keep your data in your own infrastructure and change it for your own use. What it does not allow is selling Customermates, hosting it for others or white-labelling it.

Fair-code is a model described at [faircode.io](https://faircode.io), not a licence: the software is free to use and distribute by anybody, has its source code openly available, can be extended in public and private communities, and is commercially restricted by its authors. There is no affiliation between fair-code and Customermates.

## Contributions and the CLA

Every contributor agrees to the [Contributor License Agreement](./.github/CLA.md), a few plain-English sentences. It gives Customermates permission to license your contribution on any terms, and it means you are not liable for your contribution. [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md) explains the pull request rules, including the rule for `ee/`.

## Where do I ask?

Questions about the licence, enterprise licences, embedding, white-labelling and multi-client setups go through the [contact page](https://customermates.com/contact). Plans and prices are on the [pricing page](https://customermates.com/pricing). The licence pages in the documentation are [Licence](https://customermates.com/docs/licence), [Licence FAQ](https://customermates.com/docs/licence-faq) and [Compare editions](https://customermates.com/docs/compare-editions).
