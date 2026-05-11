import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import "@/app/globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Get a Bud",
  description: "A modern personal budgeting app for cash flow, budgets and net worth.",
  metadataBase: new URL("https://get-a-bud.vercel.app"),
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
