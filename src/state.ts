// Центральное состояние игры + сериализация. Единственный источник правды для сейва.
import { CHAINS, ZONES, EggType } from './config';
import * as sdk from './sdk';
import { Lang, setLang } from './i18n';

// Текст задания — в i18n по ключу `quest.<id>`.
export interface QuestDef { id: 'merges' | 'wins' | 'spawns' | 'taps'; target: number; coins: number; gems: number }
export const QUESTS: QuestDef[] = [
  { id: 'merges', target: 20, coins: 400, gems: 2 },
  { id: 'wins', target: 3, coins: 600, gems: 3 },     // было «выполни заказы» — заказов больше нет
  { id: 'spawns', target: 12, coins: 300, gems: 1 },
  { id: 'taps', target: 60, coins: 500, gems: 2 },
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
  offlineVip: false,      // куплен «склад»: офлайн 100% за 5 ч вместо 50% за 2 ч
  starterBought: false,
  starterOffered: false,
  adFreeUntil: 0,
  streakDay: 0,
  streakLast: '',
  quests: { date: '', progress: { merges: 0, wins: 0, spawns: 0, taps: 0 } as Record<string, number>, claimed: [] as boolean[] },
  discovered: [] as boolean[][],
  freeLast: 0,              // когда последний раз брали бесплатное существо
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
  // арена: бойцы сняты с поля и НЕ приносят доход
  team: [] as number[][], // [chain, level], максимум 5
  cups: 0,
  cupsBest: 0,              // максимум за всё время: на нём живут пороги наград
  // сезон арены: id месяца + пиковая лига сезона (индекс в LEAGUES)
  season: { id: '', peak: 0 },
  frames: [] as string[],   // заработанные рамки профиля (ключи лиг и особые)
  bossBeaten: [] as boolean[], // боссы лиг: побеждён ли каждый (индекс = лига)
  // турнир выходных: победы за субботу+воскресенье и забранные тиры
  tour: { weekend: '', wins: 0, claimed: [] as boolean[] },
  // «Лабораторный журнал»: сезонный трек. premium — id сезона, за который куплен.
  pass: { season: '', points: 0, claimed: [] as boolean[], premium: '' },
  frame: '',                // надетая рамка
  wins: 0,
  upgrades: { atk: 0, hp: 0 }, // казарма — бесконечный монетный синк
  arenaClaimed: [] as boolean[],
  ftueDone: false,
  score: 0,
  battles: 0,               // боёв всего — якорь для interstitial
  sold: 0,                  // продано существ (для аналитики и квестов)
  // счётчики «за всё время» для достижений (дневные лежат в quests.progress)
  stats: { merges: 0, taps: 0, spawns: 0, golden: 0 } as Record<string, number>,
  achClaimed: [] as string[],  // id забранных наград (см. achId — не индексы!)
  codesUsed: [] as string[],   // промокоды одноразовые
  // инкубатор: одно яйцо «в работе» + очередь, чтобы награды не пропадали
  egg: null as { type: EggType; startedAt: number; ads: number; adsDay: string } | null,
  eggQueue: [] as EggType[],
  eggsHatched: 0,
  // платформенные предложения: оценка (рейтинг = ранжирование), ярлык, вход в аккаунт
  reviewAsked: 0,           // когда предлагали оценить (0 = никогда)
  reviewDone: false,        // отзыв отправлен — больше не предлагаем
  shortcutAsked: false,
  authAsked: 0,             // отказ от входа не повторяем чаще раза в неделю
  firstDay: '',             // дата первого запуска
  lastDay: '',              // последний день с заходом — считает daysPlayed
  daysPlayed: 0,
  // настройки игрока
  lang: '' as Lang | '',   // пусто = язык платформы/браузера
  soundOn: true,
  hapticsOn: true,
  // подсказки FTUE 2.0: каждая показывается один раз
  tips: { income: false, tap: false, arena: false, card: false },
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
  while (S.itemsZ.length < ZONES.length) S.itemsZ.push([]);
  while (S.zoneUnlocked.length < ZONES.length) S.zoneUnlocked.push(false);
  while (S.quests.claimed.length < QUESTS.length) S.quests.claimed.push(false);
  // Старые сейвы: счётчиков достижений могло не быть. Длину achClaimed не выравниваем
  // (индекс за пределами массива читается как false) — иначе state зависел бы от
  // achievements, а тот от state: лишний цикл импортов ради ничего.
  // Сейвы до перехода на id хранили флаги по индексу — такие данные читать нельзя.
  if (!Array.isArray(S.achClaimed) || S.achClaimed.some(x => typeof x !== 'string')) S.achClaimed = [];
  S.codesUsed ??= [];
  S.frames ??= [];
  S.bossBeaten ??= [];
  S.tour ??= { weekend: '', wins: 0, claimed: [] };
  S.season ??= { id: '', peak: 0 };
  S.pass ??= { season: '', points: 0, claimed: [], premium: '' };
  S.cupsBest = Math.max(S.cupsBest ?? 0, S.cups); // старые сейвы: максимум = текущие кубки
  S.stats = { merges: 0, taps: 0, spawns: 0, golden: 0, ...(S.stats ?? {}) };
  QUESTS.forEach(q => { S.quests.progress[q.id] ??= 0; });
  // старые сейвы: подсказки/настройки могли не существовать
  const tips = (S.tips ?? {}) as Partial<typeof S.tips>;
  S.tips = { income: !!tips.income, tap: !!tips.tap, arena: !!tips.arena, card: !!tips.card };
  S.soundOn ??= true;
  S.hapticsOn ??= true;
  // Миграция старых сейвов: плоский items становится полем первой локации.
  const legacy = (S as any).items as number[][] | undefined;
  if (legacy?.length && !S.itemsZ.some(z => z.length)) S.itemsZ[0] = legacy;
}

export function resetDailies() {
  if (S.quests.date !== today())
    S.quests = { date: today(), progress: { merges: 0, wins: 0, spawns: 0, taps: 0 }, claimed: QUESTS.map(() => false) };
}

/** 'claim' — можно забрать бонус дня; 'lost' — серия прервана (предложить спасти за рекламу). */
export function streakStatus(): 'claim' | 'lost' | null {
  if (S.streakLast === today()) return null;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return S.streakLast === yesterday || S.streakDay === 0 ? 'claim' : 'lost';
}

/** Календарь заходов: сколько РАЗНЫХ дней игрок открывал игру (не подряд — всего). */
function touchDay() {
  if (S.lastDay === today()) return;
  S.firstDay ||= today();
  S.lastDay = today();
  S.daysPlayed++;
}

export async function restore(): Promise<boolean> {
  const d = await sdk.load();
  if (d) Object.assign(S, d);
  ensureShapes();
  touchDay();
  resetDailies();
  if (S.lang) setLang(S.lang); // выбор игрока важнее языка платформы
  return !!d;
}

/** Полный сброс прогресса (настройки языка/звука сохраняем — это не прогресс). */
export function resetProgress() {
  const keep = { lang: S.lang, soundOn: S.soundOn, hapticsOn: S.hapticsOn };
  localStorage.removeItem('save');
  Object.assign(S, {
    coins: 0, gems: 0, itemsZ: [[]], zone: 0, zoneUnlocked: [true], rowUnlocked: false,
    streakDay: 0, streakLast: '', quests: { date: '', progress: { merges: 0, wins: 0, spawns: 0, taps: 0 }, claimed: [] },
    discovered: [], freeLast: 0, freeChestLast: 0, event: { id: '', points: 0, claimed: [] },
    spawnBought: 0, incomeRate: 0, boostUntil: 0, boostMult: 1, customNames: {},
    battle: { week: '', side: -1, points: 0 }, team: [], cups: 0, cupsBest: 0, wins: 0,
    season: { id: '', peak: 0 }, frames: [], frame: '', bossBeaten: [],
    tour: { weekend: '', wins: 0, claimed: [] },
    pass: { season: '', points: 0, claimed: [], premium: '' },
    upgrades: { atk: 0, hp: 0 }, arenaClaimed: [], score: 0, battles: 0, sold: 0,
    starterOffered: false, tips: { income: false, tap: false, arena: false, card: false },
    egg: null, eggQueue: [], eggsHatched: 0,
    stats: { merges: 0, taps: 0, spawns: 0, golden: 0 }, achClaimed: [], codesUsed: [], ...keep,
  });
  ensureShapes();
  persist(true);
}

export function persist(force = false) {
  S.lastSeen = Date.now();
  sdk.save({ ...S }, force);
}
