export const RECORDS_TOOL_GUIDANCE: Record<string, string> = {
  discover_record_types:
    "Continue with page and pageSize until total is covered, then fetch only the relevant schemas with get_record_model.",
  get_record_model: "Pass the smallest set of typeIds needed.",
  configure_record_model:
    "Read the relevant model with get_record_model first and preserve untouched definitions. Preview before applying, with the same expectedRevision and idempotencyKey; after a stale revision read the model again and preview again. For a pending result read the durable operation status with read_crm_operation. Do not create or change a field only to manufacture an unsupported saved-view filter. Name the contact details field Contact details unless the user names it. Send a delete as the only operation in its bundle, inspect the preview first, and restore a deleted list, field or relationship through manage_trash (read_trash lists it).",
  query_crm_records:
    "Read the type's schema with get_record_model first. Reuse the returned group keys to load further pages of a group.",
  search_crm_records: "Follow nextCursor for more results, with the same searchTerm, typeIds and includeEmbedded.",
  resolve_record_identifiers:
    "Never pick an arbitrary match: use type context, or ask the user, when several records share an identifier. Resolve every input that returns more than one record before updating. To update the matches, deduplicate by ref, then pass schemaRevision as expectedRevision and each ref with its version as an updateMany target of mutate_crm_record (up to 100 per atomic batch) without reading the records again; a changed record rejects the whole batch, so resolve again.",
  read_crm_record: "Pass both typeId and recordId.",
  mutate_crm_record:
    "Read the latest record version with read_crm_record before an update or delete, supply it as expectedVersion, and on a version conflict read the record again and retry with the current expectedVersion. A file value takes file ids from manage_record_files. Preview a deletion with preview_crm_deletion and pass its impactHash as expectedImpactHash. After a delete, read_trash lists the records and manage_trash restores them within 30 days, using the returned trashBatchId to restore the whole delete. When the result carries address warnings, correct the address with another update where the user agrees.",
  preview_crm_deletion:
    "Always supply expectedRevision, plus either a single ref with expectedVersion or targets for an atomic selection deletion. After the user approves, pass the returned impactHash to mutate_crm_record as expectedImpactHash.",
  query_crm_measure:
    "For contributions and quantities per catalog item, use the line-item list as the source when the workspace has one.",
  read_crm_operation:
    "For pending or staging, wait at least retryAfterMs before polling again; stop at completed, failed or cancelled.",
  cancel_crm_operation:
    "After cancelling, read the operation status with read_crm_operation to verify the final state.",
  resume_crm_operation: "Follow read_crm_operation for the final result.",
  manage_record_detail_layout:
    "Read first for the available stable field keys, the current layout and the schema revision. When saving, preserve the choices the user did not ask to change. Retry the identical request with the same idempotencyKey.",
};
