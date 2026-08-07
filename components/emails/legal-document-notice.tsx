/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import { Section, Text } from "@react-email/components";

import { EmailLayout } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailText } from "@/components/emails/base/email-text";

type DocumentLink = {
  name: string;
  version: string;
  liveUrl: string;
  revisionUrl: string;
};

type Props = {
  body: string;
  deadline: string | null;
  deadlineLabel: string;
  documents: DocumentLink[];
  greeting: string;
  liveLabel: string;
  objections: string[];
  revisionLabel: string;
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
  liveLabel,
  objections,
  revisionLabel,
  signoff,
  subject,
  title,
}: Props) {
  return (
    <EmailLayout preview={subject} title={title}>
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
          <Text key={document.name} className="text-base leading-6 text-default-900">
            <strong>{document.name}</strong>

            {" — "}

            {document.version}

            <br />

            <EmailLink href={document.liveUrl}>{liveLabel}</EmailLink>

            {" · "}

            <EmailLink href={document.revisionUrl}>{revisionLabel}</EmailLink>
          </Text>
        ))}
      </Section>

      <EmailText className="whitespace-pre-line">{signoff}</EmailText>
    </EmailLayout>
  );
}
