/** Dashboard period filters → ISO date range (inclusive, ending today). Same as mobile `periodDates.ts`. */
const PERIOD_DAYS = { '7D': 7, '1M': 30, '3M': 90, '6M': 180 };

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute from/to for dashboard/cashflow API calls from the selected period pill.
 * When FY bounds are provided, the window is clamped inside that FY.
 * For a past FY (period would fall after FY end), uses the last N days of that FY.
 */
export function resolvePeriodDates(period, fyBounds) {
  const days = PERIOD_DAYS[period] ?? 7;
  const fyFrom = fyBounds?.from?.slice(0, 10) || null;
  const fyTo = fyBounds?.to?.slice(0, 10) || null;

  const today = new Date();
  let to = toISO(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  let from = toISO(fromDate);

  if (fyFrom && fyTo) {
    if (from > fyTo) {
      const end = new Date(`${fyTo}T12:00:00`);
      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));
      from = toISO(start);
      to = fyTo;
    }
    if (to > fyTo) to = fyTo;
    if (from < fyFrom) from = fyFrom;
    if (to < fyFrom) to = fyFrom;
    if (from > to) from = to;
  }

  return { from, to };
}

export const DASHBOARD_PERIOD_CODE = {
  '7 Days': '7D',
  '1 Month': '1M',
  '3 Months': '3M',
  '6 Months': '6M',
};
