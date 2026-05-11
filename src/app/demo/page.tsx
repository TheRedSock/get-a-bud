import { Banknote, LogIn } from "lucide-react";
import Link from "next/link";

import DashboardPage from "@/app/(app)/dashboard/page";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function DemoPage() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mx-auto mb-8 flex max-w-7xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <span className="grid size-10 place-items-center rounded-full bg-foreground text-background">
            <Banknote className="size-5" />
          </span>
          Get a Bud demo
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline">
            <Link href="/sign-in">
              <LogIn className="size-4" /> Sign in
            </Link>
          </Button>
        </div>
      </nav>
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Public preview
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Dashboard without account setup.
          </h1>
          <p className="mt-4 text-muted-foreground">
            This route uses demo data only, so you can inspect layout, charts,
            responsiveness and styling before wiring a live account.
          </p>
        </div>
        <DashboardPage />
      </section>
    </main>
  );
}
