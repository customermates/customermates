import { Toaster } from "@/components/ui/sonner";

export default function StaticLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      <Toaster />
    </>
  );
}
