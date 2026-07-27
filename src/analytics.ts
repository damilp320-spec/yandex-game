// Яндекс.Метрика: цели по ключевым событиям (PLAN.md §9).
// Пока METRICA_ID = 0, события пишутся только в консоль (dev-режим).
import { METRICA_ID } from './config';

declare global { interface Window { ym?: (...args: unknown[]) => void } }

export function initMetrica() {
  if (!METRICA_ID) return;
  const w = window as any;
  w.ym = w.ym || function (...args: unknown[]) { (w.ym.a = w.ym.a || []).push(args); };
  w.ym.l = Date.now();
  const s = document.createElement('script');
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  s.async = true;
  document.head.appendChild(s);
  window.ym!(METRICA_ID, 'init', { defer: true, accurateTrackBounce: true });
  track('session_start');
}

export function track(goal: string, params?: Record<string, unknown>) {
  if (METRICA_ID) window.ym?.(METRICA_ID, 'reachGoal', goal, params);
  else console.debug('[metrica]', goal, params ?? '');
}
