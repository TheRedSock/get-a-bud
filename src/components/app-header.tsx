import { Bell, Search } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 border-b bg-background/70 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="relative hidden w-80 md:block">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" placeholder="Search merchants, bills, accounts..." />
        </div>
        <ThemeToggle />
        <Button size="icon" variant="outline" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
      </div>
    </header>
  );
}
