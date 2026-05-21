"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3, Loader2, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { updateAccount } from "@/app/(app)/accounts/actions";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { unwrapAction } from "@/lib/actions/client";
import { formatCents, parseMoneyToCents } from "@/lib/finance/money";
import { accountEditorFormSchema } from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type AccountKind = z.infer<typeof accountEditorFormSchema>["kind"];

type AccountEditorProps = {
  account: {
    id: string;
    name: string;
    kind: AccountKind;
    currency: string;
    currentBalanceCents: number;
    institutionName: string | null;
    isManual: boolean;
    balanceWarning?: {
      discrepancy?: boolean;
      offsetAmount?: string;
      manualTransactionsPresent?: boolean;
      manualTransactionCount?: number;
    };
  };
};

const accountKinds: AccountKind[] = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "property",
  "other",
];

export function AccountEditor({ account }: AccountEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const balanceWarning = account.balanceWarning;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof accountEditorFormSchema>>({
    resolver: zodResolver(accountEditorFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: account.name,
      kind: account.kind,
      institutionName: account.institutionName ?? "",
    },
  });

  const kind = watch("kind");

  function openEditor() {
    reset({
      name: account.name,
      kind: account.kind,
      institutionName: account.institutionName ?? "",
    });
    setEditing(true);
  }

  const save = handleSubmit(async (values) => {
    try {
      await unwrapAction(
        updateAccount({
          accountId: account.id,
          data: {
            name: values.name,
            kind: values.kind,
            institutionName: values.institutionName?.trim() || null,
          },
        }),
        "Could not update account",
      );
      toast.success("Account updated");
      setEditing(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update account", error);
    }
  });

  if (editing) {
    return (
      <form
        className="grid gap-4 rounded-3xl border bg-background/40 p-5"
        noValidate
        onSubmit={save}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            id={`account-name-${account.id}`}
            label="Name"
            error={errors.name?.message}
            className="sm:col-span-2"
          >
            <Input
              id={`account-name-${account.id}`}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={formFieldDescribedBy(
                `account-name-${account.id}`,
                Boolean(errors.name),
              )}
              className={cn(errors.name && "border-destructive")}
              {...register("name")}
            />
          </FormField>
          <FormField
            id={`account-kind-${account.id}`}
            label="Type"
            error={errors.kind?.message}
          >
            <Select
              value={kind}
              onValueChange={(value) =>
                setValue("kind", value as AccountKind, { shouldValidate: true })
              }
            >
              <SelectTrigger
                id={`account-kind-${account.id}`}
                className={cn(errors.kind && "border-destructive")}
                aria-invalid={Boolean(errors.kind)}
                aria-describedby={formFieldDescribedBy(
                  `account-kind-${account.id}`,
                  Boolean(errors.kind),
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountKinds.map((accountKind) => (
                  <SelectItem key={accountKind} value={accountKind}>
                    {accountKind.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            id={`account-institution-${account.id}`}
            label="Institution"
            error={errors.institutionName?.message}
            className="sm:col-span-3"
          >
            <Input
              id={`account-institution-${account.id}`}
              aria-invalid={Boolean(errors.institutionName)}
              aria-describedby={formFieldDescribedBy(
                `account-institution-${account.id}`,
                Boolean(errors.institutionName),
              )}
              className={cn(errors.institutionName && "border-destructive")}
              {...register("institutionName")}
            />
          </FormField>
        </div>
        <div className="flex gap-2">
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save
          </Button>
          <Button
            disabled={isSubmitting}
            type="button"
            variant="outline"
            onClick={() => setEditing(false)}
          >
            <X className="size-4" aria-hidden />
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-4 rounded-3xl border bg-background/40 p-5 sm:grid-cols-[1fr_auto] sm:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{account.name}</p>
          <Badge>{account.kind.replace("_", " ")}</Badge>
          {!account.isManual ? <Badge>bank synced</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {account.isManual
            ? "Manual account"
            : account.institutionName ?? "Synced account"}
        </p>
        {balanceWarning?.discrepancy ? (
          <p className="mt-2 text-sm text-warning-foreground">
            Added an opening balance adjustment of{" "}
            {formatCents(
              parseMoneyToCents(balanceWarning.offsetAmount ?? "0"),
              account.currency,
            )}
            .
          </p>
        ) : null}
        {balanceWarning?.manualTransactionsPresent ? (
          <p className="mt-1 text-sm text-warning-foreground">
            This synced account has {balanceWarning.manualTransactionCount} manual
            transaction
            {balanceWarning.manualTransactionCount === 1 ? "" : "s"} that may affect
            reconciliation.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:justify-items-end">
        <div className="sm:text-right">
          <p className="text-2xl font-semibold">
            {formatCents(account.currentBalanceCents, account.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            Calculated from transactions
          </p>
        </div>
        <Button type="button" variant="outline" onClick={openEditor}>
          <Edit3 className="size-4" aria-hidden />
          Edit metadata
        </Button>
      </div>
    </div>
  );
}
