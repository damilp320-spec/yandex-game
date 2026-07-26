// Вся тематика и баланс — здесь. Смена тренда/сеттинга = правка этого файла (PLAN.md §13).
export const W = 720;
export const H = 1280;

// 7-й ряд (index 6) заперт до покупки — мягкое «space pressure» (PLAN.md §16).
export const GRID = { cols: 6, rows: 7, cell: 104, x: 48, y: 366 };

export const ENERGY = { max: 100, spawnCost: 10, regenMs: 90_000, adRefill: 30 };
export const OFFLINE = { coinsPerHour: 60, capHours: 8 };
export const INTERSTITIAL = { minGapMs: 180_000, sessionWarmupMs: 180_000, everyNOrders: 4 };
export const GEN = { cooldownMs: 90_000 };

export const PRICES = {
  chestGems: 25,
  energyGems: 20,
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
];

export const RARITY = [
  { name: 'обычный', color: '#9aa0b8' }, { name: 'обычный', color: '#9aa0b8' },
  { name: 'редкий', color: '#5a8fd8' }, { name: 'редкий', color: '#5a8fd8' },
  { name: 'эпический', color: '#b85ad0' }, { name: 'легендарный', color: '#ffe066' },
];

export const ORDER_REWARD_BY_LEVEL = [0, 15, 40, 100, 250, 600];
