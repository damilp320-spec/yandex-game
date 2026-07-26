// Процедурные спрайты: рисуются Graphics'ом в текстуры 128×128 при старте
// (на поле сжимаются до ~94px — чётко на retina). Ноль бинарных ассетов.
// Качество за счёт слоёв: тень → тело → объёмная подсветка → контур → лицо →
// аксессуары уровня (корона, аура, искры).
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
  const c = cfg.color, size = 34 + lv * 5, cx = 64, cy = 66;

  if (lv >= 5) { // аура легендарки + искры
    g.fillStyle(0xffe066, 0.22); g.fillCircle(cx, cy - 4, 60);
    g.fillStyle(0xffe066, 0.9);
    [[18, 24], [110, 30], [104, 96]].forEach(([sx, sy]) => {
      g.fillTriangle(sx - 6, sy, sx + 6, sy, sx, sy - 9);
      g.fillTriangle(sx - 6, sy - 1, sx + 6, sy - 1, sx, sy + 8);
    });
  }

  g.fillStyle(0x000000, 0.28); g.fillEllipse(cx, 112, size * 1.9, 12); // тень на «земле»

  g.fillStyle(c);
  switch (cfg.id) {
    case 'coffee': { // кружка капучино; с 4-го уровня — пачка балерины
      if (lv >= 3) { g.fillStyle(0xffb6d9, 0.95); g.fillEllipse(cx, cy + size * 0.62, size * 2.5, size * 0.6); g.fillStyle(c); }
      g.fillRoundedRect(cx - size * 0.82, cy - size * 0.72, size * 1.64, size * 1.42, 10);
      g.lineStyle(6, shade(c, 0.65)); g.strokeCircle(cx + size * 0.98, cy - 2, size * 0.36); // ручка
      g.fillStyle(0xf6ead8); g.fillEllipse(cx, cy - size * 0.72, size * 1.5, size * 0.44); // пенка
      g.fillStyle(shade(c, 1.25), 0.5); g.fillEllipse(cx - size * 0.4, cy - size * 0.2, size * 0.5, size * 0.9); // блик
      g.lineStyle(4, shade(c, 0.6)); g.strokeRoundedRect(cx - size * 0.82, cy - size * 0.72, size * 1.64, size * 1.42, 10);
      break;
    }
    case 'croc': { // крокодил; с 4-го уровня — крылья бомбардировщика
      if (lv >= 3) { g.fillStyle(0xb8c4d8); g.fillTriangle(12, cy - 18, 46, cy - 28, 40, cy - 2); g.fillTriangle(116, cy - 18, 82, cy - 28, 88, cy - 2); g.fillStyle(c); }
      g.fillEllipse(cx - 6, cy, size * 1.9, size * 1.15);
      g.fillRoundedRect(cx + size * 0.35, cy - 10, size * 0.95, 20, 7); // морда
      g.fillStyle(shade(c, 0.75)); [0, 1, 2].forEach(i => g.fillTriangle(cx - 20 + i * 16, cy - size * 0.58, cx - 12 + i * 16, cy - size * 0.58 - 10, cx - 4 + i * 16, cy - size * 0.58)); // гребень
      g.fillStyle(0xffffff); g.fillTriangle(cx + size * 0.5, cy + 10, cx + size * 0.58, cy - 2, cx + size * 0.68, cy + 10); g.fillTriangle(cx + size * 0.74, cy + 10, cx + size * 0.82, cy - 2, cx + size * 0.92, cy + 10); // зубы
      g.fillStyle(shade(c, 1.3), 0.45); g.fillEllipse(cx - size * 0.5, cy - size * 0.3, size * 0.7, size * 0.4); // блик
      g.lineStyle(4, shade(c, 0.6)); g.strokeEllipse(cx - 6, cy, size * 1.9, size * 1.15);
      break;
    }
    case 'shark': { // акула-балерина
      g.fillEllipse(cx, cy, size * 2.1, size * 1.05);
      g.fillTriangle(cx - 10, cy - size, cx + 16, cy - size * 0.4, cx - 26, cy - size * 0.35); // плавник
      g.fillTriangle(cx - size, cy, cx - size - 16, cy - 16, cx - size - 16, cy + 16); // хвост
      g.fillStyle(0xdfe8f2); g.fillEllipse(cx + 6, cy + size * 0.35, size * 1.3, size * 0.45); // брюхо
      if (lv >= 3) { g.fillStyle(0xff5050); g.fillRoundedRect(cx - 26, cy + size * 0.5, 20, 12, 4); g.fillRoundedRect(cx + 8, cy + size * 0.5, 20, 12, 4); } // кроссовки
      g.fillStyle(shade(c, 1.35), 0.45); g.fillEllipse(cx - size * 0.4, cy - size * 0.3, size * 0.8, size * 0.35);
      g.lineStyle(4, shade(c, 0.6)); g.strokeEllipse(cx, cy, size * 2.1, size * 1.05);
      break;
    }
    case 'drum': { // барабан «тук-тук»
      g.fillRoundedRect(cx - size * 0.85, cy - size * 0.35, size * 1.7, size * 1.15, 8);
      g.fillStyle(shade(c, 1.45)); g.fillEllipse(cx, cy - size * 0.35, size * 1.7, size * 0.55); // мембрана
      g.lineStyle(4, shade(c, 0.6));
      g.strokeEllipse(cx, cy - size * 0.35, size * 1.7, size * 0.55);
      g.lineBetween(cx - size * 0.85, cy + size * 0.2, cx + size * 0.85, cy + size * 0.2); // обруч
      if (lv >= 2) { g.lineStyle(5, 0xe8d8a0); g.lineBetween(cx - 30, cy - size, cx - 8, cy - size * 0.42); g.lineBetween(cx + 30, cy - size, cx + 8, cy - size * 0.42); g.fillStyle(0xe8d8a0); g.fillCircle(cx - 30, cy - size, 6); g.fillCircle(cx + 30, cy - size, 6); } // палочки
      break;
    }
    case 'cat': { // кот-диджей (Неон-Клуб)
      g.fillTriangle(cx - size * 0.7, cy - size * 0.5, cx - size * 0.25, cy - size * 1.1, cx - size * 0.1, cy - size * 0.45); // уши
      g.fillTriangle(cx + size * 0.7, cy - size * 0.5, cx + size * 0.25, cy - size * 1.1, cx + size * 0.1, cy - size * 0.45);
      g.fillCircle(cx, cy, size);
      g.fillStyle(0xffd6e4); g.fillTriangle(cx - size * 0.55, cy - size * 0.5, cx - size * 0.3, cy - size * 0.9, cx - size * 0.2, cy - size * 0.45); // внутр. уши
      g.lineStyle(3, shade(c, 0.55)); // усы
      g.lineBetween(cx - size * 0.9, cy + 8, cx - size * 0.35, cy + 4); g.lineBetween(cx - size * 0.9, cy + 18, cx - size * 0.35, cy + 12);
      g.lineBetween(cx + size * 0.9, cy + 8, cx + size * 0.35, cy + 4); g.lineBetween(cx + size * 0.9, cy + 18, cx + size * 0.35, cy + 12);
      if (lv >= 2) { g.fillStyle(0x2a2438); g.fillRoundedRect(cx - size * 0.7, cy - size * 0.28, size * 1.4, 14, 7); g.fillStyle(0x7fdcff); g.fillCircle(cx - size * 0.33, cy - size * 0.28 + 7, 8); g.fillCircle(cx + size * 0.33, cy - size * 0.28 + 7, 8); } // диджейские очки
      g.fillStyle(shade(c, 1.3), 0.4); g.fillEllipse(cx - size * 0.35, cy - size * 0.25, size * 0.6, size * 0.4);
      g.lineStyle(4, shade(c, 0.6)); g.strokeCircle(cx, cy, size);
      break;
    }
    case 'robot': { // робо-танцор (Неон-Клуб)
      g.lineStyle(4, shade(c, 0.6)); g.lineBetween(cx, cy - size * 0.9, cx, cy - size * 1.25); // антенна
      g.fillStyle(0xffe066); g.fillCircle(cx, cy - size * 1.28, 7);
      g.fillStyle(c); g.fillRoundedRect(cx - size * 0.8, cy - size * 0.8, size * 1.6, size * 1.55, 12);
      g.fillStyle(0x14202e); g.fillRoundedRect(cx - size * 0.55, cy - size * 0.5, size * 1.1, size * 0.75, 8); // экран-лицо
      if (lv >= 2) { g.fillStyle(0x7fdcff); [0, 1, 2, 3].forEach(i => g.fillRect(cx - size * 0.4 + i * size * 0.22, cy + size * 0.42, size * 0.12, size * 0.28)); } // эквалайзер
      g.fillStyle(shade(c, 1.35), 0.45); g.fillRoundedRect(cx - size * 0.7, cy - size * 0.72, size * 0.5, size * 1.3, 8);
      g.lineStyle(4, shade(c, 0.6)); g.strokeRoundedRect(cx - size * 0.8, cy - size * 0.8, size * 1.6, size * 1.55, 12);
      break;
    }
    default: { // событийная цепочка: солнце/снежинка-звезда
      g.fillCircle(cx, cy, size);
      g.lineStyle(5, shade(c, 1.3));
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        g.lineBetween(cx + Math.cos(a) * (size + 5), cy + Math.sin(a) * (size + 5), cx + Math.cos(a) * (size + 18), cy + Math.sin(a) * (size + 18));
      }
      g.fillStyle(shade(c, 1.35), 0.5); g.fillEllipse(cx - size * 0.35, cy - size * 0.35, size * 0.7, size * 0.5);
      g.lineStyle(4, shade(c, 0.6)); g.strokeCircle(cx, cy, size);
    }
  }

  // лицо: глаза с бликами, зрачки, щёчки, улыбка
  const isRobot = cfg.id === 'robot';
  const ey = cfg.id === 'shark' ? cy - 8 : cy - 12, dx = 11 + lv;
  g.fillStyle(isRobot ? 0x7fdcff : 0xffffff);
  g.fillCircle(cx - dx, ey, 8 + lv); g.fillCircle(cx + dx, ey, 8 + lv);
  if (!isRobot) {
    g.fillStyle(0x1a1230); g.fillCircle(cx - dx + 2, ey + 1, 3.5 + lv * 0.5); g.fillCircle(cx + dx + 2, ey + 1, 3.5 + lv * 0.5);
    g.fillStyle(0xffffff, 0.9); g.fillCircle(cx - dx + 4, ey - 2, 2); g.fillCircle(cx + dx + 4, ey - 2, 2); // блики глаз
    g.fillStyle(0xff9daa, 0.55); g.fillCircle(cx - dx - 8, ey + 12, 5); g.fillCircle(cx + dx + 8, ey + 12, 5); // щёчки
  }
  g.lineStyle(3.5, isRobot ? 0x7fdcff : 0x1a1230);
  g.beginPath(); g.arc(cx, ey + 16 + lv * 0.5, 8 + lv, 0.25, Math.PI - 0.25); g.strokePath();

  if (lv >= 4) { // корона с самоцветами
    const ty = cy - size - 12;
    g.fillStyle(0xffe066);
    g.fillTriangle(cx - 20, ty + 14, cx - 14, ty - 2, cx - 8, ty + 14);
    g.fillTriangle(cx - 10, ty + 14, cx, ty - 6, cx + 10, ty + 14);
    g.fillTriangle(cx + 8, ty + 14, cx + 14, ty - 2, cx + 20, ty + 14);
    g.fillStyle(0xff5050); g.fillCircle(cx, ty + 2, 3);
  }

  g.generateTexture(key, 128, 128);
  g.destroy();
}
