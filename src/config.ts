// Вся тематика и баланс — здесь. Смена тренда/сеттинга = правка этого файла (PLAN.md §13).
export const W = 720;
export const H = 1280;

// Номер счётчика Яндекс.Метрики; 0 = выключено (события уходят в консоль).
export const METRICA_ID = 0;

export const FONT = 'Rubik, "Segoe UI", Arial, sans-serif';

// Версия для панели настроек (помогает в поддержке: игрок может назвать её в отзыве).
export const VERSION = '1.0';

// Секретный «67»: шанс из сундука. 6,7% — сам шанс является мемом.
export const SECRET_CHANCE = 0.067;
export const SECRET_CHAIN = 8; // индекс цепочки sixseven в CHAINS

// Поле 5×6: крупные существа. 6-й ряд (index 5) заперт — «space pressure» (PLAN.md §16).
// Клетки выросли с 126 до 140: место освободилось после переноса генераторов вниз и
// удаления полосы заказов — оно ушло в размер существ, их проще тащить пальцем.
export const GRID = { cols: 5, rows: 6, cell: 140, x: 10, y: 190 };

// Экономика в духе Steal a Brainrot: существа на поле пассивно приносят монеты.
export const INCOME = {
  periodMs: 5000,      // тик дохода
  levelMult: 2.5,      // множитель дохода за уровень
  /**
   * Офлайн-доход в двух уровнях. Полная ставка на 8 часов делала сон выгоднее игры
   * (17.9M за ночь при доходе 3.1k за тик — измерено в sim), поэтому бесплатный
   * уровень платит половину ставки за 2 часа, а покупка «склада» — полную за 5.
   *
   * Принцип «всё платное дублируется бесплатным путём» соблюдён: ставку до 100%
   * поднимает rewarded-реклама в том же окне (кнопка «Забрать ×2»), покупка
   * добавляет только длительность. И она не даёт силы в бою — экономит время.
   */
  offlineFree: { rate: 0.5, hours: 2 },
  offlinePaid: { rate: 1, hours: 5 },
  boostAdMult: 2, boostAdMs: 120_000,    // rewarded-буст
  boostGemMult: 3, boostGemMs: 600_000,  // буст за кристаллы
};

/**
 * Цена существа: растёт как в кликерах, но упирается в «одну минуту дохода поля».
 *
 * Фиксированный рост 1.13ⁿ без потолка делал кнопку мёртвой (440k при доходе
 * 180/мин к 14-му дню). Фиксированный потолок 3000 решил это, но создал обратную
 * крайность: при миллионах на руках существа стали бесплатными по сути, поставка
 * — неограниченной, и легендарка собиралась в первый же день. Привязка потолка к
 * доходу самобалансируется: покупка всегда стоит примерно минуту дохода.
 */
export const SPAWN = { baseCost: 25, growth: 1.07, minCap: 3000 };

export const spawnCostOf = (bought: number, incomePerMin = 0) =>
  Math.floor(Math.min(
    SPAWN.baseCost * Math.pow(SPAWN.growth, bought),
    Math.max(SPAWN.minCap, incomePerMin),
  ));

// «Золотой брейнрот» пролетает по экрану — тап даёт 2 минуты дохода разом.
export const GOLDEN = { intervalMs: 90_000, lifeMs: 8000, rewardSec: 120, minReward: 100 };

export const OFFLINE_MIN_COINS = 5;

// Interstitial только на стыках: заказов больше нет, поэтому якорь — конец боя.
export const INTERSTITIAL = { minGapMs: 180_000, sessionWarmupMs: 180_000, everyNBattles: 3 };

// Бесплатное существо по кулдауну. Раньше это были четыре кнопки-генератора вверху
// экрана (по 90 с на цепочку) — тянуться к ним большим пальцем неудобно, поэтому
// они слиты в одну кнопку внизу. 25 с ≈ та же суммарная выдача, что 4 × 90 с.
export const GEN = { cooldownMs: 25_000 };

/**
 * Инкубатор: «встреча по расписанию» — сильнейший крючок возврата в казуалках.
 * Яйцо выдаётся за бой или новую лигу и вылупляется через часы, так что игрок
 * уходит из сессии с конкретной причиной вернуться, а не с абстрактным «потом».
 *
 * Уровень — индекс в цепочке (level 4 = эпический). Секрет — шанс «67» из яйца.
 */
export const EGGS = {
  common: { hours: 2, level: 2, gems: 0, secret: 0, color: 0xb8c4d8 },
  rare: { hours: 8, level: 3, gems: 10, secret: 0, color: 0x7fe0d8 },
  gold: { hours: 24, level: 4, gems: 25, secret: SECRET_CHANCE, color: 0xffd04a },
};
export type EggType = keyof typeof EGGS;

/**
 * Ускорение яйца: реклама снимает час (не больше трёх раз в день), кристаллы —
 * по получасу за штуку. Бесплатный путь — просто подождать, поэтому ускорение
 * продаёт время, а не силу. Очередь из двух яиц нужна, чтобы награда за бой
 * никогда не пропадала: занятый инкубатор её не съедает, а откладывает.
 */
export const INCUBATOR = {
  adMinutes: 60, adPerDay: 3,
  gemMinutes: 30, gemCost: 1,
  winEvery: 5,          // каждая N-я победа на арене даёт обычное яйцо
  queueMax: 2,
};

/**
 * Промокоды: канал владельца в соцсетях и измеримый источник трафика — метка кода
 * уходит в аналитику, и видно, какой пост сработал. Проверка обычным списком, без
 * криптографии: награды маленькие, а «подобранный» код даёт ровно то же, что пост.
 *
 * Награды только в кристаллах и яйцах: фиксированные суммы монет обесцениваются
 * за неделю, а кристаллы и яйца остаются ценными на любом этапе.
 */
export interface PromoCode { code: string; gems?: number; egg?: EggType; until: string }
export const PROMO: PromoCode[] = [
  { code: 'SIXSEVEN', gems: 67, until: '2026-12-31' },
  { code: 'BRAINROT', gems: 30, egg: 'common', until: '2026-12-31' },
  { code: 'CAPYBARA', gems: 25, egg: 'rare', until: '2026-12-31' },
  { code: 'TRALALA', egg: 'gold', until: '2026-12-31' },
  { code: 'LABMERGE', gems: 40, until: '2026-12-31' },
];

/** Действующий код по вводу игрока (регистр и пробелы не важны). */
export const promoByCode = (raw: string): PromoCode | null => {
  const code = raw.trim().toUpperCase();
  const day = new Date().toISOString().slice(0, 10);
  return PROMO.find(p => p.code === code && p.until >= day) ?? null;
};

/**
 * Турнир выходных: суббота и воскресенье. Сделан НАДСТРОЙКОЙ над обычными боями
 * арены, а не отдельным режимом с запасом попыток: параллельная экономика попыток
 * (и реклама за них) — это лишняя сущность, а цель фичи — дать выходным трафиком
 * повод зайти именно в эти два дня. Порог наград сам ограничивает выдачу.
 *
 * Монеты — в минутах дохода поля: фиксированные суммы обесцениваются (как в журнале).
 */
export interface TourTier { wins: number; coinsMin?: number; gems?: number; egg?: EggType; chest?: boolean }
export const TOURNAMENT: TourTier[] = [
  { wins: 3, coinsMin: 4 },
  { wins: 6, gems: 15 },
  { wins: 9, egg: 'rare' },
  { wins: 12, chest: true, gems: 25 },
];

/** Идентификатор выходных = дата субботы; суббота и воскресенье считаются вместе. */
export function weekendId(d = new Date()): string {
  const day = d.getDay(); // 0 — воскресенье, 6 — суббота
  if (day !== 0 && day !== 6) return '';
  const sat = new Date(d);
  sat.setDate(d.getDate() - (day === 0 ? 1 : 0));
  return sat.toISOString().slice(0, 10);
}

export const PRICES = {
  chestGems: 25,
  boostGems: 20,
  rowCoins: 5000,
  rowGems: 100,
  freeChestGapMs: 3 * 3_600_000,
};

export interface Chain { id: string; color: number; names: string[] }

// Оригинальные персонажи «в духе» итальянского брейнрота (не копии мемов).
export const CHAINS: Chain[] = [
  { id: 'coffee', color: 0xc98f4e, names: ['Зёрнышко', 'Чашечкино', 'Латтерина', 'Балерино Капучино', 'Гранд Мокачино', 'Прима Эспрессима'] },
  { id: 'croc', color: 0x5fae57, names: ['Икринка', 'Крокодятко', 'Крокодино', 'Авиакрокодило', 'Бомбандино', 'Мега Крокодиссимо'] },
  { id: 'shark', color: 0x5a8fd8, names: ['Малёк', 'Акулёнок', 'Тралалино', 'Акула-Баллерина', 'Мегалодино', 'Гранд Тралалиссимо'] },
  { id: 'drum', color: 0xb85ad0, names: ['Щепка', 'Колотушка', 'Тук-Тукано', 'Барабандо', 'Ночной Барабандиссимо', 'Сахарандо Легендо'] },
  { id: 'cat', color: 0xe07a9e, names: ['Котёнок Митя', 'Кото-Битик', 'Мяу-Диджейно', 'Кот Диско-Фонио', 'Мега Мяумикс', 'Легендо Котофоно'] },
  { id: 'robot', color: 0x58c0a8, names: ['Болтик', 'Робо-Крошка', 'Битбокс-3000', 'Робо-Балерино', 'Гига-Данцато', 'Праймо Роботиссимо'] },
  { id: 'fruit', color: 0xe0405a, names: ['Семечко', 'Клубничелла', 'Ягода-Леди', 'Банано Стиляго', 'Дуэт Романтико', 'Фрутто Легендарио'] },
  { id: 'stick', color: 0xc98a4e, names: ['Брёвнышко', 'Полено Смотрено', 'Дубино Ночино', 'Стражандо Батоне', 'Гранд Постовиссимо', 'Легендо Дозорро'] },
  // Секретная цепочка: только сундуки (6,7%) и «Ночной Дозор».
  { id: 'sixseven', color: 0x3ba7dc, names: ['Шестёрочка', 'Семёрочка', 'Шесть-Семь', '67 Данцато', 'Мега 67', 'ЛЕГЕНДО 67'] },
  { id: 'capy', color: 0xa8845c, names: ['Капибарчик', 'Капи-Чилл', 'Капибарино', 'Космо-Капибара', 'Капибара Командор', 'Гранд Капибариссимо'] },
  { id: 'ufo', color: 0x7ad058, names: ['Огонёчек', 'НЛОшка', 'Тарелло', 'Зелёный Гостино', 'Мега Пришелецо', 'Легендо Галактико'] },
  { id: 'noodle', color: 0xe8c86a, names: ['Макаронина', 'Лапшично', 'Спагетти Джо', 'Нудло Космо', 'Гига Паста', 'Спагеттиссимо Прайм'] },
];

/** Пассивный доход существа за тик: растёт с уровнем и «дороговизной» цепочки. «67» ×6.7. */
export const incomeOf = (chain: number, level: number) =>
  Math.ceil((1 + chain * 0.35) * Math.pow(INCOME.levelMult, level) * (chain === SECRET_CHAIN ? 6.7 : 1));

/**
 * Мутация дня: одна цепочка приносит ×2 дохода. Детерминирована от даты, поэтому
 * не занимает места в сейве и у всех игроков в один день мутирует одно и то же —
 * это повод обсудить в чате и причина заглянуть в игру именно сегодня.
 *
 * Мутация НЕ учитывается в офлайн-доходе (S.incomeRate пишется по чистой ставке):
 * иначе выгоднее было бы «ловить» мутацию сном, а не игрой.
 */
export const MUTATION_MULT = 2;
export const mutationChain = (date = new Date().toISOString().slice(0, 10)) =>
  [...date].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % CHAINS.length;

// Локации: свои цепочки, свой тематический фон. Переключение — через карту.
// Название локации — в i18n по ключу `zone.<id>`.
export interface Zone { id: string; bg: string; chains: number[]; unlockCoins: number; unlockGems: number }
export const ZONES: Zone[] = [
  { id: 'lab', bg: '#1a1230', chains: [0, 1, 2, 3], unlockCoins: 0, unlockGems: 0 },
  { id: 'club', bg: '#0d1a2e', chains: [4, 5, 6], unlockCoins: 10000, unlockGems: 200 },
  { id: 'watch', bg: '#201414', chains: [7, 8], unlockCoins: 50000, unlockGems: 500 },
  { id: 'space', bg: '#0a0e24', chains: [9, 10, 11], unlockCoins: 250000, unlockGems: 1500 },
];

/** Цвет рамки/бейджа по уровню; название редкости — i18n.rarityName(). */
export const RARITY = ['#9aa0b8', '#9aa0b8', '#5a8fd8', '#5a8fd8', '#b85ad0', '#ffe066'];

/**
 * Лиги по кубкам: имя, цвет рамки и порог. Дают ощутимую отметку прогресса между
 * милстоунами — «я в Золоте» читается лучше, чем «у меня 1500 кубков».
 * Названия — в i18n по ключу `league.<key>`.
 */
export const LEAGUES = [
  { cups: 0, key: 'wood', color: 0x9a7b5a, emblem: '🪵' },
  { cups: 300, key: 'bronze', color: 0xc87b3a, emblem: '🥉' },
  { cups: 800, key: 'silver', color: 0xb8c4d8, emblem: '🥈' },
  { cups: 1500, key: 'gold', color: 0xffd04a, emblem: '🥇' },
  { cups: 2500, key: 'platinum', color: 0x7fe0d8, emblem: '💠' },
  { cups: 4000, key: 'legend', color: 0x3ba7dc, emblem: '🔵' },
];

export const leagueIndex = (cups: number) =>
  LEAGUES.reduce((cur, l, i) => (cups >= l.cups ? i : cur), 0);
export const leagueByKey = (key: string) => LEAGUES.find(l => l.key === key) ?? LEAGUES[0];

/**
 * Сезон арены = календарный месяц. На стыке кубки мягко срезаются (×SEASON.reset),
 * и лестница снова даёт быстрый рост: за пару вечеров игрок возвращается на своё
 * плато, а не гриндит стену. Прогресс при этом не теряется:
 *
 *  • награды за пороги живут на S.cupsBest (максимум за всё время) — уже взятое
 *    не может «отобраться» сбросом;
 *  • за пиковую лигу сезона игрок получает кристаллы и РАМКУ профиля — единственную
 *    косметику, которую нельзя купить: статус должен быть заработан.
 */
export const SEASON = {
  // 0.85, а не «половина»: сим показал, что сброс до 60% отбрасывает игрока на 70
  // боёв (≈6 дней) — это наказание за перерыв, а не сезонный забег. При 0.85 возврат
  // занимает ~26 боёв (два вечера), но с высоких кубков всё равно выбивает из лиги,
  // и её приходится заслуживать заново — ради этого сезон и нужен.
  reset: 0.85,
  gems: [10, 20, 40, 80, 130, 200], // по индексу лиги (Деревяшка → ЛЕГЕНДА)
};
export const seasonId = (d = new Date()) => d.toISOString().slice(0, 7);

/**
 * Рамки профиля: лиговые (за пиковую лигу сезона) плюс особые — например «Лаборант»
 * за полный премиум-трек журнала. Рамки не продаются: их носят как заслугу.
 */
export const FRAMES = [
  ...LEAGUES.map(l => ({ key: l.key, color: l.color, emblem: l.emblem })),
  { key: 'pass', color: 0x8f5ad0, emblem: '🧪' },
];
export const frameByKey = (key: string) => FRAMES.find(f => f.key === key) ?? FRAMES[0];
/** Ранг рамки для автовыбора «лучшей»: лиги по порогу кубков, особые — выше всех. */
export const frameRank = (key: string) => {
  const i = LEAGUES.findIndex(l => l.key === key);
  return i >= 0 ? i : LEAGUES.length;
};

/**
 * «Лабораторный журнал» — сезонный пропуск, главный мид-терм крючок и одновременно
 * синк кристаллов. Сезон общий с ареной (календарный месяц).
 *
 * Очки капают за обычную игру: слияние, победа, забранный квест, золотой брейнрот.
 * Порог тира выведен симуляцией: активный игрок из sim делает ~264 очка в день, то
 * есть закрывает 20 тиров за ~15 дней, а средний игрок к концу месяца проходит
 * две трети — как и задумано (полный трек должен быть достижим, но не автоматически).
 *
 * Премиум за кристаллы, а НЕ отдельный товар за деньги: это синк уже проданной
 * валюты, и он даёт только удвоение наград и косметику — никакой силы в бою.
 * Бесплатный трек проходится целиком без покупки.
 */
export const PASS = {
  tiers: 20,
  perTier: 200,
  premiumGems: 450,
  points: { merge: 1, win: 5, quest: 10, golden: 2 },
};

/**
 * Награда тира. `coinsMin` — не фиксированная сумма, а МИНУТЫ дохода поля: фиксированные
 * суммы монет обесцениваются за неделю, а «две минуты дохода» ценны на любом этапе.
 */
export interface PassReward { coinsMin?: number; gems?: number; egg?: EggType; chest?: boolean; frame?: string }
export const PASS_TRACK: PassReward[] = [
  { coinsMin: 2 },
  { gems: 5 },
  { egg: 'common' },
  { coinsMin: 3 },
  { gems: 8 },
  { chest: true },
  { coinsMin: 4 },
  { egg: 'rare' },
  { gems: 10 },
  { coinsMin: 5 },
  { chest: true },
  { gems: 12 },
  { egg: 'common' },
  { coinsMin: 6 },
  { gems: 15 },
  { chest: true },
  { egg: 'rare' },
  { coinsMin: 8 },
  { gems: 20 },
  { egg: 'gold', gems: 50, frame: 'pass' }, // финал: рамка «Лаборант» — только премиум
];

export const leagueOf = (cups: number) =>
  LEAGUES.reduce((cur, l) => (cups >= l.cups ? l : cur), LEAGUES[0]);
export const nextLeague = (cups: number) => LEAGUES.find(l => l.cups > cups) ?? null;

/**
 * Цена продажи существа = его доход за SELL_MINUTES минут.
 *
 * Продажа заменила заказы: раньше отдать существо можно было только по запросу
 * (случайный уровень из трёх слотов наверху экрана), теперь — любое и когда угодно.
 * Свободная продажа — более широкий кран, поэтому ставка ниже, чем была у заказов
 * (2 минуты против 3), и проверена прогоном scripts/sim.ts.
 */
export const SELL_MINUTES = 2;
export const sellPrice = (chain: number, level: number) =>
  Math.round((incomeOf(chain, level) * (60_000 / INCOME.periodMs) * SELL_MINUTES) / 10) * 10;

