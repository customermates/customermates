# MCP tool run for the Claude connector directory

Date: 2026-11-11 (UTC times per row). Server: https://customermates.com/api/v1/mcp, production build of main at the time of the run (591dc45 and later; tool behaviour is unchanged by this PR, which only rewrites descriptions).
Workspace: Claude Review (`claude-review`), user review@customermates.com, role Admin, fake data only. Authentication: an API key of that user. Client: a plain JSON-RPC script (initialize, tools/list, tools/call).

tools/list returned 58 tools; each was called once in the final run. 39 returned a successful result; 19 returned the server's refusal, all expected: the review workspace has no connected mail, chat or LinkedIn account and no conversations, and none of its writes run in the background. No message was sent, nothing was published, and no external account was connected (the connect tool only returns a link, which was not opened).

Fake records the run created (one contact, one imported task, plus copies from earlier dry runs the same day) were deleted afterwards with mutate_crm_record and removed from Trash with manage_trash. request_support sent one ticket marked as a test to Customermates support. Link tokens in the results below are redacted.

| # | Tool | Time (UTC) | Call | Outcome | Result (truncated) |
|---|---|---|---|---|---|
| 1 | `get_workspace_context` | 16:25:02 | read workspace | ok | user: id: ac40fdd0-da25-44df-96ed-d6718171db63 firstName: Claude lastName: Reviewer email: review@customermates.com status: active avatarUrl: "" theme: system displayLang |
| 2 | `discover_record_types` | 16:25:03 | list record types | ok | schemaRevision: 1 canManageSchema: true canPublishSummary: true canManageRoles: true total: 4 types[4]: - id: 929b351a-1c8c-8861-8d4f-7fb2643e1435 label: Organization plu |
| 3 | `get_record_model` | 16:25:03 | read schemas | ok | revision: 1 types[3]: - id: 35a6802b-c278-83be-8e62-4b28611f1fd1 label: Contact pluralLabel: Contacts description: Individual people at customers and prospects. icon: con |
| 4 | `query_crm_records` | 16:25:03 | first page of contacts | ok | records[5]: - ref: typeId: 35a6802b-c278-83be-8e62-4b28611f1fd1 recordId: 93a75d1e-57ea-40da-8ecb-e0c90eaba1cd version: 1 schemaRevision: 1 createdAt: "2026-11-11T16:24:1 |
| 5 | `search_crm_records` | 16:25:03 | free-text search | ok | results[5]: - ref: typeId: b3e7aee8-885e-829c-82ac-014f11b1b72f recordId: 331a24ea-ec65-8286-877e-5a5b1dd7c3c3 title: state: value value: kind: text value: Annual complia |
| 6 | `resolve_record_identifiers` | 16:25:04 | resolve a fake email | ok | schemaRevision: 1 matches[1]: - provider: mail value: nobody@example.com records[0]: |
| 7 | `check_address` | 16:25:04 | format check | ok | address: street: Unter den Linden 1 line2: null postalCode: "10117" city: Berlin region: null countryCode: de formatted: "Unter den Linden 1, 10117 Berlin" location: lat: |
| 8 | `mutate_crm_record` | 16:25:04 | create a fake contact | ok | result: status: completed refs[1]{typeId,recordId}: 35a6802b-c278-83be-8e62-4b28611f1fd1,03496a7b-07a3-4b8c-b2a6-81e26ee2d36e schemaRevision: 1 |
| 9 | `read_crm_record` | 16:25:05 | read the fake contact | ok | ref: typeId: 35a6802b-c278-83be-8e62-4b28611f1fd1 recordId: 03496a7b-07a3-4b8c-b2a6-81e26ee2d36e version: 1 schemaRevision: 1 createdAt: "2026-11-11T16:25:04.896Z" update |
| 10 | `preview_crm_deletion` | 16:25:05 | preview deleting the fake contact | ok | ref: typeId: 35a6802b-c278-83be-8e62-4b28611f1fd1 recordId: 03496a7b-07a3-4b8c-b2a6-81e26ee2d36e recordVersion: 1 schemaRevision: 1 impactHash: 364a89cc3c5be2bca1b1dcb5f2 |
| 11 | `query_crm_measure` | 16:25:05 | count deals | ok | schemaRevision: 1 attribution: full total: count: 9 result: state: value value: kind: decimal value: "9" currency: null groups[1]: - record: null fieldId: null label: sta |
| 12 | `read_trash` | 16:25:05 | list trash | ok | total: 0 items[0]: |
| 13 | `manage_trash` | 16:25:06 | preview emptying trash (no deletion) | ok | action: preview result: items[0]: removedRecords[0]: removedLinks: 0 impactHash: ba6ac011ba0d8c04ab6fe042373e73469693a3256713452ffb315e32646d8d3e |
| 14 | `export_crm_records` | 16:25:06 | export tasks | ok | format: customermates-records version: 1 typeId: 942685d9-7310-806f-8923-dcd6673841c3 schemaRevision: 1 exportedAt: "2026-11-11T16:25:06.565Z" records[5]: - ref: typeId:  |
| 15 | `import_crm_records` | 16:25:06 | import one fake task | ok | created: 1 updated: 0 linked: 0 unlinked: 0 schemaRevision: 1 |
| 16 | `read_crm_operation` | 16:25:07 | read an operation | refused (expected) | ✖ This background operation is unavailable. → at operationId — Every write in this workspace completes synchronously, so no background operation exists; an unknown operation id is refused. |
| 17 | `cancel_crm_operation` | 16:25:07 | cancel a finished or unknown operation | refused (expected) | ✖ This background operation is unavailable. → at operationId — Same as read_crm_operation: no background operation to cancel. |
| 18 | `resume_crm_operation` | 16:25:07 | resume a finished or unknown operation | refused (expected) | ✖ This background operation is unavailable. → at operationId — Same as read_crm_operation: no background operation to resume. |
| 19 | `manage_record_files` | 16:25:07 | search file text | ok | action: search items[0]: |
| 20 | `configure_record_model` | 16:25:08 | preview adding a field (not applied) | ok | action: preview result: expectedRevision: 1 nextRevision: 2 valid: true execution: synchronous dataValidation: complete affectedRecords: 0 hiddenRecords: false references |
| 21 | `list_users` | 16:25:08 | list members | ok | total: 1 page: 1 pageSize: 5 items[1]{id,firstName,lastName,email,roleId,status}: ac40fdd0-da25-44df-96ed-d6718171db63,Claude,Reviewer,review@customermates.com,05f4aeaf-2 |
| 22 | `manage_data_views` | 16:25:08 | list view surfaces | ok | action: surfaces total: 13 items[13]{surfaceKey,label,path}: users-card-store,Members,/settings/members roles-card-store,Roles,/settings/roles webhooks-card-store,Webhook |
| 23 | `manage_record_detail_layout` | 16:25:08 | read contact layout | ok | typeId: 35a6802b-c278-83be-8e62-4b28611f1fd1 schemaRevision: 1 hasPersonalization: false layout: pinnedFields[0]: hiddenFields[0]: fieldOrder[0]: fields[11]{id,label}: 76 |
| 24 | `manage_calendar` | 16:25:09 | read calendar config | ok | action: read saved: true config: sources[3]: - id: bb0e2f19-5463-49a3-b781-171b495cd0bb typeId: 942685d9-7310-806f-8923-dcd6673841c3 calendar: dateFieldId: e1c86ae3-ceb6- |
| 25 | `manage_wiki_pages` | 16:25:09 | list wiki pages | ok | total: 7 page: 1 pageSize: 5 items[5]: - id: 9974c2e1-f601-4e6c-8f5b-319fb846454a title: Operating Guide createdAt: "2026-10-27T07:58:40.839Z" updatedAt: "2026-10-27T07:5 |
| 26 | `get_messaging_threads` | 16:25:09 | list threads | ok | total: 0 page: 1 pageSize: 5 filterableFields[10]: - field: state operators[2]: in,notIn - field: participantContactId operators[2]: in,notIn - field: participants operat |
| 27 | `get_activities` | 16:25:09 | list activities | ok | availableSources[6]: record,audit,configuration,message,activity,calendar_event items[5]: - kind: record id: 23ad84b3-479a-4f7d-a32e-1574b6166094 at: "2026-11-11T16:25:06 |
| 28 | `get_calendars` | 16:25:10 | list calendar events | ok | total: 0 page: 1 pageSize: 5 items[0]: |
| 29 | `send_chat_message` | 16:25:10 | no connected account: expected refusal, nothing sent | refused (expected) | The requested record was not found — No connected chat account in the review workspace; the server refuses and nothing is sent. |
| 30 | `send_email` | 16:25:10 | no connected account: expected refusal, nothing sent | refused (expected) | The requested record was not found — No connected email account; the server refuses and nothing is sent. |
| 31 | `save_message_draft` | 16:25:10 | no connected account: expected refusal | refused (expected) | The requested record was not found — No connected account; refused, no draft saved. |
| 32 | `discard_message_draft` | 16:25:10 | unknown draft: expected not found | ok | Nothing was discarded: no draft you can manage has that message id and revision |
| 33 | `update_messaging_thread` | 16:25:11 | unknown thread: expected not found | refused (expected) | ✖ Thread ID not found or not accessible. → at threadId — The workspace has no conversations; an unknown thread id is refused. |
| 34 | `move_email_thread` | 16:25:11 | unknown thread: expected not found | refused (expected) | The requested record was not found — No conversations; an unknown thread id is refused. |
| 35 | `manage_conversation_records` | 16:25:11 | unknown thread: expected not found | refused (expected) | ✖ Thread ID not found or not accessible. → at threadId — No conversations; an unknown thread id is refused. |
| 36 | `connect_messaging_account` | 16:25:11 | creates a connect link only; never opened | ok | url: "https://auth.customermates.com/?token=<redacted>" |
| 37 | `manage_connected_accounts` | 16:25:12 | list accounts | ok | items[0]: |
| 38 | `get_social_posts` | 16:25:12 | no LinkedIn account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn account; the server refuses the unknown connectedAccountId and nothing is read or posted. |
| 39 | `get_social_post_engagement` | 16:25:13 | no LinkedIn account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn account; the server refuses the unknown connectedAccountId and nothing is read or posted. |
| 40 | `get_social_profile` | 16:25:13 | no LinkedIn account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn account; the server refuses the unknown connectedAccountId and nothing is read or posted. |
| 41 | `manage_social_relations` | 16:25:13 | no LinkedIn account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn account; the server refuses the unknown connectedAccountId and nothing is read or posted. |
| 42 | `publish_social_post` | 16:25:13 | no LinkedIn account: expected refusal, nothing published | refused (expected) | The requested record was not found — No connected LinkedIn account; the server refuses the unknown connectedAccountId and nothing is read or posted. |
| 43 | `comment_on_social_post` | 16:25:13 | no LinkedIn account: expected refusal, nothing posted | refused (expected) | The requested record was not found — No connected LinkedIn account; the server refuses the unknown connectedAccountId and nothing is read or posted. |
| 44 | `linkedin_search_sales_leads` | 16:25:14 | no Sales Navigator account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn Sales Navigator account; the server refuses the unknown connectedAccountId. |
| 45 | `linkedin_search_sales_companies` | 16:25:14 | no Sales Navigator account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn Sales Navigator account; the server refuses the unknown connectedAccountId. |
| 46 | `linkedin_get_sales_search_parameters` | 16:25:14 | no Sales Navigator account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn Sales Navigator account; the server refuses the unknown connectedAccountId. |
| 47 | `linkedin_manage_sales_lists` | 16:25:14 | no Sales Navigator account: expected refusal | refused (expected) | The requested record was not found — No connected LinkedIn Sales Navigator account; the server refuses the unknown connectedAccountId. |
| 48 | `search_docs` | 16:25:14 | search product docs | ok | matches: docs:connect-custom-connector#claude docs:connect-cli#claude-code docs:quickstart#how-do-i-connect-claude-or-chatgpt docs:webhooks#claude-code-routines docs:mcp# |
| 49 | `get_docs_page` | 16:25:14 | read docs page | ok | # CRM MCP Server Reference: Endpoint and Tools > Customermates exposes a native MCP endpoint at /api/v1/mcp so Claude, ChatGPT, Cursor, and other agent clients can read a |
| 50 | `manage_widgets` | 16:25:14 | list widgets | ok | total: 10 items[10]: - id: 291d4a9f-25f1-4c69-830e-e1df54e8e104 name: Open pipeline kind: chart version: 1 viewId: null layout: x: 0 y: 0 w: 3 h: 2 - id: ae9d64c8-25b0-40 |
| 51 | `manage_routines` | 16:25:15 | list routines | ok | total: 0 page: 1 pageSize: 25 items[0]: |
| 52 | `manage_webhooks` | 16:25:15 | list webhooks | ok | total: 0 page: 1 pageSize: 25 items[0]: |
| 53 | `update_my_profile` | 16:25:15 | set theme to system | ok | theme: system message: Profile updated |
| 54 | `manage_team` | 16:25:16 | create an invite link; no email sent | ok | link: "https://customermates.com/invitation/<redacted>" expiresAt: "2026-11-18T16:23:26.675Z" message: Invitation link ready |
| 55 | `manage_roles` | 16:25:16 | read roles | ok | result: schemaRevision: 1 canEdit: true canDelete: false role: null types[4]{id,label}: 929b351a-1c8c-8861-8d4f-7fb2643e1435,Organizations 35a6802b-c278-83be-8e62-4b28611 |
| 56 | `request_support` | 16:25:16 | test ticket to Customermates support | ok | Support request email accepted for delivery. The Customermates team will reply to the email address on your account. |
| 57 | `search` | 16:25:17 | unified search | ok | {"results":[{"id":"wiki:23170b63-30e0-4b05-8585-eba57d6c4dae","title":"Products and Pricing","url":"https://customermates.com/w/claude-review/wiki?page=23170b63-30e0-4b05 |
| 58 | `fetch` | 16:25:17 | fetch a docs result | ok | {"id":"wiki:23170b63-30e0-4b05-8585-eba57d6c4dae","title":"Products and Pricing","url":"https://customermates.com/w/claude-review/wiki?page=23170b63-30e0-4b05-8585-eba57d |
