// Магазин: витрина Яндекс.Платежей + синки кристаллов. Дизайн и психология — PLAN.md §16.
import Phaser from 'phaser';
import { W, H, PRICES, ENERGY } from './config';
import { S, persist } from './state';
import * as sdk from './sdk';
import { button, panel, toast } from './ui';
import { track } from './analytics';
import { tada, coinSound, failSound } from './audio';

export interface ShopApi {
  /** Выдать существо на поле (случайная цепочка). Вернёт false, если поле забито. */
  spawnReward(level: number): boolean;
  refreshHud(): void;
}

interface Product { id: string; title: string; desc: string; consumable: boolean; once?: () => boolean; grant: () => void }

const PRODUCTS: Product[] = [
  {
    id: 'starter', title: 'Стартовый набор — выгода ×5', desc: '150💎 + 5000🪙 + 7 дней без рекламы (только 1 раз)',
    consumable: false, once: () => S.starterBought,
    grant: () => { S.starterBought = true; S.gems += 150; S.coins += 5000; S.adFreeUntil = Date.now() + 7 * 86_400_000; },
  },
  { id: 'gems_s', title: 'Горсть кристаллов', desc: '80💎', consumable: true, grant: () => { S.gems += 80; } },
  { id: 'gems_m', title: 'Мешок кристаллов', desc: '500💎 · выгода +25%', consumable: true, grant: () => { S.gems += 500; } },
  { id: 'gems_l', title: 'Сундук кристаллов', desc: '1200💎 · выгода +50%', consumable: true, grant: () => { S.gems += 1200; } },
  {
    id: 'no_ads', title: 'Отключить рекламу', desc: 'Убирает всю принудительную рекламу навсегда',
    consumable: false, once: () => S.noAds, grant: () => { S.noAds = true; },
  },
];

/** Сундук: вариативное вознаграждение — уровни 2–4, секретный 5-й с шансом 3%. */
export function rollChest(api: ShopApi, s: Phaser.Scene, x: number, y: number) {
  const r = Math.random();
  const level = r < 0.03 ? 5 : r < 0.15 ? 4 : r < 0.5 ? 3 : 2;
  if (api.spawnReward(level)) { tada(); toast(s, x, y, level >= 5 ? 'СЕКРЕТНОЕ СУЩЕСТВО!!!' : 'Новое существо из сундука!'); }
  else { S.coins += 200 * level; coinSound(); toast(s, x, y, `Поле забито — +${200 * level}🪙`); }
  api.refreshHud(); persist();
}

export function openShop(s: Phaser.Scene, api: ShopApi) {
  const root = panel(s, '💎 Магазин');
  let y = H / 2 - 330;

  // Синки кристаллов — сверху: F2P-игрок приходит сюда тратить, а не «покупать за деньги».
  const free = Date.now() - S.freeChestLast >= PRICES.freeChestGapMs;
  root.add(button(s, W / 2, y, 600, 66,
    free ? '🎁 Бесплатный сундук за рекламу' : `🎁 Бесплатный сундук через ${Math.ceil((PRICES.freeChestGapMs - (Date.now() - S.freeChestLast)) / 60000)} мин`,
    free ? 0x2e7d5b : 0x3a3a55,
    () => { if (!free) return; S.freeChestLast = Date.now(); root.destroy(); sdk.showRewarded(() => rollChest(api, s, W / 2, H / 2)); }));
  y += 82;
  root.add(button(s, W / 2, y, 600, 66, `📦 Сундук существа — ${PRICES.chestGems}💎`, 0x8f5ad0, () => {
    if (S.gems < PRICES.chestGems) { failSound(); toast(s, W / 2, y, 'Не хватает 💎', '#ff7070'); return; }
    S.gems -= PRICES.chestGems; root.destroy(); rollChest(api, s, W / 2, H / 2);
  }));
  y += 82;
  root.add(button(s, W / 2, y, 600, 66, `⚡ Полная энергия — ${PRICES.energyGems}💎`, 0x2e6d9d, () => {
    if (S.gems < PRICES.energyGems) { failSound(); toast(s, W / 2, y, 'Не хватает 💎', '#ff7070'); return; }
    S.gems -= PRICES.energyGems; S.energy = ENERGY.max; coinSound(); api.refreshHud(); persist(); toast(s, W / 2, y, 'Энергия полна!');
  }));
  y += 100;

  for (const p of PRODUCTS) {
    const bought = p.once?.() ?? false;
    root.add(button(s, W / 2, y, 600, 74, bought ? `✅ ${p.title}` : `${p.title}\n${p.desc}`, bought ? 0x3a3a55 : 0x5a48a8, async () => {
      if (bought) return;
      if (await sdk.purchase(p.id, p.consumable)) { p.grant(); tada(); track(`purchase_${p.id}`); api.refreshHud(); persist(true); root.destroy(); }
    }, 22));
    y += 88;
  }
}
