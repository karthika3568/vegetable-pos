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

/**
 * Canonical local date "DD-MM-YYYY" (e.g. 18-09-2026). Backend stores local
 * wall-clock DATETIME strings; parse as LOCAL and never bounce through
 * UTC/ISO, so the day and hour never silently shift (no double conversion).
 */
export function formatDate(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * "12:35 PM" from a backend wall-clock value. The value may be a bare
 * "HH:MM(:SS)" or a full "YYYY-MM-DD HH:MM:SS". Parsed as LOCAL — never
 * routed through UTC (avoids the classic double/timezone time shift).
 */
export function formatTime(value) {
  if (!value) return '—';
  const s = String(value);
  const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '—';
  let hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return '—';
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = formatDate(value);
  const time = formatTime(value);
  if (date === '—' && time === '—') return '—';
  if (date !== '—' && time !== '—') return `${date}, ${time}`;
  return date !== '—' ? date : time;
}

export function isNumber(value) {
  return Number.isFinite(Number(value));
}