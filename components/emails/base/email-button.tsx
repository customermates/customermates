import { Button } from "@react-email/components";

import { EMAIL_INK } from "./email-tokens";

type Props = {
  href: string;
  children: string;
  className?: string;
};

export function EmailButton({ href, children, className }: Props) {
  return (
    <Button
      className={className}
      href={href}
      style={{
        display: "inline-block",
        padding: "11px 18px",
        borderRadius: "6px",
        backgroundColor: EMAIL_INK,
        color: "#ffffff",
        fontSize: "14px",
        lineHeight: "18px",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      {children}
    </Button>
  );
}
