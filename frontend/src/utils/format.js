const NUMBER_OPTIONS = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const QTY_OPTIONS = {
  maximumFractionDigits: 3,
};

export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', NUMBER_OPTIONS)}`;
}

export function formatQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN', QTY_OPTIONS);
}

export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// Backend business dates are date-only. Strip any time/timezone component
// instead of converting, so the displayed day never silently shifts.
export function formatDateOnly(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '—';
}

export function formatDateTime(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function isNumber(value) {
  return Number.isFinite(Number(value));
}