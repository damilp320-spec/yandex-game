// Автобатлер 5×5: юниты бьют сами по своей скорости атаки. Игрок — зритель
// (кнопка ×2 ускоряет всё через timeScale). Melee выпадает вперёд, снайпер
// бьёт самого раненого, splash задевает всех. Цифры урона, тающие HP-бары,
// смерть с падением — вся зрелищность на твинах, без ассетов.
import Phaser from 'phaser';
import { W, H, CHAINS, FONT } from './config';
import { textureKey } from './sprites';
import { unitStats, attackPlan, statScale, rollDamage, AttackType, TICK_MS, BossFight } from './arena';
import { jingleFanfare, failSound, clickSound } from './audio';
import { button } from './ui';
import { t } from './i18n';

interface Fighter {
  chain: number; level: number;
  hp: number; maxHp: number; dmg: number; spd: number; type: AttackType;
  next: number; alive: boolean; side: 0 | 1;
  obj: Phaser.GameObjects.Container; bar: Phaser.GameObjects.Graphics;
  barW: number; // у босса полоса шире: он один и его HP — главный индикатор боя
}

export function startBattle(
  scene: Phaser.Scene,
  player: number[][], playerFactor: number, // >1 при реванше с рекламным бустом
  enemy: number[][], enemyFactor: number, enemyName: string,
  onEnd: (win: boolean) => void,
  boss?: BossFight, // бой с боссом: вместо пятёрки один гигант с явными характеристиками
) {
  const root = scene.add.container(0, 0).setDepth(70);
  // Полностью перекрываем поле: через полупрозрачный фон просвечивали кнопки и клетки,
  // и бой читался как «поверх интерфейса», а не как отдельная сцена.
  root.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x08050f, 1).setInteractive());
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x1d1436, 0x1d1436, 0x0a0714, 0x0a0714, 1);
  bg.fillRect(0, 0, W, H);
  // «Арена»: полосы за строями и разделительная линия по центру
  bg.fillStyle(0x2e2258, 0.5); bg.fillRoundedRect(60, 150, 220, H - 300, 24);
  bg.fillStyle(0x50203a, 0.5); bg.fillRoundedRect(W - 280, 150, 220, H - 300, 24);
  bg.lineStyle(2, 0x8f7bd8, 0.25); bg.lineBetween(W / 2, 140, W / 2, H - 130);
  root.add(bg);
  root.add(scene.add.text(W / 2, 60, t('battle.vs', { name: enemyName }), { fontFamily: FONT, fontSize: '30px', color: '#ffe066', fontStyle: '800', align: 'center', wordWrap: { width: 660 } }).setOrigin(0.5).setStroke('#120c22', 6));
  root.add(scene.add.text(W / 2, H / 2, 'VS', { fontFamily: FONT, fontSize: '46px', color: '#ffffff', fontStyle: '900' }).setOrigin(0.5).setAlpha(0.13));

  const fighters: Fighter[] = [];
  const mkFighter = (ch: number, lv: number, side: 0 | 1, i: number, powerFactor: number, stats?: BossFight) => {
    const st = stats ?? unitStats(ch, lv, side === 0);
    const factor = stats ? 1 : statScale(powerFactor); // у босса характеристики уже финальные
    const solo = !!stats;
    const size = solo ? 220 : 120;
    const x = side === 0 ? 170 : W - 170, y = solo ? H / 2 - 20 : 200 + i * 190;
    const obj = scene.add.container(x, y);
    const img = scene.add.image(0, 0, textureKey(ch, lv)).setDisplaySize(size, size);
    if (side === 1) img.setFlipX(true);
    const bar = scene.add.graphics();
    obj.add([img, bar]);
    root.add(obj);
    if (solo) // босс дышит: одиночная фигура без движения выглядит мёртвой
      scene.tweens.add({ targets: img, scale: img.scale * 1.06, yoyo: true, repeat: -1, duration: 900 });
    const f: Fighter = {
      chain: ch, level: lv,
      hp: Math.round(st.hp * factor), maxHp: Math.round(st.hp * factor),
      dmg: Math.round(st.dmg * factor), spd: st.spd, type: st.type,
      next: st.spd * (0.5 + Math.random() * 0.7), alive: true, side, obj, bar,
      barW: solo ? 200 : 104,
    };
    drawBar(f);
    fighters.push(f);
  };
  player.forEach(([ch, lv], i) => mkFighter(ch, lv, 0, i, playerFactor));
  if (boss) mkFighter(boss.chain, boss.level, 1, 0, 1, boss);
  else enemy.forEach(([ch, lv], i) => mkFighter(ch, lv, 1, i, enemyFactor));

  function drawBar(f: Fighter) {
    const w = f.barW, half = w / 2;
    f.bar.clear();
    f.bar.fillStyle(0x000000, 0.6); f.bar.fillRoundedRect(-half, w > 120 ? 118 : 66, w, 12, 6);
    const k = Math.max(0, f.hp / f.maxHp);
    f.bar.fillStyle(k > 0.5 ? 0x5fae57 : k > 0.25 ? 0xffb84d : 0xe0405a);
    if (k > 0) f.bar.fillRoundedRect(-half + 2, (w > 120 ? 118 : 66) + 2, (w - 4) * k, 8, 4);
  }

  let over = false;
  function hit(target: Fighter, dmg: number) {
    if (!target.alive || over) return;
    target.hp -= dmg;
    drawBar(target);
    const t = scene.add.text(target.obj.x, target.obj.y - 60, `-${dmg}`, { fontFamily: FONT, fontSize: '30px', color: '#ff7070', fontStyle: '800' }).setOrigin(0.5).setDepth(75).setStroke('#1a1230', 4);
    scene.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    scene.tweens.add({ targets: target.obj, x: target.obj.x + (target.side ? 14 : -14), duration: 60, yoyo: true });
    if (target.hp <= 0) {
      target.alive = false;
      scene.tweens.add({ targets: target.obj, alpha: 0, angle: target.side ? 90 : -90, y: target.obj.y + 40, duration: 450 });
      checkEnd();
    }
  }

  function attack(f: Fighter) {
    // Выбор цели и урон — общие правила из arena.ts (по ним же считает симуляция).
    const plan = attackPlan(f, fighters);
    if (!plan) return;
    const { targets, dmg } = plan;
    const dir = f.side === 0 ? 1 : -1;
    if (f.type === 'melee') {
      const target = targets[0];
      scene.tweens.add({ targets: f.obj, x: f.obj.x + dir * 55, duration: 130, yoyo: true, onYoyo: () => hit(target, rollDamage(dmg)) });
    } else {
      targets.forEach(target => {
        const p = scene.add.circle(f.obj.x + dir * 50, f.obj.y, 9, (CHAINS[f.chain] ?? { color: 0xffe066 }).color).setDepth(74);
        scene.tweens.add({ targets: p, x: target.obj.x, y: target.obj.y, duration: 220, onComplete: () => { p.destroy(); hit(target, rollDamage(dmg)); } });
      });
      clickSound(2);
    }
  }

  const timer = scene.time.addEvent({
    delay: TICK_MS, loop: true, callback: () => {
      if (over) return;
      fighters.forEach(f => {
        if (!f.alive) return;
        f.next -= TICK_MS;
        if (f.next <= 0) { f.next = f.spd; attack(f); }
      });
    },
  });

  let speed = 1;
  root.add(button(scene, W / 2, H - 70, 220, 58, t('battle.speed'), 0x5a48a8, () => {
    speed = speed === 1 ? 2 : 1;
    scene.time.timeScale = speed;
    scene.tweens.timeScale = speed;
  }, 22));

  function checkEnd() {
    if (over) return;
    const alive0 = fighters.some(f => f.side === 0 && f.alive);
    const alive1 = fighters.some(f => f.side === 1 && f.alive);
    if (alive0 && alive1) return;
    over = true;
    (alive0 ? jingleFanfare : failSound)();
    scene.time.timeScale = 1;
    scene.tweens.timeScale = 1;
    timer.remove();
    scene.time.delayedCall(900, () => { root.destroy(); onEnd(alive0); });
  }
}
