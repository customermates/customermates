# Customermates Commercial License

Version 1.0, 6 August 2026
Copyright (c) 2026-present Benjamin Wagner, doing business as Customermates.

This is a source-available commercial license, not an open-source license. By exercising a permission below, you accept these terms.

## 1. Definitions

**Commercial Software** means first-party software and associated material in `ee/`, and corresponding object code, other than `ee/audit-log/`, Third-Party Components, and the AGPL Client Material described in Section 6.

**Commercial Agreement** means a written enterprise licence, order, or subscription agreement accepted by Benjamin Wagner, doing business as Customermates ("Customermates").

**Community Edition** means the first-party material outside `ee/` together with `ee/audit-log/`, all of which is licensed under AGPL-3.0-only, plus any Third-Party Components under their respective licences.

**Applicable Documentation** means the repository-root `README.md` and `ee/README.md` supplied in the same source revision as the relevant software.

**Enterprise Feature** means the unified inbox and connected-account email, messaging, or calendar integrations; single sign-on; white-labelling; and any other functionality expressly identified as Enterprise or Cloud-only in the Applicable Documentation. Audit logging is not an Enterprise Feature.

**Official Community Image** means an image published by Customermates at `ghcr.io/customermates/customermates` for documented operation with `APP_MODE=self-hosted`.

**Community Build** means either (a) an Official Community Image configured with `APP_MODE=self-hosted`, or (b) a build from this repository configured with `APP_MODE=self-hosted`, provided that the Commercial Software itself is unmodified and Enterprise Features are not deliberately made operational or used. The AGPL-licensed parts surrounding the Commercial Software may be modified without preventing the result from being a Community Build.

**Unmodified** means that the corresponding Commercial Software source has not been altered. Ordinary compilation, bundling, minification, and configuration for documented `APP_MODE=self-hosted` operation do not by themselves modify the Commercial Software.

**Third-Party Components** means components for which another copyright holder supplies a separate licence.

## 2. Development and Testing

You may copy and modify the Commercial Software solely for internal, non-production development and testing. You may submit a patch to Customermates for possible inclusion in the project. No ownership in your modification transfers to Customermates unless you separately agree to that transfer in writing.

## 3. Commercial Production Use

Except for the limited Community Build permission in Section 4, production use of the Commercial Software or an Enterprise Feature requires a valid Commercial Agreement and is limited by that agreement.

## 4. Limited Community Build Permission

Any person or organisation may copy, install, and run the Commercial Software, including in production and without a Commercial Agreement, solely as part of a Community Build and only to support operation of the Community Edition and audit logging. This permission includes unmodified commercial support code necessarily executed for entitlement bookkeeping, denial of unavailable features, and audit-only shared activity timelines.

This permission does not authorise you to deliberately make an Enterprise Feature operational, to use an Enterprise Feature, or to modify the Commercial Software for production use. Inert compiled routes, schemas, interface declarations, entitlement checks, or other non-operational references do not by themselves constitute activation or use. Configuring credentials specifically to operate an Enterprise Feature, bypassing self-hosted entitlement controls, or invoking the underlying Enterprise functionality is not permitted by this Section.

## 5. Limited Redistribution and Notices

You may convey a Community Build, including object code generated from unmodified Commercial Software, provided that you make the verbatim corresponding source for that Commercial Software available at no additional charge, either with the build or from a network location clearly identified with the build and tied to its exact source revision. That source must remain available for at least three years after you last convey the build. You must retain this licence, the repository `LICENSE`, and all copyright and attribution notices. You may also convey verbatim copies of unmodified Commercial Software solely as part of that corresponding source. Recipients receive the same permissions and restrictions directly under this licence. No other right to publish, distribute, sublicense, or sell the Commercial Software is granted.

## 6. AGPL Client Material

Any first-party material in `ee/` that is served client-side as an image, font, cascading stylesheet (CSS), or source that produces or is compiled, arranged, augmented, or combined into client-side JavaScript, in whole or in part, is licensed under AGPL-3.0-only rather than this Commercial License. The AGPL-3.0-only text in the repository `LICENSE` applies to that material. This Section does not relicense server-side Commercial Software merely because it communicates with a browser.

## 7. Reservation of Rights

No rights are granted beyond those expressly stated in this licence. Commercial Software used under a Commercial Agreement remains subject to that agreement. The AGPL-licensed portions of the repository remain subject exclusively to their applicable licence.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

For all third party components incorporated into the Customermates Software, those
components are licensed under the original license provided by the owner of the
applicable component.
