import Phaser from 'phaser';
import { W, H } from './config';

export function button(s: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, color: number, cb: () => void, fontSize = 26): Phaser.GameObjects.Container {
  const c = s.add.container(x, y);
  const bg = s.add.rectangle(0, 0, w, h, color).setStrokeStyle(2, 0xffffff, 0.5).setInteractive();
  const t = s.add.text(0, 0, label, { fontSize: `${fontSize}px`, color: '#fff', align: 'center', wordWrap: { width: w - 14 } }).setOrigin(0.5);
  c.add([bg, t]);
  bg.on('pointerdown', cb);
  return c;
}

/** Полноэкранная модалка: тёмный фон блокирует ввод, кнопка «Закрыть» внизу. */
export function panel(s: Phaser.Scene, title: string, onClose?: () => void): Phaser.GameObjects.Container {
  const root = s.add.container(0, 0).setDepth(50);
  const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive();
  const box = s.add.rectangle(W / 2, H / 2, 656, 920, 0x241a45).setStrokeStyle(4, 0x8f7bd8);
  const tt = s.add.text(W / 2, H / 2 - 420, title, { fontSize: '38px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5);
  root.add([dim, box, tt, button(s, W / 2, H / 2 + 410, 300, 62, 'Закрыть', 0x5a48a8, () => { root.destroy(); onClose?.(); })]);
  return root;
}

export function toast(s: Phaser.Scene, x: number, y: number, msg: string, color = '#ffe066') {
  const t = s.add.text(x, y, msg, { fontSize: '30px', color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(60);
  s.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 950, onComplete: () => t.destroy() });
}
