/**
 * Bills domain public API — **server-side only**.
 *
 * Client components must import from client-safe submodules:
 * - `@/lib/finance/bills/display`
 * - `@/lib/finance/bills/filters`
 * - `@/lib/finance/bills/constants`
 * - `@/lib/finance/bills/list-types`
 */

export type { BillListItem, CategoryOption } from "./list-types";
export { DEFAULT_BILL_CATEGORY_NAME } from "./constants";
export {
  getBillCategoryOptions,
  getBillsForListing,
  getPendingBillCount,
} from "./queries";
export type { BillStatusFilter } from "./filters";
export {
  BILL_SORT_KEYS,
  BILL_STATUS_FILTERS,
  buildBillListHref,
  parseBillSearchParams,
  type BillListFilters,
  type BillSortDirection,
  type BillSortKey,
} from "./filters";
export {
  daysOverdueVsDueDate,
  isBillPastEndThreshold,
} from "./status";
export {
  nextDueDateAfterPayment,
  type BillSchedulingShape,
} from "./scheduling";
export {
  clearUnapprovedBillsForReplay,
  shouldClearUnapprovedForReplayStart,
} from "./replay";
export {
  formatBillAmount,
  formatBillDueLabel,
  formatBillPatternSummary,
  formatBillScheduleLabel,
  formatAmountSignature,
  formatCadenceLabel,
  formatEventDate,
  billAmountCentsForEdit,
  type BillAmountDisplay,
  type BillScheduleInput,
} from "./display";
export {
  findBillForDetectedPattern,
  scheduleIdentityMatches,
  typicalDayOfMonthMatches,
  TYPICAL_DAY_OF_MONTH_TOLERANCE,
  type BillScheduleIdentity,
} from "./consolidation";
export { inferSuggestedCategoryFromMatches } from "./categorization";
export {
  suggestCategoriesForHouseholdBills,
  suggestCategoryForBill,
} from "./suggest-categories";
export { ensureDefaultBillCategory } from "./default-category";
