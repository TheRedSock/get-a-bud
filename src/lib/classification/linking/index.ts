/**
 * Phase 2A — Cross-account transfer linking.
 *
 * Detects when money moves between a user's own accounts (checking → savings,
 * checking → investment fund) and links the two sides together.
 *
 * Transfer candidates are identified by `transactionType`:
 *   - internal_transfer
 *   - investment
 *
 * `loan_payment` is NOT a transfer candidate for MVP — it stays as an expense.
 * `p2p_payment` and `bank_transfer` to other people are NOT transfers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransferCandidate {
  id: string;
  householdId: string;
  accountId: string;
  amount: string;
  currency: string;
  date: string;
  transactionType: string | null;
  transferGroupId: string | null;
}

export interface TransferMatch {
  sourceId: string;
  destinationId: string;
  groupId: string;
  confidence: number;
  autoConfirm: boolean;
}

export function transferGroupIdForPair(sourceId: string, destinationId: string) {
  return `transfer:${sourceId}:${destinationId}`;
}

/**
 * Transaction types eligible for transfer linking.
 * bank_transfer is deliberately excluded — it's often a payment to someone else.
 * Only internal_transfer and investment are reliably own-account movements.
 */
const TRANSFER_TYPES = new Set(["internal_transfer", "investment"]);

/**
 * Transaction types that should be excluded from budget even without a
 * matched counterpart (e.g., the other account isn't synced).
 */
export const AUTO_EXCLUDE_TYPES = new Set([
  "internal_transfer",
  "investment",
]);

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Check whether two transaction types are compatible for linking.
 *
 * internal_transfer <-> internal_transfer
 * investment <-> investment
 */
function typesCompatible(
  typeA: string | null,
  typeB: string | null,
): boolean {
  if (!typeA || !typeB) return false;
  // Both must be the same transfer-eligible type
  return typeA === typeB && TRANSFER_TYPES.has(typeA);
}

/**
 * Compute days between two date strings (YYYY-MM-DD).
 */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs(
    Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

/**
 * Score a candidate match based on amount closeness and date proximity.
 *
 * Returns a confidence score 0–1 or null if the pair doesn't qualify.
 */
function scoreMatch(
  candidate: TransferCandidate,
  counterpart: TransferCandidate,
): number | null {
  // Must be in the same household
  if (candidate.householdId !== counterpart.householdId) return null;

  // Must be different accounts
  if (candidate.accountId === counterpart.accountId) return null;

  // Must be same currency (cross-currency needs manual linking)
  if (candidate.currency !== counterpart.currency) return null;

  // Must have opposite signs
  const amtA = Number(candidate.amount);
  const amtB = Number(counterpart.amount);
  if (amtA === 0 || amtB === 0) return null;
  if (Math.sign(amtA) === Math.sign(amtB)) return null;

  // Amount tolerance
  const absA = Math.abs(amtA);
  const absB = Math.abs(amtB);
  const amountDiff = Math.abs(absA - absB);
  const exactAmount = amountDiff <= 0.01;
  const nearAmount = amountDiff / Math.max(absA, absB) <= 0.01;

  if (!exactAmount && !nearAmount) return null;

  // Date tolerance
  const dateDiff = daysBetween(candidate.date, counterpart.date);
  if (dateDiff > 2) return null;

  // Types must be compatible
  if (!typesCompatible(candidate.transactionType, counterpart.transactionType)) {
    return null;
  }

  // Score based on spec
  if (exactAmount && dateDiff === 0) return 0.95;
  if (exactAmount && dateDiff === 1) return 0.85;
  if (exactAmount && dateDiff === 2) return 0.7;
  if (nearAmount && dateDiff === 0) return 0.6;

  // Near amount with date offset — lower confidence
  if (nearAmount && dateDiff <= 2) return 0.5;

  return null;
}

/**
 * Find transfer matches among a set of candidates within one household.
 *
 * Returns matched pairs with confidence scores and group IDs.
 * Candidates already linked (transferGroupId not null) are skipped.
 */
export function findTransferMatches(
  candidates: TransferCandidate[],
): TransferMatch[] {
  const matches: TransferMatch[] = [];
  const matched = new Set<string>();

  // Separate by sign: debits (source) and credits (destination)
  const debits = candidates.filter(
    (c) => Number(c.amount) < 0 && !c.transferGroupId,
  );
  const credits = candidates.filter(
    (c) => Number(c.amount) > 0 && !c.transferGroupId,
  );

  // For each debit, find the best matching credit
  for (const debit of debits) {
    if (matched.has(debit.id)) continue;

    let bestCredit: TransferCandidate | null = null;
    let bestScore = 0;

    for (const credit of credits) {
      if (matched.has(credit.id)) continue;

      const score = scoreMatch(debit, credit);
      if (score !== null && score > bestScore) {
        bestScore = score;
        bestCredit = credit;
      }
    }

    if (bestCredit && bestScore >= 0.5) {
      matches.push({
        sourceId: debit.id,
        destinationId: bestCredit.id,
        groupId: transferGroupIdForPair(debit.id, bestCredit.id),
        confidence: bestScore,
        autoConfirm: bestScore >= 0.85,
      });
      matched.add(debit.id);
      matched.add(bestCredit.id);
    }
  }

  return matches;
}

/**
 * Identify one-sided transfer candidates that should be excluded from
 * the budget even without a matched counterpart.
 *
 * Returns IDs of transactions that are clearly transfers (internal_transfer
 * or investment) but have no match — the other account may not be synced.
 */
export function findOneSidedTransfers(
  candidates: TransferCandidate[],
  matchedIds: Set<string>,
): string[] {
  return candidates
    .filter(
      (c) =>
        !matchedIds.has(c.id) &&
        !c.transferGroupId &&
        c.transactionType !== null &&
        AUTO_EXCLUDE_TYPES.has(c.transactionType),
    )
    .map((c) => c.id);
}

/**
 * Check if a transaction type is a transfer candidate.
 */
export function isTransferCandidate(transactionType: string | null): boolean {
  if (!transactionType) return false;
  return TRANSFER_TYPES.has(transactionType);
}
