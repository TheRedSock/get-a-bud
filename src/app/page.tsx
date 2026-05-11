import { ArrowRight, Banknote, CircleDollarSign, Layers3, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const landingFeatures = [
  {
    title: "Payday-aware budgets",
    description: "Anchor a budget month to the day money actually arrives.",
    icon: CircleDollarSign,
  },
  {
    title: "One ledger, many sources",
    description: "Manual entry and bank imports land in the same finance model.",
    icon: Layers3,
  },
  {
    title: "Private by design",
    description: "User-provided bank keys are encrypted and scoped to connections.",
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <span className="grid size-10 place-items-center rounded-full bg-foreground text-background">
            <Banknote className="size-5" />
          </span>
          Get a Bud
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-12 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-end lg:py-24">
        <div className="space-y-8">
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.07em] sm:text-7xl lg:text-8xl">
            Money should feel less like admin.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Get a Bud turns accounts, budgets, bills and net worth into a quiet
            operating system for the household. Start manually, add bank sync when
            you are ready, and keep the model flexible.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Create your budget <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/demo">Preview dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="relative rounded-[2rem] border bg-background/55 p-3 shadow-2xl shadow-black/5 backdrop-blur-sm">
          <div className="grid gap-3 rounded-[1.5rem] border bg-card/70 p-4">
            {landingFeatures.map((feature, index) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[1.25rem] p-3 transition-colors hover:bg-secondary/60"
                >
                  <span className="grid size-11 place-items-center rounded-full border bg-background">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <span>
                    <span className="block font-semibold">{feature.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {feature.description}
                    </span>
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="px-4 py-5 text-sm leading-6 text-muted-foreground">
            The preview dashboard uses demo data so the layout, charts and mobile
            behavior can be tested without creating an account.
          </p>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-7xl flex-col gap-4 border-t py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Get a Bud is an MVP prototype for personal finance planning.</p>
        <div className="flex flex-wrap gap-4">
          <Link className="hover:text-foreground" href="/demo">
            Demo
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-foreground" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-foreground" href="https://get-a-bud.vercel.app">
            Vercel
          </Link>
        </div>
      </footer>
    </main>
  );
}
