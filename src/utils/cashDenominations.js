export const INR_NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export function sumDenomCounts(counts) {
  return Object.entries(counts || {}).reduce((sum, [face, qty]) => sum + Number(face) * Math.max(0, Number(qty) || 0), 0);
}

export function emptyDenomCounts(notes = INR_NOTES) {
  return Object.fromEntries(notes.map(n => [String(n), 0]));
}

export function autoSplitAmount(target, notes = INR_NOTES) {
  let remaining = Math.round(Number(target || 0) * 100) / 100;
  const out = emptyDenomCounts(notes);
  for (const face of notes) {
    if (remaining < face) continue;
    const qty = Math.floor(remaining / face);
    out[String(face)] = qty;
    remaining = Math.round((remaining - qty * face) * 100) / 100;
  }
  return out;
}
