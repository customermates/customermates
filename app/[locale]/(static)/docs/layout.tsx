import { Toaster } from "@/components/ui/sonner";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      <Toaster />
    </>
  );
}
