// UI-кит: единый стиль всех элементов. Градиентные кнопки с тенью и анимацией
// нажатия, модалки с шапкой, «пилюли» ресурсов — как в топовых мобильных казуалках.
import Phaser from 'phaser';
import { W, H, FONT } from './config';
import { t } from './i18n';

function shade(color: number, f: number): number {
  const ch = (n: number) => Math.min(255, Math.round(n * f));
  return (ch((color >> 16) & 255) << 16) | (ch((color >> 8) & 255) << 8) | ch(color & 255);
}

export function button(s: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, color: number, cb: () => void, fontSize = 26): Phaser.GameObjects.Container {
  const c = s.add.container(x, y);
  const g = s.add.graphics();
  const r = Math.min(16, h / 2 - 2);
  g.fillStyle(0x000000, 0.35); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, r); // тень
  g.fillGradientStyle(shade(color, 1.25), shade(color, 1.25), color, color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.18); g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.42, r - 2); // верхний блик
  g.lineStyle(2, shade(color, 0.55)); g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  const t = s.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: `${fontSize}px`, color: '#fff', fontStyle: '700',
    align: 'center', wordWrap: { width: w - 16 },
  }).setOrigin(0.5).setShadow(0, 2, 'rgba(0,0,0,0.45)', 2);
  const hit = s.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setInteractive();
  c.add([g, t, hit]);
  hit.on('pointerdown', () => s.tweens.add({ targets: c, scale: 0.94, duration: 60, yoyo: true, onComplete: cb }));
  return c;
}

/**
 * Карточка: скруглённый градиентный прямоугольник с тенью и верхним бликом —
 * основа для плиток (заказы, слоты команды). Содержимое добавляется поверх.
 */
export function card(s: Phaser.Scene, x: number, y: number, w: number, h: number,
  color = 0x3d2f6e, radius = 16): Phaser.GameObjects.Container {
  const c = s.add.container(x, y);
  const g = s.add.graphics();
  g.fillStyle(0x000000, 0.35); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, radius); // тень
  g.fillGradientStyle(shade(color, 1.22), shade(color, 1.22), color, color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.fillStyle(0xffffff, 0.1); g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.4, radius - 2); // блик
  g.lineStyle(2, shade(color, 0.6)); g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  c.add(g);
  return c;
}

/** Маленькая «плашка» под значение внутри карточки (награда, характеристики). */
export function chip(s: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, color = '#ffe066', bg = 0x1d1536): Phaser.GameObjects.Container {
  const c = s.add.container(x, y);
  const g = s.add.graphics();
  g.fillStyle(bg, 0.85); g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const t = s.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${Math.round(h * 0.62)}px`, color, fontStyle: '700' }).setOrigin(0.5);
  c.add([g, t]);
  return c;
}

/** Полноэкранная модалка: тёмный фон блокирует ввод, шапка, ✕ и кнопка «Закрыть». */
export function panel(s: Phaser.Scene, title: string, onClose?: () => void): Phaser.GameObjects.Container {
  const root = s.add.container(0, 0).setDepth(50);
  const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x08050f, 0.78).setInteractive();
  const g = s.add.graphics();
  g.fillStyle(0x000000, 0.5); g.fillRoundedRect(W / 2 - 328 + 4, H / 2 - 460 + 8, 656, 920, 28); // тень
  g.fillGradientStyle(0x2e2258, 0x2e2258, 0x1e1640, 0x1e1640, 1);
  g.fillRoundedRect(W / 2 - 328, H / 2 - 460, 656, 920, 28);
  g.lineStyle(3, 0x8f7bd8); g.strokeRoundedRect(W / 2 - 328, H / 2 - 460, 656, 920, 28);
  g.fillStyle(0x8f7bd8, 0.25); g.fillRoundedRect(W / 2 - 328, H / 2 - 460, 656, 78, { tl: 28, tr: 28, bl: 0, br: 0 });
  const tt = s.add.text(W / 2, H / 2 - 421, title, { fontFamily: FONT, fontSize: '36px', color: '#ffe066', fontStyle: '800' })
    .setOrigin(0.5).setShadow(0, 2, 'rgba(0,0,0,0.5)', 3);
  const close = () => { root.destroy(); onClose?.(); };
  const xBtn = s.add.text(W / 2 + 296, H / 2 - 421, '✕', { fontFamily: FONT, fontSize: '34px', color: '#c9beee', fontStyle: '700' })
    .setOrigin(0.5).setInteractive();
  xBtn.on('pointerdown', close);
  root.add([dim, g, tt, xBtn, button(s, W / 2, H / 2 + 400, 300, 62, t('common.close'), 0x5a48a8, close)]);
  return root;
}

/** «Пилюля» ресурса в HUD; возвращает текст для обновления значения. */
export function pill(s: Phaser.Scene, x: number, y: number, w: number, icon: string, color: number): Phaser.GameObjects.Text {
  const g = s.add.graphics();
  g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x + 2, y - 21 + 3, w, 42, 21);
  g.fillGradientStyle(0x2c2152, 0x2c2152, 0x201740, 0x201740, 1); g.fillRoundedRect(x, y - 21, w, 42, 21);
  g.lineStyle(2, color, 0.8); g.strokeRoundedRect(x, y - 21, w, 42, 21);
  s.add.text(x + 12, y, icon, { fontSize: '24px' }).setOrigin(0, 0.5);
  return s.add.text(x + 48, y, '', { fontFamily: FONT, fontSize: '25px', color: '#ffffff', fontStyle: '700' }).setOrigin(0, 0.5);
}

export function toast(s: Phaser.Scene, x: number, y: number, msg: string, color = '#ffe066') {
  const t = s.add.text(x, y, msg, { fontFamily: FONT, fontSize: '29px', color, fontStyle: '800' })
    .setOrigin(0.5).setDepth(60).setShadow(0, 2, 'rgba(0,0,0,0.6)', 4).setStroke('#1a1230', 4);
  s.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 950, onComplete: () => t.destroy() });
}
