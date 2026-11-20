export const AUTOMATION_TOOL_GUIDANCE: Record<string, string> = {
  manage_rules:
    "Take list ids from discover_record_types and field ids from get_record_model. Pass enabled false on create to save a draft, because omitting it creates a live rule. Prefer disable to delete: delete removes the rule and its history and cannot be undone. Use preview to see which records a date-reached rule would hit before enabling it.",
  manage_forms:
    "Take typeId from discover_record_types and read action fields before create to see the fields a form can use and the people lists it can link to.",
  manage_incoming_webhooks:
    "Take typeId from discover_record_types and field ids from get_record_model, and read action fields before create to see the fields a mapping can fill.",
  schedule_meeting:
    "Call options first for the writable calendars, attendee suggestions and follow-up lists. Confirm title, time, time zone and attendees with the user before create or update. Take event ids from create or from get_calendars.",
  manage_booking_links: "Take calendarId from schedule_meeting options and list and field ids from get_record_model.",
};
