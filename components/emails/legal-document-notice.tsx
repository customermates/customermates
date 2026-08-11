/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import { Section, Text } from "@react-email/components";

import { EmailLayout } from "@/components/emails/base/email-layout";
import type { EmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailText } from "@/components/emails/base/email-text";
import type { AppLocale } from "@/i18n/locale-registry";

type DocumentLink = {
  name: string;
  version: string;
  liveUrl: string;
};

type Props = {
  body: string;
  deadline: string | null;
  deadlineLabel: string;
  documents: DocumentLink[];
  greeting: string;
  locale: AppLocale;
  layoutCopy: EmailLayoutCopy;
  objections: string[];
  signoff: string;
  subject: string;
  title: string;
};

export default function LegalDocumentNotice({
  body,
  deadline,
  deadlineLabel,
  documents,
  greeting,
  locale,
  layoutCopy,
  objections,
  signoff,
  subject,
  title,
}: Props) {
  return (
    <EmailLayout layoutCopy={layoutCopy} locale={locale} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{body}</EmailText>

      {deadline ? (
        <EmailText className="font-semibold">
          {deadlineLabel}: {deadline}
        </EmailText>
      ) : null}

      {objections.map((objection) => (
        <EmailText key={objection}>{objection}</EmailText>
      ))}

      <Section className="my-6">
        {documents.map((document) => (
          <Text key={document.name} className="my-3 text-base leading-6 text-default-900">
            <EmailLink className="font-semibold" href={document.liveUrl}>
              {document.name}
            </EmailLink>

            {" · "}

            {document.version}
          </Text>
        ))}
      </Section>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}
