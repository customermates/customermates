UPDATE "P13n"
SET "settings" = jsonb_build_object(
  'entries',
  COALESCE(
    (
      SELECT jsonb_agg(section.value ORDER BY section.ordinality)
      FROM jsonb_array_elements("settings" -> 'sections') WITH ORDINALITY AS section(value, ordinality)
      WHERE section.value ->> 'id' NOT IN ('workspace', 'admin')
    ),
    '[]'::jsonb
  ),
  'hidden',
  COALESCE("settings" -> 'hidden', '[]'::jsonb)
)
WHERE "p13nId" = 'sidebar' AND jsonb_typeof("settings" -> 'sections') = 'array';
