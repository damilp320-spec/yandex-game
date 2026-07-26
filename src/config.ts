// Вся тематика — здесь. Смена тренда/сеттинга = правка этого файла (см. PLAN.md §13).
export const W = 720;
export const H = 1280;

export const GRID = { cols: 6, rows: 6, cell: 108, x: 36, y: 430 };

export const ENERGY = { max: 100, spawnCost: 10, regenMs: 90_000, adRefill: 30 };

// Офлайн-доход: монет в час, копится максимум 8 часов, x2 за rewarded.
export const OFFLINE = { coinsPerHour: 60, capHours: 8 };

// Interstitial: не чаще раза в 3 минуты и никогда в первые 3 минуты сессии.
export const INTERSTITIAL = { minGapMs: 180_000, sessionWarmupMs: 180_000 };

export interface Chain { id: string; color: number; names: string[] }

// Оригинальные персонажи «в духе» итальянского брейнрота (не копии мемов).
export const CHAINS: Chain[] = [
  {
    id: 'coffee',
    color: 0xc98f4e,
    names: ['Зёрнышко', 'Чашечкино', 'Латтерина', 'Балерино Капучино', 'Гранд Мокачино', 'Прима Эспрессима'],
  },
  {
    id: 'croc',
    color: 0x5fae57,
    names: ['Икринка', 'Крокодятко', 'Крокодино', 'Авиакрокодило', 'Бомбандино', 'Мега Крокодиссимо'],
  },
];

// Заказы: нужен предмет цепочки chain уровня level, награда в монетах.
export const ORDER_REWARD_BY_LEVEL = [0, 15, 40, 100, 250, 600];
