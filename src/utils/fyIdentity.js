/** One FY identity + equality so the same year is not rewritten or reused across companies. */

export function fyKey(fy) {
  if (!fy) return '';
  return String(
    fy.uniqueId
    || fy.finYear
    || fy.fin_year
    || `${fy.startDate || fy.begin_date || ''}_${fy.endDate || fy.end_date || ''}`
    || fy.name
    || fy.label
    || '',
  );
}

export function fyEquals(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.uniqueId && b.uniqueId && a.uniqueId === b.uniqueId) return true;
  if (a.finYear && b.finYear && a.finYear === b.finYear) return true;
  if (a.fin_year && b.fin_year && a.fin_year === b.fin_year) return true;
  const aStart = a.startDate || a.begin_date;
  const aEnd = a.endDate || a.end_date;
  const bStart = b.startDate || b.begin_date;
  const bEnd = b.endDate || b.end_date;
  if (aStart && aEnd && aStart === bStart && aEnd === bEnd) return true;
  return fyKey(a) !== '' && fyKey(a) === fyKey(b);
}

export function matchFYInCompany(company, fy) {
  if (!fy || !company?.years?.length) return null;
  return company.years.find((y) => fyEquals(y, fy)) || null;
}
