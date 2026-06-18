"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Send, Loader2 } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import type { MessagingProvider } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  provider: MessagingProvider;
  threadId: string;
  defaultSubject?: string | null;
  defaultRecipients?: string[];
};

export const ThreadReplyComposer = observer(({ threadId, provider, defaultSubject, defaultRecipients }: Props) => {
  const t = useTranslations();
  const { userStore, threadComposeStore } = useRootStore();

  useEffect(() => {
    threadComposeStore.initialize({
      provider,
      threadId,
      defaultSubject,
      defaultRecipients,
    });
  }, [threadComposeStore, provider, threadId, defaultSubject, defaultRecipients]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void threadComposeStore.send();
    }
  }

  if (!userStore.can(Resource.inboxMessages, Action.create)) return null;

  const { isLoading, isEmail, showCcBcc } = threadComposeStore;

  return (
    <div className="border-border bg-background shrink-0 border-t px-4 py-3">
      <AppForm className="flex flex-col gap-2" store={threadComposeStore} onSubmit={threadComposeStore.send}>
        {isEmail && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FormInput
                className="flex-1 text-sm"
                containerClassName="flex-1"
                id="subject"
                label={null}
                placeholder={t("Inbox.compose.subjectPlaceholder")}
              />

              <Button
                className="text-muted-foreground shrink-0"
                size="sm"
                type="button"
                variant="ghost"
                onClick={threadComposeStore.toggleCcBcc}
              >
                {t("Inbox.compose.ccBccToggle")}
              </Button>
            </div>

            {showCcBcc && (
              <>
                <FormInputChips
                  arrayMode
                  className="text-sm"
                  id="cc"
                  label={null}
                  placeholder={t("Inbox.compose.ccPlaceholder")}
                />

                <FormInputChips
                  arrayMode
                  className="text-sm"
                  id="bcc"
                  label={null}
                  placeholder={t("Inbox.compose.bccPlaceholder")}
                />
              </>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <FormTextarea
            className="min-h-[60px] flex-1 resize-none text-sm"
            containerClassName="flex-1"
            id="body"
            label={null}
            placeholder={isEmail ? t("Inbox.compose.writeReply") : t("Inbox.compose.typeMessage")}
            onKeyDown={handleKeyDown}
          />

          <Button className="shrink-0" disabled={isLoading} size="icon" type="submit">
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </AppForm>
    </div>
  );
});
