// Сезонные события (PLAN.md §3, §10): полностью конфигурируемые, активируются по датам.
// Добавление нового события = новая запись здесь, без изменения кода.
import type { EggType } from './config';
// Награда милстоуна: монеты, кристаллы, сундук — или яйцо в инкубатор (золотое
// яйцо служит «финальным призом» события: его ждут сутки, и это ещё один возврат).
export interface EventMilestone { points: number; coins?: number; gems?: number; chest?: boolean; egg?: EggType }
export interface EventDef {
  id: string; emoji: string; // название события — в i18n по ключу `event.<id>`
  from: string; to: string; // ISO-даты включительно
  color: number; names: string[]; // событийная цепочка существ (RU; латиница — в i18n)
  milestones: EventMilestone[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'beach26', emoji: '🏖️', from: '2026-07-01', to: '2026-08-20',
    color: 0xf2a33c,
    names: ['Песчинко', 'Ракушкино', 'Крабо-Диджей', 'Пальмандо Кокосини', 'Гранд Солнциссимо'],
    milestones: [{ points: 10, coins: 300 }, { points: 30, gems: 5 }, { points: 60, coins: 1500 }, { points: 100, gems: 15, egg: 'gold' }],
  },
  {
    id: 'ny26', emoji: '🎄', from: '2026-12-15', to: '2027-01-10',
    color: 0x6fd8d8,
    names: ['Снежинко', 'Сугробино', 'Ёлко-Балерино', 'Дед-Морозандо', 'Гранд Салютиссимо'],
    milestones: [{ points: 10, coins: 300 }, { points: 30, gems: 5 }, { points: 60, coins: 1500 }, { points: 100, gems: 15, egg: 'gold' }],
  },
];

export function activeEvent(): EventDef | null {
  const t = new Date().toISOString().slice(0, 10);
  return EVENTS.find(e => e.from <= t && t <= e.to) ?? null;
}

export const daysLeft = (ev: EventDef) =>
  Math.max(1, Math.ceil((Date.parse(ev.to) + 86_400_000 - Date.now()) / 86_400_000));
