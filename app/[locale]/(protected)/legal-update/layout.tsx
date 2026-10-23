import { ProtectedFrame } from "../w/[workspace]/protected-frame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProtectedFrame>{children}</ProtectedFrame>;
}
