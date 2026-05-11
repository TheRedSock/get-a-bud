import { Banknote } from "lucide-react";
import Link from "next/link";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link href="/" className="mb-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Banknote className="size-5" />
            </span>
            <span className="font-semibold">Get a Bud</span>
          </Link>
          <CardTitle className="text-2xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <SignInForm />
          <p className="mt-6 text-sm text-muted-foreground">
            New here?{" "}
            <Link className="font-medium text-foreground underline" href="/register">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
