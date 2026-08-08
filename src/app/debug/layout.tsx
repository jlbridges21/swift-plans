import { notFound } from "next/navigation";

/**
 * Debug tools are development-only. Production returns 404.
 */
export default function DebugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return children;
}
