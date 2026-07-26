// Вся тематика и баланс — здесь. Смена тренда/сеттинга = правка этого файла (PLAN.md §13).
export const W = 720;
export const H = 1280;

// Номер счётчика Яндекс.Метрики; 0 = выключено (события уходят в консоль).
export const METRICA_ID = 0;

export const FONT = 'Rubik, "Segoe UI", Arial, sans-serif';

// Секретный «67»: шанс из сундука. 6,7% — сам шанс является мемом.
export const SECRET_CHANCE = 0.067;
export const SECRET_CHAIN = 8; // индекс цепочки sixseven в CHAINS

// Поле 5×6: крупные существа. 6-й ряд (index 5) заперт — «space pressure» (PLAN.md §16).
export const GRID = { cols: 5, rows: 6, cell: 126, x: 45, y: 344 };

// Экономика в духе Steal a Brainrot: существа на поле пассивно приносят монеты.
export const INCOME = {
  periodMs: 5000,      // тик дохода
  levelMult: 2.5,      // множитель дохода за уровень
  offlineCapHours: 8,
  boostAdMult: 2, boostAdMs: 120_000,    // rewarded-буст
  boostGemMult: 3, boostGemMs: 600_000,  // буст за кристаллы
};

// Покупка существ — цена растёт как в кликерах.
export const SPAWN = { baseCost: 25, growth: 1.13 };

// «Золотой брейнрот» пролетает по экрану — тап даёт 2 минуты дохода разом.
export const GOLDEN = { intervalMs: 90_000, lifeMs: 8000, rewardSec: 120, minReward: 100 };

export const OFFLINE_MIN_COINS = 5;

export const INTERSTITIAL = { minGapMs: 180_000, sessionWarmupMs: 180_000, everyNOrders: 4 };
export const GEN = { cooldownMs: 90_000 };

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

// Локации: свои цепочки, свой тематический фон. Переключение — через карту.
export interface Zone { id: string; title: string; bg: string; chains: number[]; unlockCoins: number; unlockGems: number }
export const ZONES: Zone[] = [
  { id: 'lab', title: 'Лаборатория', bg: '#1a1230', chains: [0, 1, 2, 3], unlockCoins: 0, unlockGems: 0 },
  { id: 'club', title: 'Неон-Клуб', bg: '#0d1a2e', chains: [4, 5, 6], unlockCoins: 10000, unlockGems: 200 },
  { id: 'watch', title: 'Ночной Дозор', bg: '#201414', chains: [7, 8], unlockCoins: 50000, unlockGems: 500 },
  { id: 'space', title: 'Космо-База', bg: '#0a0e24', chains: [9, 10, 11], unlockCoins: 250000, unlockGems: 1500 },
];

export const RARITY = [
  { name: 'обычный', color: '#9aa0b8' }, { name: 'обычный', color: '#9aa0b8' },
  { name: 'редкий', color: '#5a8fd8' }, { name: 'редкий', color: '#5a8fd8' },
  { name: 'эпический', color: '#b85ad0' }, { name: 'легендарный', color: '#ffe066' },
];

export const ORDER_REWARD_BY_LEVEL = [0, 40, 120, 300, 750, 1800];
