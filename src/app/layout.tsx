import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { Toaster } from "sonner";

import "@/app/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import {
  readThemeFromCookie,
  THEME_STORAGE_KEY,
  themeInitScript,
  type Theme,
} from "@/lib/theme";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get(THEME_STORAGE_KEY)?.value;
  const initialTheme: Theme = readThemeFromCookie(storedTheme) ?? "dark";

  return (
    <html
      lang="en"
      className={initialTheme === "dark" ? "dark" : undefined}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <ThemeProvider initialTheme={initialTheme}>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
