"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerUser } from "@/app/register/actions";
import { showErrorToast } from "@/lib/toast-errors";

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      currency: (formData.get("currency") as string) || "NOK",
    };

    try {
      const result = await registerUser(payload);
      if ("error" in result && result.error) {
        showErrorToast(
          "Could not create account",
          new Error(result.error.message),
        );
        setLoading(false);
        return;
      }
    } catch (error) {
      showErrorToast("Could not create account", error);
      setLoading(false);
      return;
    }

    await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="currency">Default currency</Label>
        <Input id="currency" name="currency" defaultValue="NOK" maxLength={3} />
      </div>
      <Button disabled={loading} type="submit">
        {loading ? "Creating..." : "Create account"}
      </Button>
    </form>
  );
}
