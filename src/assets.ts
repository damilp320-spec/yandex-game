// Кастомные PNG-скины (как с джинглами): положи файлы в public/skins/ и
// перечисли в public/skins/manifest.json:
//   { "sprites": ["coffee_0", "sixseven_5"], "backgrounds": ["lab", "club"] }
// Спрайты: <id цепочки>_<уровень 0-5>.png (квадрат, лучше 256×256, прозрачный фон).
// Фоны: bg_<id локации>.png (720×1280). Всё остальное продолжит рисоваться кодом.
import { CHAINS } from './config';
import { EVENT_CHAIN_INDEX, textureKey } from './sprites';

export interface SkinManifest { sprites?: string[]; backgrounds?: string[] }
export let skins: SkinManifest = {};

export async function fetchSkinManifest() {
  try {
    const r = await fetch('skins/manifest.json');
    if (r.ok) skins = await r.json();
  } catch { /* скинов нет — рисуем процедурно */ }
}

/** Ставит кастомные спрайты в очередь загрузки ПОД штатными ключами — генерация их пропустит. */
export function queueSkinLoads(load: any, eventId?: string) {
  (skins.sprites ?? []).forEach(name => {
    const m = /^(.+)_(\d)$/.exec(name);
    if (!m) return;
    const idx = m[1] === 'event' || m[1] === eventId ? EVENT_CHAIN_INDEX : CHAINS.findIndex(c => c.id === m[1]);
    if (idx < 0) return;
    load.image(textureKey(idx, +m[2]), `skins/${name}.png`);
  });
  (skins.backgrounds ?? []).forEach(z => load.image(`skinbg_${z}`, `skins/bg_${z}.png`));
}
