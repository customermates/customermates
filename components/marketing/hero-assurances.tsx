const SEPARATOR = /\s*[·•✓]\s*/u;

export function heroAssuranceItems(text: string): string[] {
  return text
    .split(SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function HeroAssurances({ text, align = "center" }: { text: string; align?: "center" | "start" }) {
  const items = heroAssuranceItems(text);
  if (items.length < 2) return <p>{text}</p>;

  return (
    <ul className="homepage-hero-assurances" data-align={align} data-hero-assurances="">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
