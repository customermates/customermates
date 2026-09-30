export function retireLegacyRecordWrite(): void {
  throw new Error("This CRM write path has been retired. Reload and use the current record interface or API v2.");
}
