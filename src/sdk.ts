// Обёртка Yandex Games SDK с моком для локальной разработки.
// Правила из PLAN.md §4-5: пауза игры на рекламе, награда только по onRewarded,
// частотные капы interstitial, троттлинг сохранений.
import { INTERSTITIAL } from './config';

type Dict = Record<string, unknown>;
declare global { interface Window { YaGames?: { init(): Promise<any> } } }

let ysdk: any = null;
let player: any = null;
const sessionStart = Date.now();
let lastInterstitial = 0;
let lastSave = 0;

export async function initSDK(): Promise<void> {
  try {
    if (!window.YaGames) return; // локальный dev — работаем на моках
    ysdk = await window.YaGames.init();
    player = await ysdk.getPlayer({ scopes: false }).catch(() => null);
    ysdk.features?.LoadingAPI?.ready();
  } catch (e) {
    console.warn('YSDK init failed, using mocks', e);
  }
}

export const gameplayStart = () => ysdk?.features?.GameplayAPI?.start();
export const gameplayStop = () => ysdk?.features?.GameplayAPI?.stop();

/** Rewarded: onReward вызывается ТОЛЬКО по коллбеку onRewarded. */
export function showRewarded(onReward: () => void, onClose?: () => void): void {
  if (!ysdk) { onReward(); onClose?.(); return; } // мок: сразу награда
  gameplayStop();
  ysdk.adv.showRewardedVideo({
    callbacks: {
      onRewarded: onReward,
      onClose: () => { gameplayStart(); onClose?.(); },
      onError: () => { gameplayStart(); onClose?.(); },
    },
  });
}

/** Interstitial с капами; возвращает true, если показ состоялся. */
export function maybeInterstitial(): boolean {
  const now = Date.now();
  if (now - sessionStart < INTERSTITIAL.sessionWarmupMs) return false;
  if (now - lastInterstitial < INTERSTITIAL.minGapMs) return false;
  lastInterstitial = now;
  if (!ysdk) { console.log('[mock] interstitial'); return true; }
  gameplayStop();
  ysdk.adv.showFullscreenAdv({ callbacks: { onClose: gameplayStart, onError: gameplayStart } });
  return true;
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
