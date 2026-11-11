export const MESSAGING_TOOL_GUIDANCE: Record<string, string> = {
  get_messaging_threads:
    "Follow the options and descriptions in the returned filterableFields when building filters. Take threadId from items[].id. Keep Bcc recipients separate when replying or drafting: never move them into To, Cc or participants. Pass the draftMessageId and draftRevision of a draft message to send_email, send_chat_message or discard_message_draft.",
  get_calendars:
    "For an agenda window, list events filtered by a startsAt range (and a calendarId when needed) and sorted by startsAt.",
  manage_conversation_records:
    "Read first for schemaRevision and the existing links, then pass that schemaRevision as expectedRevision with an idempotencyKey; reuse a key only to retry the identical payload. For global channel associations use resolve_record_identifiers and mutate_crm_record instead.",
  send_chat_message:
    "Show the user the recipient and the exact text and get their go-ahead before sending; use save_message_draft when the wording is not approved. For a new chat take connectedAccountId from get_workspace_context.connectedAccounts[].id (status ok) and use only a linkedinProduct listed in that account's linkedinProducts. For a saved draft take draftMessageId and draftRevision from save_message_draft or get_messaging_threads. Never retry an unknown outcome blindly. For email use send_email.",
  send_email:
    "Show the recipients and the exact text and get approval first; otherwise use save_message_draft. Take connectedAccountId from get_workspace_context.connectedAccounts[].id (status ok), threadId from get_messaging_threads.items[].id, and draftMessageId and draftRevision from save_message_draft or get_messaging_threads. Never promote Bcc into To or Cc, and never add a sign-off or signature to body. After an unknown outcome check the conversation and the Sent folder; never resend blindly.",
  save_message_draft:
    "Use this, never send_email or send_chat_message, when asked to draft: those send immediately. Never add a sign-off or signature to body. Attach files through fileIds from file values, a record's files list, or manage_record_files upload without recordId. Find drafts with get_messaging_threads and its draft filter, and keep draftMessageId and draftRevision for send_email, send_chat_message or discard_message_draft.",
  discard_message_draft:
    "Use this when a prepared draft is no longer wanted. Take messageId and draftRevision from save_message_draft or from the thread detail of get_messaging_threads.",
  update_messaging_thread:
    "Use this when triaging the inbox. Take threadId from get_messaging_threads.items[].id. Setting the state a thread already has is a no-op, so triage in bulk without reading each state first.",
  move_email_thread:
    "Take threadId from get_messaging_threads.items[].id and folderId from the thread detail's folder.moveTargets; never pass a folder name.",
  connect_messaging_account:
    "Call get_workspace_context first to see which accounts are already connected. You cannot complete the connection yourself: return the link and tell the user to open it and finish authentication there.",
  manage_connected_accounts:
    "Use this when the user wants to change the settings of a connected email or chat account. Take id from list. For set_signature send the complete emailSettings object from list with your changes. Connecting a new account is done with connect_messaging_account.",
};
