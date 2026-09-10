/** Gym inventory: plates, dumbbells, bars, machine stacks. Feeds load rounding. */
import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { newId } from '@/lib/ids';
import type { EquipmentRow } from '@/lib/plates';

export type { EquipmentRow };
export type EquipmentKind = EquipmentRow['kind'];

export function listEquipment(): EquipmentRow[] {
  return db.select().from(schema.equipment).orderBy(asc(schema.equipment.kind), desc(schema.equipment.valueKg)).all();
}

export function addEquipment(input: { kind: EquipmentKind; valueKg: number; count: number; machineName?: string | null }): void {
  db.insert(schema.equipment)
    .values({ id: newId(), kind: input.kind, valueKg: input.valueKg, count: input.count, machineName: input.machineName ?? null })
    .run();
}

export function updateEquipment(id: string, patch: Partial<Pick<EquipmentRow, 'valueKg' | 'count' | 'machineName'>>): void {
  db.update(schema.equipment).set(patch).where(eq(schema.equipment.id, id)).run();
}

export function deleteEquipment(id: string): void {
  db.delete(schema.equipment).where(eq(schema.equipment.id, id)).run();
}
