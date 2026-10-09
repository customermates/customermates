import { Fragment } from "react";

const shortPrefixCompound = /^(\p{L}{1,3}-\p{L}+)(.*)$/u;

type Props = {
  text: string;
};

export function HeadingText({ text }: Props) {
  return text.split(" ").map((word, index) => {
    const match = shortPrefixCompound.exec(word);

    return (
      <Fragment key={`${index}-${word}`}>
        {index > 0 ? " " : null}

        {match ? (
          <>
            <span className="whitespace-nowrap">{match[1]}</span>

            {match[2]}
          </>
        ) : (
          word
        )}
      </Fragment>
    );
  });
}
