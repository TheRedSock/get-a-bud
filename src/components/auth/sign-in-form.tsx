"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInFormSchema } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

type SignInFormValues = z.infer<typeof signInFormSchema>;

export function SignInForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInFormSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      toast.error("Could not sign in", {
        description: "Check your email and password and try again.",
      });
      return;
    }

    router.push("/dashboard");
    router.refresh();
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={formFieldDescribedBy("email", Boolean(errors.email))}
          className={cn(errors.email && "border-destructive")}
          {...register("email")}
        />
      </FormField>
      <FormField id="password" label="Password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={formFieldDescribedBy("password", Boolean(errors.password))}
          className={cn(errors.password && "border-destructive")}
          {...register("password")}
        />
      </FormField>
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
