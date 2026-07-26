// Центральное состояние игры + сериализация. Единственный источник правды для сейва.
import { CHAINS, ENERGY, ZONES } from './config';
import * as sdk from './sdk';

export interface QuestDef { id: 'merges' | 'orders' | 'spawns'; label: string; target: number; coins: number; gems: number }
export const QUESTS: QuestDef[] = [
  { id: 'merges', label: 'Слей существ', target: 20, coins: 200, gems: 2 },
  { id: 'orders', label: 'Выполни заказы', target: 5, coins: 300, gems: 3 },
  { id: 'spawns', label: 'Создай существ', target: 15, coins: 150, gems: 1 },
];

// 7-дневный цикл ежедневного бонуса; day 7 — «жирный» (PLAN.md §3).
export const STREAK_REWARDS: { coins?: number; gems?: number; chest?: boolean }[] = [
  { coins: 100 }, { coins: 200 }, { gems: 5 }, { coins: 400 }, { gems: 10 }, { coins: 800 }, { gems: 20, chest: true },
];

export const S = {
  v: 2,
  coins: 0,
  gems: 0,
  energy: ENERGY.max,
  lastSeen: Date.now(),
  itemsZ: [[], []] as number[][][], // поле каждой локации: [r, c, chain, level]
  zone: 0,
  zoneUnlocked: [true, false],
  rowUnlocked: false,
  noAds: false,
  starterBought: false,
  starterOffered: false,
  adFreeUntil: 0, // стартер-пак даёт 7 дней без interstitial
  streakDay: 0,
  streakLast: '',
  quests: { date: '', progress: { merges: 0, orders: 0, spawns: 0 } as Record<string, number>, claimed: [false, false, false] },
  discovered: [] as boolean[][],
  genLast: [0, 0, 0, 0],
  freeChestLast: 0,
  event: { id: '', points: 0, claimed: [] as boolean[] },
  ftueDone: false,
  score: 0,
  ordersDone: 0,
};

export const today = () => new Date().toISOString().slice(0, 10);

export function interstitialAllowed(): boolean {
  return !S.noAds && Date.now() > S.adFreeUntil;
}

function ensureShapes() {
  while (S.discovered.length < CHAINS.length) S.discovered.push([]);
  S.discovered.forEach((arr, i) => { while (arr.length < CHAINS[i].names.length) arr.push(false); });
  while (S.genLast.length < CHAINS.length) S.genLast.push(0);
  while (S.itemsZ.length < ZONES.length) S.itemsZ.push([]);
  while (S.zoneUnlocked.length < ZONES.length) S.zoneUnlocked.push(false);
  // Миграция старых сейвов: плоский items становится полем первой локации.
  const legacy = (S as any).items as number[][] | undefined;
  if (legacy?.length && !S.itemsZ.some(z => z.length)) S.itemsZ[0] = legacy;
}

export function resetDailies() {
  if (S.quests.date !== today())
    S.quests = { date: today(), progress: { merges: 0, orders: 0, spawns: 0 }, claimed: [false, false, false] };
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
