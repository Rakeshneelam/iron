/**
 * Plain export (docs/07 — "build this first"): every table to one JSON file and
 * per-table CSVs, written into a folder he picks. No auth, no key, no network.
 * Uses the Android folder picker because React Native's Share cannot share files
 * on Android and expo-sharing is not installed.
 */
import { Directory } from 'expo-file-system';

import { expoDb } from '@/db/client';
import { nowISO, todayISO } from '@/lib/date';

const TABLES = [
  'exercise', 'exercise_link', 'equipment', 'routine', 'routine_day', 'routine_slot', 'session', 'set_log',
  'exercise_session_stat', 'weigh_in', 'measurement', 'food', 'recipe', 'recipe_item', 'meal_log', 'water_log', 'setting',
] as const;

type Row = Record<string, unknown>;

function readTable(name: string): Row[] {
  return expoDb.getAllSync<Row>(`SELECT * FROM "${name}"`);
}

export function buildJSONDump(): string {
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) tables[t] = readTable(t);
  return JSON.stringify({ app: 'iron', exportedAt: nowISO(), tables }, null, 2);
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows: Row[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const lines = [cols.map(cell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  return lines.join('\r\n');
}

export function buildCSVs(): { name: string; csv: string }[] {
  return TABLES.map((t) => ({ name: t, csv: toCSV(readTable(t)) }));
}

async function pickFolder(): Promise<Directory | null> {
  try {
    return await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelled
  }
}

/** Returns the number of files written, or null if he cancelled the picker. */
export async function exportAll(): Promise<number | null> {
  const dir = await pickFolder();
  if (!dir) return null;
  const stamp = todayISO();
  dir.createFile(`iron-${stamp}.json`, 'application/json').write(buildJSONDump());
  const csvs = buildCSVs();
  for (const { name, csv } of csvs) dir.createFile(`iron-${stamp}-${name}.csv`, 'text/csv').write(csv);
  return csvs.length + 1;
}

export async function exportJSON(): Promise<number | null> {
  const dir = await pickFolder();
  if (!dir) return null;
  dir.createFile(`iron-${todayISO()}.json`, 'application/json').write(buildJSONDump());
  return 1;
}

export async function exportCSV(): Promise<number | null> {
  const dir = await pickFolder();
  if (!dir) return null;
  const stamp = todayISO();
  const csvs = buildCSVs();
  for (const { name, csv } of csvs) dir.createFile(`iron-${stamp}-${name}.csv`, 'text/csv').write(csv);
  return csvs.length;
}
