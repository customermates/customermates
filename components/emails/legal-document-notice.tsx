/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import { Section, Text } from "@react-email/components";

import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocument } from "@/constants/legal-documents";
import { DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";
import enMessages from "@/i18n/locales/en.json";

type DocumentLink = {
  name: string;
  version: string;
  liveUrl: string;
};

type Props = EmailLayoutSharedProps & {
  body: string;
  deadline: string | null;
  deadlineLabel: string;
  documents: DocumentLink[];
  greeting: string;
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
  objections,
  signoff,
  subject,
  title,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
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

const previewBaseUrl = "https://preview.example.test";
const previewCopy = enMessages.LegalDocumentNotice;
const previewSupplierDeadline = formatPreviewDate("2026-08-20T00:00:00.000Z");

function formatPreviewDate(isoDate: string): string {
  return new Intl.DateTimeFormat(formattingTagFor(DEFAULT_LOCALE), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

function previewDocuments(documents: readonly LegalDocument[]): DocumentLink[] {
  return documents.map((document) => ({
    name: previewCopy.documents[document],
    version: formatPreviewDate(LEGAL_DOCUMENT_VERSIONS[document]),
    liveUrl: `${previewBaseUrl}/${document}`,
  }));
}

LegalDocumentNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  body: previewCopy.contractBody,
  deadline: formatPreviewDate("2026-08-24T00:00:00.000Z"),
  deadlineLabel: previewCopy.contractDeadlineLabel,
  documents: previewDocuments(["terms", "dpa", "privacy", "subprocessors"]),
  greeting: previewCopy.greeting.replace("{firstName}", "Sofia"),
  objections: [
    previewCopy.contractObjection,
    previewCopy.subprocessorObjectionWithDeadline.replace("{deadline}", previewSupplierDeadline),
  ],
  signoff: previewCopy.signoff,
  subject: previewCopy.contractSubject,
  title: previewCopy.contractTitle,
} satisfies Props;
