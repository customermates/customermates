import type { ReactNode } from "react";

import { MailCheck } from "lucide-react";

export function EmailSentNotice({ title, body }: { title: ReactNode; body: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" data-email-sent="" role="status">
      <MailCheck aria-hidden className="size-8 text-primary" />

      <p className="text-x-md font-medium">{title}</p>

      <p className="text-x-sm text-subdued [overflow-wrap:anywhere]">{body}</p>
    </div>
  );
}
