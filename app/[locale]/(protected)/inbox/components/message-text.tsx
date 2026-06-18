import { Fragment, type ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<]+)/g;
const TRAILING_RE = /[.,!?;:]+$/;

export function linkifyText(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;

    const trailing = TRAILING_RE.exec(part)?.[0] ?? "";
    const url = trailing ? part.slice(0, part.length - trailing.length) : part;
    return (
      <Fragment key={i}>
        <a className="underline underline-offset-2" href={url} rel="noreferrer noopener nofollow" target="_blank">
          {url}
        </a>

        {trailing}
      </Fragment>
    );
  });
}

export function MessageText({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{linkifyText(text)}</p>;
}
