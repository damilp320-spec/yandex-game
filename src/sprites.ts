// Процедурные спрайты персонажей: рисуются Graphics'ом в текстуры при старте.
// Ноль бинарных ассетов — мгновенная загрузка (PLAN.md §6). Форма тела зависит от
// цепочки, детали (размер, корона, аура, аксессуары) растут с уровнем.
import Phaser from 'phaser';
import { CHAINS, Chain } from './config';

export const EVENT_CHAIN_INDEX = CHAINS.length;
export const textureKey = (chain: number, level: number) => `spr_${chain}_${level}`;

function shade(color: number, f: number): number {
  const ch = (n: number) => Math.min(255, Math.round(n * f));
  return (ch((color >> 16) & 255) << 16) | (ch((color >> 8) & 255) << 8) | ch(color & 255);
}

export function generateSprites(scene: Phaser.Scene, chains: Chain[], startIndex: number) {
  chains.forEach((cfg, i) =>
    cfg.names.forEach((_, lv) => {
      const key = textureKey(startIndex + i, lv);
      if (!scene.textures.exists(key)) drawCreature(scene, key, cfg, lv);
    }));
}

function drawCreature(scene: Phaser.Scene, key: string, cfg: Chain, lv: number) {
  const g = scene.add.graphics();
  const c = cfg.color, size = 26 + lv * 4; // тело растёт с уровнем

  if (lv >= 5) { g.fillStyle(0xffe066, 0.25); g.fillCircle(48, 48, 46); } // аура легендарки

  g.fillStyle(c);
  switch (cfg.id) {
    case 'coffee': // кружка; с 4-го уровня — пачка балерины
      if (lv >= 3) { g.fillStyle(0xffb6d9, 0.9); g.fillEllipse(48, 48 + size * 0.7, size * 2.3, size * 0.55); g.fillStyle(c); }
      g.fillRoundedRect(48 - size * 0.8, 48 - size * 0.7, size * 1.6, size * 1.4, 8);
      g.lineStyle(5, shade(c, 0.7)); g.strokeCircle(48 + size * 0.95, 48, size * 0.35);
      g.fillStyle(shade(c, 1.35)); g.fillEllipse(48, 48 - size * 0.7, size * 1.5, size * 0.4); // пенка
      break;
    case 'croc': // крокодил; с 4-го уровня — крылья
      if (lv >= 3) { g.fillStyle(0xb8c4d8); g.fillTriangle(10, 42, 40, 34, 34, 54); g.fillTriangle(86, 42, 56, 34, 62, 54); g.fillStyle(c); }
      g.fillEllipse(44, 52, size * 1.9, size * 1.15);
      g.fillRoundedRect(58, 44, size * 0.9, 14, 5); // морда
      g.fillStyle(0xffffff); g.fillTriangle(64, 58, 68, 52, 72, 58); g.fillTriangle(74, 58, 78, 52, 82, 58); // зубы
      break;
    case 'shark': // акула
      g.fillEllipse(48, 52, size * 2.1, size * 1.05);
      g.fillTriangle(40, 52 - size, 58, 46, 34, 48); // плавник
      g.fillTriangle(48 - size, 52, 48 - size - 14, 38, 48 - size - 14, 64); // хвост
      if (lv >= 3) { g.fillStyle(0xff5050); g.fillRoundedRect(30, 60, 14, 10, 3); g.fillRoundedRect(52, 60, 14, 10, 3); } // кроссовки
      break;
    case 'drum': // барабан
      g.fillRoundedRect(48 - size * 0.85, 40, size * 1.7, size * 1.2, 6);
      g.fillStyle(shade(c, 1.4)); g.fillEllipse(48, 40, size * 1.7, size * 0.6);
      if (lv >= 2) { g.lineStyle(4, 0xe8d8a0); g.lineBetween(30, 20, 44, 38); g.lineBetween(66, 20, 52, 38); } // палочки
      break;
    default: // событийная цепочка: солнце с лучами
      g.fillCircle(48, 48, size);
      g.lineStyle(4, shade(c, 1.3));
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        g.lineBetween(48 + Math.cos(a) * (size + 4), 48 + Math.sin(a) * (size + 4), 48 + Math.cos(a) * (size + 14), 48 + Math.sin(a) * (size + 14));
      }
  }

  // глаза и улыбка — «личность» персонажа
  const ey = 40, dx = 9 + lv;
  g.fillStyle(0xffffff); g.fillCircle(48 - dx, ey, 7 + lv); g.fillCircle(48 + dx, ey, 7 + lv);
  g.fillStyle(0x1a1230); g.fillCircle(48 - dx + 2, ey + 1, 3 + lv * 0.5); g.fillCircle(48 + dx + 2, ey + 1, 3 + lv * 0.5);
  g.lineStyle(3, 0x1a1230);
  g.beginPath(); g.arc(48, 54 + lv, 7 + lv, 0.2, Math.PI - 0.2); g.strokePath();

  if (lv >= 4) { // корона эпиков и легендарок
    g.fillStyle(0xffe066);
    g.fillTriangle(34, 26, 40, 12, 46, 26); g.fillTriangle(44, 26, 50, 10, 56, 26); g.fillTriangle(54, 26, 60, 12, 66, 26);
  }

  g.generateTexture(key, 96, 96);
  g.destroy();
}
