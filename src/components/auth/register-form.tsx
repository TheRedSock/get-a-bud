"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { registerUser } from "@/app/register/actions";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerFormSchema } from "@/lib/auth/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type RegisterFormValues = z.input<typeof registerFormSchema>;

export function RegisterForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      currency: "NOK",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await registerUser(values);
      if ("error" in result && result.error) {
        showErrorToast(
          "Could not create account",
          new Error(result.error.message),
        );
        return;
      }
    } catch (error) {
      showErrorToast("Could not create account", error);
      return;
    }

    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    router.push("/dashboard");
    router.refresh();
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <FormField id="name" label="Name" error={errors.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={formFieldDescribedBy("name", Boolean(errors.name))}
          className={cn(errors.name && "border-destructive")}
          {...register("name")}
        />
      </FormField>
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
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={formFieldDescribedBy("password", Boolean(errors.password))}
          className={cn(errors.password && "border-destructive")}
          {...register("password")}
        />
      </FormField>
      <FormField
        id="currency"
        label="Default currency"
        error={errors.currency?.message}
      >
        <Input
          id="currency"
          maxLength={3}
          aria-invalid={Boolean(errors.currency)}
          aria-describedby={formFieldDescribedBy("currency", Boolean(errors.currency))}
          className={cn(errors.currency && "border-destructive")}
          {...register("currency")}
        />
      </FormField>
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}
