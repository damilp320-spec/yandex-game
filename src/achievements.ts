// Достижения: витрина гордости для счётчиков, которые игра и так копила молча.
// Дают средний горизонт целей («ещё 12 побед») между дневными квестами и лигами,
// а три «социальных» с нарочно смешными названиями — повод для скриншота.
//
// Названия берутся из i18n по метрике с подстановкой порога (`ach.<metric>` с {n}),
// поэтому новый порог добавляется одной строкой и не требует перевода.
import { S } from './state';
import { SECRET_CHAIN } from './config';

export interface Achievement { metric: string; at: number; gems: number; share?: boolean }

/** Значение метрики «за всё время». Считаем из того, что уже есть в сейве. */
export const METRICS: Record<string, () => number> = {
  merges: () => S.stats.merges,
  taps: () => S.stats.taps,
  spawns: () => S.stats.spawns,
  golden: () => S.stats.golden,
  wins: () => S.wins,
  cups: () => S.cups,
  eggs: () => S.eggsHatched,
  sold: () => S.sold,
  legends: () => S.discovered.filter(ch => ch[5]).length,
  pedia: () => S.discovered.flat().filter(Boolean).length,
  zones: () => S.zoneUnlocked.filter(Boolean).length,
  // Секрет и «спагетти-магнат» — не счётчики, а факты: открыл или нет.
  secret: () => (S.discovered[SECRET_CHAIN]?.[0] ? 1 : 0),
  spaghetti: () => (S.discovered[11]?.[5] ? 1 : 0),
};

/** Порядок в списке = порядок «взросления» игрока, не по алфавиту. */
export const ACHIEVEMENTS: Achievement[] = [
  { metric: 'merges', at: 1, gems: 2 },
  { metric: 'taps', at: 100, gems: 2 },
  { metric: 'wins', at: 1, gems: 2 },
  { metric: 'spawns', at: 50, gems: 3 },
  { metric: 'merges', at: 100, gems: 3 },
  { metric: 'wins', at: 10, gems: 4 },
  { metric: 'zones', at: 2, gems: 4 },
  { metric: 'taps', at: 1000, gems: 5 },
  { metric: 'cups', at: 500, gems: 5 },
  { metric: 'legends', at: 1, gems: 5 },
  { metric: 'pedia', at: 25, gems: 5 },
  { metric: 'eggs', at: 5, gems: 5 },
  { metric: 'spawns', at: 500, gems: 8 },
  { metric: 'merges', at: 1000, gems: 8 },
  { metric: 'golden', at: 25, gems: 8 },
  { metric: 'sold', at: 100, gems: 8, share: true },
  { metric: 'wins', at: 50, gems: 10 },
  { metric: 'taps', at: 10_000, gems: 12 },
  { metric: 'cups', at: 1500, gems: 12 },
  { metric: 'merges', at: 5000, gems: 15 },
  { metric: 'legends', at: 5, gems: 15 },
  { metric: 'pedia', at: 50, gems: 15 },
  { metric: 'zones', at: 4, gems: 15 },
  { metric: 'eggs', at: 25, gems: 15 },
  { metric: 'spaghetti', at: 1, gems: 20, share: true },
  { metric: 'wins', at: 200, gems: 20 },
  { metric: 'cups', at: 3000, gems: 25 },
  // Шанс секрета — 6,7%, награда тоже: сам мем и есть награда.
  { metric: 'secret', at: 1, gems: 67, share: true },
];

export const achValue = (a: Achievement) => METRICS[a.metric]?.() ?? 0;
export const achDone = (a: Achievement) => achValue(a) >= a.at;
export const achClaimable = (a: Achievement, i: number) => achDone(a) && !S.achClaimed[i];
export const achCountDone = () => ACHIEVEMENTS.filter((a, i) => S.achClaimed[i] || achDone(a)).length;
export const anyAchClaimable = () => ACHIEVEMENTS.some(achClaimable);
