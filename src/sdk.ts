// Обёртка Yandex Games SDK с моком для локальной разработки.
// Правила из PLAN.md §4-5: пауза игры на рекламе, награда только по onRewarded,
// частотные капы interstitial, троттлинг сохранений, покупки через Payments API.
import { INTERSTITIAL } from './config';
import { track } from './analytics';
import { setAdMute } from './audio';
import { t } from './i18n';

type Dict = Record<string, unknown>;
declare global { interface Window { YaGames?: { init(): Promise<any> } } }

let ysdk: any = null;
let player: any = null;
let payments: any = null;
const sessionStart = Date.now();
let lastInterstitial = 0;
let lastSave = 0;

export async function initSDK(): Promise<void> {
  try {
    if (!window.YaGames) return; // локальный dev — работаем на моках
    ysdk = await window.YaGames.init();
    player = await ysdk.getPlayer({ scopes: false }).catch(() => null);
    payments = await ysdk.getPayments({ signed: true }).catch(() => null);
    ysdk.features?.LoadingAPI?.ready();
  } catch (e) {
    console.warn('YSDK init failed, using mocks', e);
  }
}

export const gameplayStart = () => ysdk?.features?.GameplayAPI?.start();
export const gameplayStop = () => ysdk?.features?.GameplayAPI?.stop();

/** Язык интерфейса платформы ('ru', 'en', 'tr'…) — для автовыбора локали. */
export const sdkLang = (): string | null => ysdk?.environment?.i18n?.lang ?? null;

/** Пауза геймплея и тишина на время рекламы — требование модерации. */
const adStart = () => { gameplayStop(); setAdMute(true); };
const adEnd = () => { setAdMute(false); gameplayStart(); };

/** Rewarded: onReward вызывается ТОЛЬКО по коллбеку onRewarded. */
export function showRewarded(onReward: () => void, onClose?: () => void): void {
  track('ad_rewarded');
  if (!ysdk) { onReward(); onClose?.(); return; } // мок: сразу награда
  adStart();
  ysdk.adv.showRewardedVideo({
    callbacks: {
      onRewarded: onReward,
      onClose: () => { adEnd(); onClose?.(); },
      onError: () => { adEnd(); onClose?.(); },
    },
  });
}

/** Interstitial с капами; возвращает true, если показ состоялся. */
export function maybeInterstitial(): boolean {
  const now = Date.now();
  if (now - sessionStart < INTERSTITIAL.sessionWarmupMs) return false;
  if (now - lastInterstitial < INTERSTITIAL.minGapMs) return false;
  lastInterstitial = now;
  track('ad_interstitial');
  if (!ysdk) { console.log('[mock] interstitial'); return true; }
  adStart();
  ysdk.adv.showFullscreenAdv({ callbacks: { onClose: adEnd, onError: adEnd } });
  return true;
}

/** Покупка. Расходники (пакеты кристаллов) консьюмим, one-time (no_ads, starter) — нет. */
export async function purchase(id: string, consumable: boolean): Promise<boolean> {
  if (!payments) return window.confirm(`[dev-мок] Купить «${id}»?`); // локальный dev
  try {
    const p = await payments.purchase({ id });
    if (consumable) await payments.consumePurchase(p.purchaseToken).catch(() => {});
    return true;
  } catch { return false; }
}

/** Восстановление one-time покупок (no_ads/starter) при входе. */
export async function restorePurchases(): Promise<string[]> {
  try { return ((await payments?.getPurchases()) ?? []).map((p: any) => p.productID); }
  catch { return []; }
}

// ---------- платформенные рычаги: оценка, ярлык, авторизация ----------
// Рейтинг игры влияет на её ранжирование в каталоге, а ярлык и облачный сейв —
// на возвраты. Всё это бесплатные проценты к удержанию, но навязчивость бьёт по
// ним сильнее, чем помогает: моменты показа выбираются в GameScene.

/** Можно ли просить оценку (платформа сама помнит, что игрок уже оценил). */
export async function canReview(): Promise<boolean> {
  if (!ysdk) return true; // dev-мок: считаем, что можно
  try { return !!(await ysdk.feedback.canReview()).value; }
  catch { return false; }
}

/** Нативное окно оценки. true — отзыв отправлен. */
export async function requestReview(): Promise<boolean> {
  track('review_prompt');
  if (!ysdk) { console.log('[mock] review dialog'); return true; }
  try { return !!(await ysdk.feedback.requestReview()).feedbackSent; }
  catch { return false; }
}

/** Можно ли предложить ярлык на рабочий стол (на десктопе платформа откажет). */
export async function canShortcut(): Promise<boolean> {
  if (!ysdk) return true;
  try { return !!(await ysdk.shortcut?.canShowPrompt())?.canShow; }
  catch { return false; }
}

export async function addShortcut(): Promise<boolean> {
  track('shortcut_prompt');
  if (!ysdk) { console.log('[mock] shortcut prompt'); return true; }
  try { return (await ysdk.shortcut.showPrompt()).outcome === 'accepted'; }
  catch { return false; }
}

/** Гость (режим lite) теряет прогресс при смене устройства — ему предлагаем вход. */
export const isAuthorized = (): boolean => !!player && player.getMode?.() !== 'lite';

export async function authorize(): Promise<boolean> {
  track('auth_prompt');
  if (!ysdk) { console.log('[mock] auth dialog'); return true; }
  try {
    await ysdk.auth.openAuthDialog();
    player = await ysdk.getPlayer({ scopes: false }).catch(() => player);
    return isAuthorized();
  } catch { return false; }
}

export function submitScore(board: string, score: number): void {
  ysdk?.getLeaderboards?.()
    .then((lb: any) => lb.setLeaderboardScore(board, score))
    .catch(() => {});
}

/** Топ лидерборда (+позиция игрока). Пусто — если SDK недоступен (dev-мок рисуется в UI). */
export async function getLeaderboardTop(board: string): Promise<{ rank: number; name: string; score: number }[]> {
  try {
    const lb = await ysdk.getLeaderboards();
    const res = await lb.getLeaderboardEntries(board, { quantityTop: 10, includeUser: true });
    return res.entries.map((e: any) => ({ rank: e.rank, name: e.player?.publicName || t('arena.player'), score: e.score }));
  } catch { return []; }
}

/** Сохранение: облако + localStorage, не чаще раза в 5 сек. */
export function save(data: Dict, force = false): void {
  const now = Date.now();
  if (!force && now - lastSave < 5000) return;
  lastSave = now;
  localStorage.setItem('save', JSON.stringify(data));
  player?.setData({ save: data }).catch(() => {});
}

export async function load(): Promise<Dict | null> {
  try {
    const cloud = await player?.getData(['save']);
    if (cloud?.save) return cloud.save as Dict;
  } catch { /* fallback ниже */ }
  const raw = localStorage.getItem('save');
  return raw ? JSON.parse(raw) : null;
}
