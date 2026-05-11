"use client";

import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Search,
  Settings,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: WalletCards },
  { href: "/transactions", label: "Transactions", icon: CreditCard },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/bills", label: "Bills", icon: CalendarDays },
  { href: "/net-worth", label: "Net worth", icon: Landmark },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed left-4 top-4 z-30 hidden h-[calc(100vh-2rem)] w-72 flex-col rounded-[2rem] border bg-card/70 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-3 py-2">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <BarChart3 className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Get a Bud</p>
            <p className="text-xs text-muted-foreground">Personal finance OS</p>
          </div>
        </Link>
        <nav className="grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground",
                  active && "bg-primary/12 text-foreground shadow-inner",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[1.6rem] border bg-card/90 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl lg:hidden">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              aria-label={item.label}
              key={item.href}
              href={item.href}
              className={cn(
                "grid place-items-center rounded-2xl py-2 text-muted-foreground transition-colors",
                active && "bg-primary text-primary-foreground",
              )}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
