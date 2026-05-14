/**
 * Business day and Norwegian public holiday helpers for Phase 2B.
 *
 * Norwegian public holidays are hardcoded for the current + next year.
 * Easter dates are computed algorithmically (they shift the dependent holidays).
 */

// ---------------------------------------------------------------------------
// Easter computation (Anonymous Gregorian algorithm)
// ---------------------------------------------------------------------------

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian
 * algorithm. Returns a Date in UTC.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

function addDaysToDate(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// ---------------------------------------------------------------------------
// Norwegian public holidays
// ---------------------------------------------------------------------------

/**
 * Return all Norwegian public holidays for a given year as YYYY-MM-DD strings.
 */
export function norwegianHolidays(year: number): Set<string> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const easter = easterSunday(year);

  const holidays = new Set([
    // Fixed holidays
    `${year}-01-01`, // New Year's Day
    `${year}-05-01`, // Labour Day
    `${year}-05-17`, // Constitution Day
    `${year}-12-25`, // Christmas Day
    `${year}-12-26`, // St. Stephen's Day

    // Easter-dependent moveable holidays
    fmt(addDaysToDate(easter, -3)), // Maundy Thursday
    fmt(addDaysToDate(easter, -2)), // Good Friday
    fmt(easter),                    // Easter Sunday
    fmt(addDaysToDate(easter, 1)),  // Easter Monday
    fmt(addDaysToDate(easter, 39)), // Ascension Day
    fmt(addDaysToDate(easter, 49)), // Whit Sunday
    fmt(addDaysToDate(easter, 50)), // Whit Monday
  ]);

  return holidays;
}

// Cache holidays per year to avoid recomputation
const holidayCache = new Map<number, Set<string>>();

function getHolidays(year: number): Set<string> {
  let cached = holidayCache.get(year);
  if (!cached) {
    cached = norwegianHolidays(year);
    holidayCache.set(year, cached);
  }
  return cached;
}

/**
 * Check whether a YYYY-MM-DD date string is a Norwegian public holiday.
 */
export function isNorwegianHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4), 10);
  return getHolidays(year).has(dateStr);
}

/**
 * Adjust a predicted due date for weekends and Norwegian public holidays.
 *
 * If the date falls on a Saturday, shift backward to the nearest preceding
 * business day. If the date falls on a Sunday or public holiday, shift
 * forward to the next business day.
 *
 * The direction is locked based on the initial day to prevent oscillation
 * (e.g., Saturday → holiday Friday → Saturday → …).
 */
export function adjustForBusinessDays(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const maxIterations = 10; // prevent infinite loops on consecutive holidays

  // Saturday: search backward; Sunday/holiday: search forward
  const direction = d.getUTCDay() === 6 ? -1 : 1;

  for (let i = 0; i < maxIterations; i++) {
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);

    if (dow !== 0 && dow !== 6 && !isNorwegianHoliday(iso)) {
      return iso;
    }

    d.setUTCDate(d.getUTCDate() + direction);
  }

  return d.toISOString().slice(0, 10);
}

/**
 * Add a number of days to a YYYY-MM-DD date string.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the next occurrence of a specific day-of-month after a given date,
 * respecting cadence (monthly, quarterly, yearly).
 */
export function nextCadenceDate(
  afterDate: string,
  dayOfMonth: number,
  cadence: "monthly" | "quarterly" | "semi_annual" | "yearly",
): string {
  const d = new Date(afterDate + "T12:00:00Z");
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();

  const monthStep =
    cadence === "yearly"
      ? 12
      : cadence === "semi_annual"
        ? 6
        : cadence === "quarterly"
          ? 3
          : 1;

  // Move to the next period
  month += monthStep;
  if (month >= 12) {
    year += Math.floor(month / 12);
    month = month % 12;
  }

  // Clamp day to the last day of the target month
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clampedDay = Math.min(dayOfMonth, maxDay);

  return new Date(Date.UTC(year, month, clampedDay)).toISOString().slice(0, 10);
}
