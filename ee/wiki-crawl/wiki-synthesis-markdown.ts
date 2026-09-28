export function wikiSynthesisSectionMarkdown(content: string): string {
  const text = content.replaceAll("\\n", "\n");
  if (!/^1\. \S/u.test(text) || text.includes("\n2. ")) return text;
  let result = text;
  for (let step = 2; step < 100; step += 1) {
    const marker = ` ${step}. `;
    const index = result.indexOf(marker);
    if (index < 0) break;
    result = `${result.slice(0, index)}\n${step}. ${result.slice(index + marker.length)}`;
  }
  return result;
}
