<div align="center">
  <h1 align="center">Customermates</h1>
  <a href="https://customermates.com">Get an Enterprise License</a>
</div>

# Commercial and Community Components under `ee/`

Licensing within this directory is path-specific:

- `ee/audit-log/` is part of the Community Edition and is licensed under AGPL-3.0-only.
- Other first-party files in `ee/` are Commercial Software under [`ee/LICENSE.md`](./LICENSE.md), subject to the AGPL client-material exception stated there.

Commercial Software currently supports hosted or Enterprise functionality such as the unified inbox, connected-account messaging and calendar integrations, and cloud subscription and lifecycle operations. Production use of Commercial Software outside the limited Community Build permission, including any Enterprise Feature, requires a Commercial Agreement.

The official Community image at `ghcr.io/customermates/customermates` contains compiled Commercial Software because the Community and hosted editions share a build. The limited Community Build permission in [`ee/LICENSE.md`](./LICENSE.md) permits unmodified commercial support code to run where documented self-hosted operation requires it for entitlement bookkeeping, denial of unavailable features, and audit-only shared activity timelines. It does not grant permission to make Enterprise Features operational or to use them. Source under `ee/audit-log/` remains AGPL-licensed; other shared support code remains Commercial Software usable in a Community Build only under that limited permission.
