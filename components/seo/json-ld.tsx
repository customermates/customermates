type Props = {
  schema: Record<string, unknown> | Record<string, unknown>[];
};

export function JsonLd({ schema }: Props) {
  return <script dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} type="application/ld+json" />;
}
