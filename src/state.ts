// Центральное состояние игры + сериализация. Единственный источник правды для сейва.
import { CHAINS, ZONES } from './config';
import * as sdk from './sdk';

export interface QuestDef { id: 'merges' | 'orders' | 'spawns' | 'taps'; label: string; target: number; coins: number; gems: number }
export const QUESTS: QuestDef[] = [
  { id: 'merges', label: 'Слей существ', target: 20, coins: 400, gems: 2 },
  { id: 'orders', label: 'Выполни заказы', target: 5, coins: 600, gems: 3 },
  { id: 'spawns', label: 'Заведи существ', target: 12, coins: 300, gems: 1 },
  { id: 'taps', label: 'Покликай существ', target: 60, coins: 500, gems: 2 },
];

// 7-дневный цикл ежедневного бонуса; day 7 — «жирный» (PLAN.md §3).
export const STREAK_REWARDS: { coins?: number; gems?: number; chest?: boolean }[] = [
  { coins: 300 }, { coins: 600 }, { gems: 5 }, { coins: 1200 }, { gems: 10 }, { coins: 2500 }, { gems: 20, chest: true },
];

export const S = {
  v: 3,
  coins: 0,
  gems: 0,
  lastSeen: Date.now(),
  itemsZ: [[]] as number[][][], // поле каждой локации: [r, c, chain, level]
  zone: 0,
  zoneUnlocked: [true],
  rowUnlocked: false,
  noAds: false,
  starterBought: false,
  starterOffered: false,
  adFreeUntil: 0,
  streakDay: 0,
  streakLast: '',
  quests: { date: '', progress: { merges: 0, orders: 0, spawns: 0, taps: 0 } as Record<string, number>, claimed: [] as boolean[] },
  discovered: [] as boolean[][],
  genLast: [] as number[],
  freeChestLast: 0,
  event: { id: '', points: 0, claimed: [] as boolean[] },
  // экономика-кликер
  spawnBought: 0,           // сколько существ куплено (цена растёт)
  incomeRate: 0,            // доход за тик на момент сейва — для офлайн-начисления
  boostUntil: 0,
  boostMult: 1,
  // пользовательский контент и «Битва недели»
  customNames: {} as Record<number, string>, // свои имена легендарок по цепочкам
  battle: { week: '', side: -1, points: 0 },
  ftueDone: false,
  score: 0,
  ordersDone: 0,
};

export const today = () => new Date().toISOString().slice(0, 10);

/** ISO-неделя вида 2026-W31 — сид «Битвы недели». */
export function isoWeek(): string {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((+d - +start) / 86_400_000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

export function interstitialAllowed(): boolean {
  return !S.noAds && Date.now() > S.adFreeUntil;
}

function ensureShapes() {
  while (S.discovered.length < CHAINS.length) S.discovered.push([]);
  S.discovered.forEach((arr, i) => { while (arr.length < CHAINS[i].names.length) arr.push(false); });
  while (S.genLast.length < CHAINS.length) S.genLast.push(0);
  while (S.itemsZ.length < ZONES.length) S.itemsZ.push([]);
  while (S.zoneUnlocked.length < ZONES.length) S.zoneUnlocked.push(false);
  while (S.quests.claimed.length < QUESTS.length) S.quests.claimed.push(false);
  QUESTS.forEach(q => { S.quests.progress[q.id] ??= 0; });
  // Миграция старых сейвов: плоский items становится полем первой локации.
  const legacy = (S as any).items as number[][] | undefined;
  if (legacy?.length && !S.itemsZ.some(z => z.length)) S.itemsZ[0] = legacy;
}

export function resetDailies() {
  if (S.quests.date !== today())
    S.quests = { date: today(), progress: { merges: 0, orders: 0, spawns: 0, taps: 0 }, claimed: QUESTS.map(() => false) };
}

/** 'claim' — можно забрать бонус дня; 'lost' — серия прервана (предложить спасти за рекламу). */
export function streakStatus(): 'claim' | 'lost' | null {
  if (S.streakLast === today()) return null;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return S.streakLast === yesterday || S.streakDay === 0 ? 'claim' : 'lost';
}

export async function restore(): Promise<boolean> {
  const d = await sdk.load();
  if (d) Object.assign(S, d);
  ensureShapes();
  resetDailies();
  return !!d;
}

export function persist(force = false) {
  S.lastSeen = Date.now();
  sdk.save({ ...S }, force);
}
