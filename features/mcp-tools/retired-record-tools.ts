export const RETIRED_RECORD_TOOLS: Readonly<Record<string, string>> = {
  get_record_schema: "discover_record_types, then get_record_model for the relevant typeIds",
  list_records: "query_crm_records and query_crm_measure for totals",
  search_records: "search_crm_records",
  get_records: "read_crm_record with typeId and recordId",
  create_contacts: "mutate_crm_record with mutation.action=create",
  create_organizations: "mutate_crm_record with mutation.action=create",
  create_deals: "mutate_crm_record with mutation.action=create",
  create_services: "mutate_crm_record with mutation.action=create",
  create_tasks: "mutate_crm_record with mutation.action=create",
  update_contacts: "mutate_crm_record with mutation.action=update",
  update_organizations: "mutate_crm_record with mutation.action=update",
  update_deals: "mutate_crm_record with mutation.action=update",
  update_services: "mutate_crm_record with mutation.action=update",
  update_tasks: "mutate_crm_record with mutation.action=update",
  update_record_notes: "mutate_crm_record with the configured rich-text field assignment",
  manage_record_links: "mutate_crm_record with mutation.action=link or mutation.action=unlink",
  delete_records: "preview_crm_deletion, then mutate_crm_record with mutation.action=delete after confirmation",
  manage_custom_columns: "configure_record_model to preview and apply a configuration bundle",
};

export function retiredRecordToolMessage(name: string): string | null {
  if (!Object.hasOwn(RETIRED_RECORD_TOOLS, name)) return null;
  return `CRM contract version 2 retired ${name}. No operation was performed. Use ${RETIRED_RECORD_TOOLS[name]}. Discover the current types and read their schemas first; labels are editable and record references require both typeId and recordId. Refresh your tool catalog and update this saved call. The MCP connection URL and authentication are unchanged.`;
}
