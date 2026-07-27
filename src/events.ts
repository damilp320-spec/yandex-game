// Сезонные события (PLAN.md §3, §10): полностью конфигурируемые, активируются по датам.
// Добавление нового события = новая запись здесь, без изменения кода.
import type { EggType } from './config';
/**
 * Награда милстоуна: кристаллы, сундук, яйцо в инкубатор (золотое служит «финальным
 * призом» — его ждут сутки, и это ещё один возврат) или монеты.
 *
 * Монеты задаются в МИНУТАХ дохода поля (`coinsMin`), а не фиксированной суммой: как и
 * в журнале с турниром, фиксированные 1500🪙 к третьей неделе не значат ничего, а
 * «полторы минуты дохода» ценны на любом этапе.
 */
export interface EventMilestone { points: number; coinsMin?: number; gems?: number; chest?: boolean; egg?: EggType }
export interface EventDef {
  id: string; emoji: string; // название события — в i18n по ключу `event.<id>`
  from: string; to: string; // ISO-даты включительно
  color: number; names: string[]; // событийная цепочка существ (RU; латиница — в i18n)
  milestones: EventMilestone[];
}

/**
 * Календарь. Пересечений быть не должно: `activeEvent` берёт первое подходящее, так что
 * наложение дат тихо спрячет одно из событий. Ритм — событие раз в 1–2 месяца, к декабрю
 * (eCPM ×1.5–2 у платформы) обязательно новогоднее.
 *
 * У каждого события своя форма спрайта в `sprites.ts` (по `cfg.id`): событие, отличающееся
 * только цветом, читается как «то же самое другого оттенка» и не даёт ощущения апдейта.
 */
export const EVENTS: EventDef[] = [
  {
    id: 'beach26', emoji: '🏖️', from: '2026-07-01', to: '2026-08-20',
    color: 0xf2a33c,
    names: ['Песчинко', 'Ракушкино', 'Крабо-Диджей', 'Пальмандо Кокосини', 'Гранд Солнциссимо'],
    milestones: [{ points: 10, coinsMin: 1 }, { points: 30, gems: 5 }, { points: 60, coinsMin: 3 }, { points: 100, gems: 15, egg: 'gold' }],
  },
  {
    id: 'fall26', emoji: '🍂', from: '2026-09-05', to: '2026-10-05',
    color: 0xd07a2e,
    names: ['Жёлудик', 'Листопадик', 'Грибандо', 'Опято Данцато', 'Гранд Мухоморио'],
    milestones: [{ points: 10, coinsMin: 1 }, { points: 30, gems: 6 }, { points: 60, chest: true }, { points: 100, gems: 15, egg: 'rare' }],
  },
  {
    id: 'hw26', emoji: '🎃', from: '2026-10-24', to: '2026-11-05',
    color: 0xe07a1c,
    names: ['Семечко Тыквы', 'Тыквёнок', 'Тыквандо', 'Призрачелло Буу', 'Гранд Хэллоуиссимо'],
    // Хэллоуин короче месяца, поэтому пороги те же, а награды заметно жирнее: событие
    // должно окупаться за две недели, иначе его просто не успевают пройти.
    milestones: [{ points: 10, coinsMin: 2 }, { points: 30, gems: 10 }, { points: 60, chest: true }, { points: 100, gems: 30, egg: 'gold' }],
  },
  {
    id: 'ny26', emoji: '🎄', from: '2026-12-15', to: '2027-01-10',
    color: 0x6fd8d8,
    names: ['Снежинко', 'Сугробино', 'Ёлко-Балерино', 'Дед-Морозандо', 'Гранд Салютиссимо'],
    milestones: [{ points: 10, coinsMin: 1 }, { points: 30, gems: 5 }, { points: 60, coinsMin: 3 }, { points: 100, gems: 15, egg: 'gold' }],
  },
];

export function activeEvent(): EventDef | null {
  const t = new Date().toISOString().slice(0, 10);
  return EVENTS.find(e => e.from <= t && t <= e.to) ?? null;
}

export const daysLeft = (ev: EventDef) =>
  Math.max(1, Math.ceil((Date.parse(ev.to) + 86_400_000 - Date.now()) / 86_400_000));
