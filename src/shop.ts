// Магазин: витрина Яндекс.Платежей + синки кристаллов. Дизайн и психология — PLAN.md §16.
import Phaser from 'phaser';
import { W, H, PRICES, INCOME, SECRET_CHANCE } from './config';
import { S, persist } from './state';
import * as sdk from './sdk';
import { button, panel, toast } from './ui';
import { track } from './analytics';
import { t } from './i18n';
import { tada, coinSound, failSound } from './audio';

export interface ShopApi {
  /** Выдать существо на поле (случайная цепочка локации). Вернёт false, если поле забито. */
  spawnReward(level: number): boolean;
  /** Выдать секретного «67». Вернёт false, если поле забито. */
  spawnSecret(): boolean;
  refreshHud(): void;
}

// Названия и описания товаров — в i18n по ключам `p.<id>.title` / `p.<id>.desc`.
interface Product { id: string; consumable: boolean; once?: () => boolean; grant: () => void }

const PRODUCTS: Product[] = [
  {
    id: 'starter', consumable: false, once: () => S.starterBought,
    grant: () => { S.starterBought = true; S.gems += 150; S.coins += 5000; S.adFreeUntil = Date.now() + 7 * 86_400_000; },
  },
  { id: 'gems_s', consumable: true, grant: () => { S.gems += 80; } },
  { id: 'gems_m', consumable: true, grant: () => { S.gems += 500; } },
  { id: 'gems_l', consumable: true, grant: () => { S.gems += 1200; } },
  { id: 'no_ads', consumable: false, once: () => S.noAds, grant: () => { S.noAds = true; } },
  // «Склад»: офлайн платит полную ставку 5 часов вместо половины за 2. Не даёт силы
  // в бою — экономит время, поэтому не ломает баланс арены.
  { id: 'offline_vip', consumable: false, once: () => S.offlineVip, grant: () => { S.offlineVip = true; } },
];

/** Сундук: вариативное вознаграждение — уровни 2–4; секретный «67» с шансом 6,7%. */
export function rollChest(api: ShopApi, s: Phaser.Scene, x: number, y: number) {
  const r = Math.random();
  if (r < SECRET_CHANCE) {
    if (api.spawnSecret()) { tada(); toast(s, x, y, t('chest.secret')); }
    else { S.gems += 67; coinSound(); toast(s, x, y, t('chest.secretFull')); }
    api.refreshHud(); persist();
    return;
  }
  const level = r < 0.2 ? 4 : r < 0.55 ? 3 : 2;
  if (api.spawnReward(level)) { tada(); toast(s, x, y, t('chest.new')); }
  else { S.coins += 200 * level; coinSound(); toast(s, x, y, t('chest.full', { n: 200 * level })); }
  api.refreshHud(); persist();
}

export function openShop(s: Phaser.Scene, api: ShopApi) {
  const root = panel(s, t('shop.title'));
  let y = H / 2 - 330;

  // Синки кристаллов — сверху: F2P-игрок приходит сюда тратить, а не «покупать за деньги».
  const free = Date.now() - S.freeChestLast >= PRICES.freeChestGapMs;
  root.add(button(s, W / 2, y, 600, 66,
    free ? t('shop.freeChest') : t('shop.freeChestWait', { n: Math.ceil((PRICES.freeChestGapMs - (Date.now() - S.freeChestLast)) / 60000) }),
    free ? 0x2e7d5b : 0x3a3a55,
    () => { if (!free) return; S.freeChestLast = Date.now(); root.destroy(); sdk.showRewarded(() => rollChest(api, s, W / 2, H / 2)); }));
  y += 82;
  root.add(button(s, W / 2, y, 600, 66, t('shop.chest', { n: PRICES.chestGems }), 0x8f5ad0, () => {
    if (S.gems < PRICES.chestGems) { failSound(); toast(s, W / 2, y, t('common.notEnoughGems'), '#ff7070'); return; }
    S.gems -= PRICES.chestGems; root.destroy(); rollChest(api, s, W / 2, H / 2);
  }));
  y += 82;
  root.add(button(s, W / 2, y, 600, 66, t('shop.boost', { mult: INCOME.boostGemMult, gems: PRICES.boostGems }), 0x2e6d9d, () => {
    if (S.gems < PRICES.boostGems) { failSound(); toast(s, W / 2, y, t('common.notEnoughGems'), '#ff7070'); return; }
    S.gems -= PRICES.boostGems;
    S.boostMult = INCOME.boostGemMult;
    S.boostUntil = Date.now() + INCOME.boostGemMs;
    coinSound(); api.refreshHud(); persist(); toast(s, W / 2, y, t('hud.boostOn', { mult: INCOME.boostGemMult }));
  }));
  y += 100;

  for (const p of PRODUCTS) {
    const bought = p.once?.() ?? false;
    const title = t(`p.${p.id}.title`);
    root.add(button(s, W / 2, y, 600, 74, bought ? `✅ ${title}` : `${title}\n${t(`p.${p.id}.desc`)}`, bought ? 0x3a3a55 : 0x5a48a8, async () => {
      if (bought) return;
      if (await sdk.purchase(p.id, p.consumable)) { p.grant(); tada(); track(`purchase_${p.id}`); api.refreshHud(); persist(true); root.destroy(); }
      else { failSound(); toast(s, W / 2, H / 2, t('shop.failed'), '#ff7070'); } // отказ/отмена платежа
    }, 22));
    y += 88;
  }
}
