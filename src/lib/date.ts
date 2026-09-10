/**
 * Dates, always in LOCAL time.
 *
 * `new Date().toISOString().slice(0,10)` is UTC and files a 05:30 IST workout under
 * yesterday. Nothing in the app may call it. Days are 'YYYY-MM-DD', instants are
 * full ISO-8601 with the local UTC offset ('2026-09-07T05:30:12.345+05:30') so they
 * sort lexicographically in SQLite and still say what the clock on the wall said.
 *
 * Pure module: no React, no DB.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
}

/** Local calendar day of a Date, 'YYYY-MM-DD'. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today's local calendar day. The only correct way to ask "what day is it". */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Full ISO-8601 instant carrying the local UTC offset. */
export function toISOInstant(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  return `${toISODate(d)}T${time}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** Now, as a local-offset ISO-8601 instant. Use for every `*_at` column. */
export function nowISO(): string {
  return toISOInstant(new Date());
}

/**
 * 'YYYY-MM-DD' -> local midnight. Tolerates a full instant by taking its date part;
 * anything else falls back to Date parsing, normalised to local midnight.
 */
export function parseISODate(iso: string): Date {
  const m = DATE_RE.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar arithmetic, DST-safe (setDate walks the local calendar). */
export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from `a` to `b`. Positive when `b` is later. */
export function daysBetweenISO(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / MS_PER_DAY);
}

/** Local minutes past midnight — the unit the notification scheduler speaks. */
export function minutesSinceMidnight(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** The Monday of the week containing `iso`. Weeks start Monday, everywhere. */
export function weekStartISO(iso: string): string {
  const d = parseISODate(iso);
  const offset = (d.getDay() + 6) % 7; // Sun(0) -> 6, Mon(1) -> 0
  return addDays(iso, -offset);
}

/** `n` consecutive days ending at `endISO` (default today), ascending. */
export function lastNDays(n: number, endISO: string = todayISO()): string[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  const count = Math.floor(n);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endISO, -i));
  return out;
}

/** '2:30'. Negative, NaN and zero all clamp to '0:00'. Hours appear past 60 min. */
export function fmtClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** 'Today' | 'Yesterday' | 'Mon 3 Mar' (+ year once it is not this year). */
export function fmtDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const label = `${WEEKDAYS[d.getDay()] ?? ''} ${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}
