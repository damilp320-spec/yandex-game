import Phaser from 'phaser';
import { W, GRID, ENERGY, OFFLINE, CHAINS, ORDER_REWARD_BY_LEVEL } from './config';
import * as sdk from './sdk';

interface Item { chain: number; level: number; obj: Phaser.GameObjects.Container }
interface Order { chain: number; level: number; text: Phaser.GameObjects.Text }

export class GameScene extends Phaser.Scene {
  private grid: (Item | null)[][] = [];
  private coins = 0;
  private energy = ENERGY.max;
  private lastSeen = Date.now();
  private ordersDone = 0;
  private orders: Order[] = [];
  private coinsText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;

  constructor() { super('game'); }

  async create() {
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    this.drawBoard();
    this.drawHud();
    await this.restore();
    this.makeOrders();
    this.offlinePopup();
    sdk.gameplayStart();

    this.time.addEvent({ delay: ENERGY.regenMs, loop: true, callback: () => this.addEnergy(1) });
    this.time.addEvent({ delay: 10_000, loop: true, callback: () => this.persist() });
  }

  // ---------- поле ----------
  private drawBoard() {
    const { cols, rows, cell, x, y } = GRID;
    this.add.rectangle(W / 2, y + (rows * cell) / 2, cols * cell + 12, rows * cell + 12, 0x2a1f4d).setStrokeStyle(3, 0x4a3a80);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.add.rectangle(x + c * cell + cell / 2, y + r * cell + cell / 2, cell - 6, cell - 6, 0x342a5c);
  }

  private cellXY(r: number, c: number) {
    return { x: GRID.x + c * GRID.cell + GRID.cell / 2, y: GRID.y + r * GRID.cell + GRID.cell / 2 };
  }

  private cellAt(px: number, py: number): [number, number] | null {
    const c = Math.floor((px - GRID.x) / GRID.cell), r = Math.floor((py - GRID.y) / GRID.cell);
    return r >= 0 && r < GRID.rows && c >= 0 && c < GRID.cols ? [r, c] : null;
  }

  private spawn(chain: number, level: number, r: number, c: number) {
    const { x, y } = this.cellXY(r, c);
    const cfg = CHAINS[chain];
    const box = this.add.container(x, y);
    const bg = this.add.circle(0, 0, 44, cfg.color).setStrokeStyle(3, 0xffffff, 0.5);
    const label = this.add.text(0, 0, `${cfg.names[level][0]}${level + 1}`, { fontSize: '28px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    box.add([bg, label]).setSize(GRID.cell, GRID.cell).setInteractive({ draggable: true });
    const item: Item = { chain, level, obj: box };
    this.grid[r][c] = item;
    this.wireDrag(item);
    this.tweens.add({ targets: box, scale: { from: 0.3, to: 1 }, duration: 150 });
  }

  private wireDrag(item: Item) {
    const box = item.obj;
    box.on('drag', (_p: unknown, dx: number, dy: number) => { box.setPosition(dx, dy).setDepth(10); });
    box.on('dragend', () => {
      box.setDepth(0);
      const from = this.findItem(item)!;
      const to = this.cellAt(box.x, box.y);
      if (to) {
        const [r, c] = to, target = this.grid[r][c];
        if (!target) { this.grid[from[0]][from[1]] = null; this.grid[r][c] = item; }
        else if (target !== item && target.chain === item.chain && target.level === item.level && item.level < CHAINS[item.chain].names.length - 1) {
          this.merge(item, target, from, [r, c]); return;
        }
      }
      const pos = this.cellXY(...this.findItem(item)!);
      box.setPosition(pos.x, pos.y);
    });
  }

  private findItem(item: Item): [number, number] | null {
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (this.grid[r][c] === item) return [r, c];
    return null;
  }

  private merge(a: Item, b: Item, fromA: [number, number], at: [number, number]) {
    this.grid[fromA[0]][fromA[1]] = null;
    this.grid[at[0]][at[1]] = null;
    a.obj.destroy(); b.obj.destroy();
    this.spawn(a.chain, a.level + 1, ...at);
    this.toast(this.cellXY(...at), CHAINS[a.chain].names[a.level + 1], 0xffe066);
    this.persist();
  }

  // ---------- HUD, энергия, спавн ----------
  private drawHud() {
    this.add.text(W / 2, 40, 'BRAINROT LAB: MERGE', { fontSize: '40px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5);
    this.coinsText = this.add.text(40, 90, '', { fontSize: '32px', color: '#fff' });
    this.energyText = this.add.text(40, 135, '', { fontSize: '32px', color: '#7fdcff' });
    this.refreshHud();

    this.button(W / 2, 1180, `Существо (-${ENERGY.spawnCost}⚡)`, () => this.trySpawn());
    // Rewarded-точка: игрок сам меняет ролик на энергию (PLAN.md §4).
    this.button(W / 2, 1090, `+${ENERGY.adRefill}⚡ за рекламу`, () =>
      sdk.showRewarded(() => { this.addEnergy(ENERGY.adRefill); this.toast({ x: W / 2, y: 1040 }, `+${ENERGY.adRefill}⚡`, 0x7fdcff); }), 0x2e7d5b);
  }

  private button(x: number, y: number, label: string, onClick: () => void, color = 0x5a48a8) {
    const r = this.add.rectangle(x, y, 400, 70, color).setStrokeStyle(2, 0xffffff, 0.6).setInteractive();
    this.add.text(x, y, label, { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
    r.on('pointerdown', onClick);
  }

  private trySpawn() {
    if (this.energy < ENERGY.spawnCost) { this.toast({ x: W / 2, y: 1180 }, 'Нет энергии!', 0xff7070); return; }
    const empty: [number, number][] = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (!this.grid[r][c]) empty.push([r, c]);
    if (!empty.length) { this.toast({ x: W / 2, y: 1180 }, 'Поле заполнено!', 0xff7070); return; }
    this.energy -= ENERGY.spawnCost;
    const [r, c] = Phaser.Math.RND.pick(empty);
    this.spawn(Phaser.Math.Between(0, CHAINS.length - 1), 0, r, c);
    this.refreshHud();
  }

  private addEnergy(n: number) { this.energy = Math.min(ENERGY.max, this.energy + n); this.refreshHud(); }
  private refreshHud() { this.coinsText.setText(`🪙 ${this.coins}`); this.energyText.setText(`⚡ ${Math.floor(this.energy)}/${ENERGY.max}`); }

  // ---------- заказы ----------
  private makeOrders() {
    for (let i = 0; i < 3; i++) this.newOrder(i);
  }

  private newOrder(slot: number) {
    const chain = Phaser.Math.Between(0, CHAINS.length - 1);
    const level = Phaser.Math.Between(1, 3);
    const x = 130 + slot * 235, y = 250;
    this.orders[slot]?.text.destroy();
    const text = this.add.text(x, y, `Ролик с:\n${CHAINS[chain].names[level]}\n🪙 ${ORDER_REWARD_BY_LEVEL[level]}`,
      { fontSize: '22px', color: '#fff', backgroundColor: '#3d2f6e', padding: { x: 10, y: 8 }, align: 'center' })
      .setOrigin(0.5).setInteractive();
    text.on('pointerdown', () => this.deliver(slot));
    this.orders[slot] = { chain, level, text };
  }

  private deliver(slot: number) {
    const o = this.orders[slot];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c];
      if (it && it.chain === o.chain && it.level === o.level) {
        it.obj.destroy(); this.grid[r][c] = null;
        this.coins += ORDER_REWARD_BY_LEVEL[o.level];
        this.ordersDone++;
        this.refreshHud();
        this.toast({ x: o.text.x, y: o.text.y }, `+${ORDER_REWARD_BY_LEVEL[o.level]}🪙`, 0xffe066);
        this.newOrder(slot);
        // Естественный стык для interstitial: каждая 5-я пачка заказов (с капами из sdk.ts).
        if (this.ordersDone % 5 === 0) sdk.maybeInterstitial();
        this.persist();
        return;
      }
    }
    this.toast({ x: o.text.x, y: o.text.y }, 'Нет такого существа', 0xff7070);
  }

  // ---------- офлайн-доход ----------
  private offlinePopup() {
    const hours = Math.min((Date.now() - this.lastSeen) / 3.6e6, OFFLINE.capHours);
    const earned = Math.floor(hours * OFFLINE.coinsPerHour);
    if (earned < 5) return;
    const panel = this.add.container(W / 2, 640).setDepth(20);
    const bg = this.add.rectangle(0, 0, 560, 320, 0x241a45).setStrokeStyle(4, 0xffe066);
    const title = this.add.text(0, -100, `Пока вас не было:\n🪙 ${earned}`, { fontSize: '36px', color: '#fff', align: 'center' }).setOrigin(0.5);
    const take = this.add.text(0, 30, `Забрать ${earned}`, { fontSize: '30px', color: '#fff', backgroundColor: '#5a48a8', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive();
    const x2 = this.add.text(0, 110, `Забрать ×2 за рекламу (${earned * 2})`, { fontSize: '26px', color: '#fff', backgroundColor: '#2e7d5b', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive();
    panel.add([bg, title, take, x2]);
    const claim = (mult: number) => { this.coins += earned * mult; this.refreshHud(); panel.destroy(); this.persist(); };
    take.on('pointerdown', () => claim(1));
    x2.on('pointerdown', () => sdk.showRewarded(() => claim(2)));
  }

  // ---------- сейвы ----------
  private persist(force = false) {
    const items: [number, number, number, number][] = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) items.push([r, c, it.chain, it.level]);
    }
    sdk.save({ v: 1, coins: this.coins, energy: this.energy, items, lastSeen: Date.now() }, force);
  }

  private async restore() {
    const s = (await sdk.load()) as any;
    if (!s) { this.spawn(0, 0, 2, 2); this.spawn(0, 0, 2, 3); return; } // FTUE: первое слияние за 10 сек
    this.coins = s.coins ?? 0;
    this.energy = s.energy ?? ENERGY.max;
    this.lastSeen = s.lastSeen ?? Date.now();
    (s.items ?? []).forEach(([r, c, ch, lv]: number[]) => this.spawn(ch, lv, r, c));
    this.refreshHud();
  }

  private toast(at: { x: number; y: number }, msg: string, color: number) {
    const t = this.add.text(at.x, at.y, msg, { fontSize: '30px', color: `#${color.toString(16)}`, fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: at.y - 80, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
}
