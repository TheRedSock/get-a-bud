import { and, desc, eq, ilike } from "drizzle-orm";
import { Search } from "lucide-react";

import { ClassificationIndicator } from "@/components/classification-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getClassificationUiState } from "@/lib/classification/ui-state";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatMoney } from "@/lib/utils";

type SearchPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps = {}) {
  const household = await getActiveHousehold();
  const resolvedParams = await searchParams;
  const query = resolvedParams?.q ?? "";

  const rows = query
    ? await db
        .select({
          id: transactions.id,
          source: transactions.source,
          date: transactions.date,
          amount: transactions.amount,
          currency: transactions.currency,
          merchantName: transactions.merchantName,
          description: transactions.description,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categorySource: transactions.categorySource,
          categoryConfidence: transactions.categoryConfidence,
          suggestedCategoryId: transactions.suggestedCategoryId,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(
          and(
            eq(transactions.householdId, household.householdId),
            ilike(transactions.searchText, `%${query}%`),
          ),
        )
        .orderBy(desc(transactions.date))
        .limit(100)
    : await db
        .select({
          id: transactions.id,
          source: transactions.source,
          date: transactions.date,
          amount: transactions.amount,
          currency: transactions.currency,
          merchantName: transactions.merchantName,
          description: transactions.description,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categorySource: transactions.categorySource,
          categoryConfidence: transactions.categoryConfidence,
          suggestedCategoryId: transactions.suggestedCategoryId,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(eq(transactions.householdId, household.householdId))
        .orderBy(desc(transactions.date))
        .limit(20);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-14 pl-10 text-base"
                defaultValue={query}
                name="q"
                placeholder="Find transactions, merchants, categories or notes"
              />
            </div>
          </form>
          <div className="grid gap-3">
            {rows.length ? (
              rows.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between rounded-3xl border bg-background/40 p-4"
                >
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <ClassificationIndicator
                        confidence={transaction.categoryConfidence}
                        source={transaction.categorySource}
                        state={getClassificationUiState(transaction)}
                      />
                      {transaction.categoryName ? (
                        <span className="text-xs text-muted-foreground">
                          {transaction.categoryName}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-medium">
                      {transaction.merchantName ?? transaction.description}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.source} &middot; {transaction.date}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatMoney(Number(transaction.amount), transaction.currency)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
                <p className="font-semibold">
                  {query ? "No results found" : "No transactions yet"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {query
                    ? "Try a different search term."
                    : "Transactions will appear here after your first sync or manual entry."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
