export const MUTATING_ENTITY_TOOL_NAMES: Record<string, readonly string[]> = {
  contact: ["update_contacts", "delete_records"],
  organization: ["update_organizations", "delete_records"],
  deal: ["update_deals", "delete_records"],
  service: ["update_services", "delete_records"],
  task: ["update_tasks", "delete_records"],
};
