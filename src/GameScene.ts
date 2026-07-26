import Phaser from 'phaser';
import { W, H, GRID, ENERGY, OFFLINE, GEN, PRICES, CHAINS, RARITY, ORDER_REWARD_BY_LEVEL, INTERSTITIAL } from './config';
import { S, QUESTS, STREAK_REWARDS, restore, persist, streakStatus, interstitialAllowed, today } from './state';
import * as sdk from './sdk';
import * as ui from './ui';
import { popSound, coinSound, failSound, tada } from './audio';
import { openShop, ShopApi } from './shop';

interface Item { chain: number; level: number; obj: Phaser.GameObjects.Container }
interface Order { chain: number; level: number; text: Phaser.GameObjects.Text }

export class GameScene extends Phaser.Scene {
  private grid: (Item | null)[][] = [];
  private orders: Order[] = [];
  private coinsText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private genTexts: Phaser.GameObjects.Text[] = [];
  private questBadge!: Phaser.GameObjects.Arc;
  private lockedOverlay?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  private api: ShopApi = { spawnReward: (lv) => this.spawnReward(lv), refreshHud: () => this.refreshHud() };

  constructor() { super('game'); }

  async create() {
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    const hadSave = await restore();
    for (const id of await sdk.restorePurchases()) {
      if (id === 'no_ads') S.noAds = true;
      if (id === 'starter') S.starterBought = true;
    }

    this.drawBoard();
    this.drawGenerators();
    this.drawHud();
    this.makeOrders();

    if (hadSave) S.items.forEach(([r, c, ch, lv]) => this.spawnItem(ch, lv, r, c, true));
    else this.startFtue();

    const st = streakStatus();
    if (st) this.streakPanel(st, () => this.offlinePopup());
    else this.offlinePopup();
    sdk.gameplayStart();

    this.time.addEvent({ delay: ENERGY.regenMs, loop: true, callback: () => { S.energy = Math.min(ENERGY.max, S.energy + 1); this.refreshHud(); } });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickGenerators() });
    this.time.addEvent({ delay: 10_000, loop: true, callback: () => { this.persistBoard(); sdk.setLeaderboardScore(S.score); } });
  }

  private maxRows() { return S.rowUnlocked ? GRID.rows : GRID.rows - 1; }

  // ---------- поле ----------
  private drawBoard() {
    const { cols, rows, cell, x, y } = GRID;
    this.add.rectangle(W / 2, y + (rows * cell) / 2, cols * cell + 12, rows * cell + 12, 0x2a1f4d).setStrokeStyle(3, 0x4a3a80);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.add.rectangle(x + c * cell + cell / 2, y + r * cell + cell / 2, cell - 6, cell - 6, 0x342a5c);
    if (!S.rowUnlocked) this.drawLockedRow();
  }

  private drawLockedRow() {
    const r = GRID.rows - 1;
    const ov = this.add.container(0, 0).setDepth(5);
    for (let c = 0; c < GRID.cols; c++) {
      const { x, y } = this.cellXY(r, c);
      const rect = this.add.rectangle(x, y, GRID.cell - 6, GRID.cell - 6, 0x161028, 0.92).setInteractive();
      rect.on('pointerdown', () => this.unlockPanel());
      ov.add([rect, this.add.text(x, y, '🔒', { fontSize: '30px' }).setOrigin(0.5)]);
    }
    this.lockedOverlay = ov;
  }

  private unlockPanel() {
    const p = ui.panel(this, '🔒 Седьмой ряд поля');
    p.add(this.add.text(W / 2, H / 2 - 300, 'Больше места — больше существ\nи длиннее цепочки!', { fontSize: '28px', color: '#fff', align: 'center' }).setOrigin(0.5));
    const buy = (ok: boolean, spend: () => void) => {
      if (!ok) { failSound(); ui.toast(this, W / 2, H / 2, 'Не хватает средств', '#ff7070'); return; }
      spend(); S.rowUnlocked = true; this.lockedOverlay?.destroy(); tada(); persist(true); p.destroy();
    };
    p.add(ui.button(this, W / 2, H / 2 - 150, 420, 70, `Открыть за ${PRICES.rowCoins}🪙`, 0x5a48a8,
      () => buy(S.coins >= PRICES.rowCoins, () => { S.coins -= PRICES.rowCoins; this.refreshHud(); })));
    p.add(ui.button(this, W / 2, H / 2 - 60, 420, 70, `Открыть за ${PRICES.rowGems}💎`, 0x8f5ad0,
      () => buy(S.gems >= PRICES.rowGems, () => { S.gems -= PRICES.rowGems; this.refreshHud(); })));
  }

  private cellXY(r: number, c: number) {
    return { x: GRID.x + c * GRID.cell + GRID.cell / 2, y: GRID.y + r * GRID.cell + GRID.cell / 2 };
  }

  private cellAt(px: number, py: number): [number, number] | null {
    const c = Math.floor((px - GRID.x) / GRID.cell), r = Math.floor((py - GRID.y) / GRID.cell);
    return r >= 0 && r < this.maxRows() && c >= 0 && c < GRID.cols ? [r, c] : null;
  }

  private findEmpty(): [number, number] | null {
    const empty: [number, number][] = [];
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) if (!this.grid[r][c]) empty.push([r, c]);
    return empty.length ? Phaser.Math.RND.pick(empty) : null;
  }

  private spawnItem(chain: number, level: number, r: number, c: number, silent = false) {
    const { x, y } = this.cellXY(r, c);
    const cfg = CHAINS[chain];
    const box = this.add.container(x, y);
    const bg = this.add.circle(0, 0, 42, cfg.color).setStrokeStyle(3, level >= 4 ? 0xffe066 : 0xffffff, 0.6);
    const label = this.add.text(0, 0, `${cfg.names[level][0]}${level + 1}`, { fontSize: '26px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    box.add([bg, label]).setSize(GRID.cell, GRID.cell).setInteractive({ draggable: true });
    const item: Item = { chain, level, obj: box };
    this.grid[r][c] = item;
    this.wireDrag(item);
    if (!silent) this.tweens.add({ targets: box, scale: { from: 0.3, to: 1 }, duration: 150 });
    this.checkDiscovery(chain, level, silent);
  }

  private checkDiscovery(chain: number, level: number, silent: boolean) {
    if (S.discovered[chain][level]) return;
    S.discovered[chain][level] = true;
    if (silent) return;
    const coins = 25 * (level + 1), gems = level >= 4 ? 5 : 0;
    S.coins += coins; S.gems += gems;
    tada();
    ui.toast(this, W / 2, GRID.y - 20, `📖 Открыто: ${CHAINS[chain].names[level]}! +${coins}🪙${gems ? ` +${gems}💎` : ''}`);
    this.refreshHud();
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
    const level = a.level + 1;
    this.spawnItem(a.chain, level, ...at);
    popSound(level);
    S.quests.progress.merges++;
    S.score += level * 2;
    if (this.hint) { this.hint.destroy(); this.hint = undefined; ui.toast(this, W / 2, 180, 'Отлично! Теперь выполни заказ наверху 👆'); }
    if (level >= 3) this.maybeStarterOffer();
    this.refreshHud();
    this.persistBoard();
  }

  // ---------- генераторы ----------
  private drawGenerators() {
    CHAINS.forEach((cfg, i) => {
      const x = 120 + i * 160, y = 308;
      const circle = this.add.circle(x, y, 32, cfg.color).setStrokeStyle(3, 0xffffff, 0.5).setInteractive();
      this.add.text(x, y - 2, cfg.names[0][0], { fontSize: '26px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
      this.genTexts.push(this.add.text(x, y + 42, '', { fontSize: '18px', color: '#7fdcff' }).setOrigin(0.5));
      circle.on('pointerdown', () => this.tapGenerator(i));
    });
    this.tickGenerators();
  }

  private tapGenerator(i: number) {
    const left = GEN.cooldownMs - (Date.now() - S.genLast[i]);
    if (left > 0) { failSound(); ui.toast(this, 120 + i * 160, 260, `Ещё ${Math.ceil(left / 1000)} с`, '#ff7070'); return; }
    const cell = this.findEmpty();
    if (!cell) { failSound(); ui.toast(this, W / 2, 260, 'Поле заполнено!', '#ff7070'); return; }
    S.genLast[i] = Date.now();
    this.spawnItem(i, 0, ...cell);
    S.quests.progress.spawns++;
    this.refreshHud();
  }

  private tickGenerators() {
    this.genTexts.forEach((t, i) => {
      const left = GEN.cooldownMs - (Date.now() - S.genLast[i]);
      t.setText(left > 0 ? `${Math.ceil(left / 1000)}с` : 'ГОТОВ').setColor(left > 0 ? '#8f86b8' : '#7fdcff');
    });
  }

  // ---------- HUD ----------
  private drawHud() {
    this.add.text(W / 2, 36, 'BRAINROT LAB: MERGE', { fontSize: '38px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5);
    this.coinsText = this.add.text(40, 86, '', { fontSize: '30px', color: '#fff' });
    this.gemsText = this.add.text(260, 86, '', { fontSize: '30px', color: '#c9a6ff' });
    this.energyText = this.add.text(460, 86, '', { fontSize: '30px', color: '#7fdcff' });

    ui.button(this, 140, 1132, 200, 56, '💎 Магазин', 0x8f5ad0, () => openShop(this, this.api), 22);
    ui.button(this, 360, 1132, 200, 56, '📋 Задания', 0x2e6d9d, () => this.questsPanel(), 22);
    this.questBadge = this.add.circle(450, 1108, 10, 0xff5050).setDepth(1);
    ui.button(this, 580, 1132, 200, 56, '📖 Мемпедия', 0x5a48a8, () => this.memePanel(), 22);

    ui.button(this, 200, 1210, 360, 64, `Существо (-${ENERGY.spawnCost}⚡)`, 0x5a48a8, () => this.trySpawn());
    // Rewarded-точка: игрок сам меняет ролик на энергию (PLAN.md §4).
    ui.button(this, 555, 1210, 290, 64, `+${ENERGY.adRefill}⚡ за рекламу`, 0x2e7d5b, () =>
      sdk.showRewarded(() => { S.energy = Math.min(ENERGY.max, S.energy + ENERGY.adRefill); this.refreshHud(); ui.toast(this, 555, 1160, `+${ENERGY.adRefill}⚡`, '#7fdcff'); }), 24);
    this.refreshHud();
  }

  private refreshHud() {
    this.coinsText.setText(`🪙 ${S.coins}`);
    this.gemsText.setText(`💎 ${S.gems}`);
    this.energyText.setText(`⚡ ${Math.floor(S.energy)}/${ENERGY.max}`);
    const claimable = QUESTS.some((q, i) => !S.quests.claimed[i] && S.quests.progress[q.id] >= q.target);
    this.questBadge?.setVisible(claimable);
  }

  private trySpawn() {
    if (S.energy < ENERGY.spawnCost) { failSound(); ui.toast(this, W / 2, 1160, 'Нет энергии!', '#ff7070'); return; }
    const cell = this.findEmpty();
    if (!cell) { failSound(); ui.toast(this, W / 2, 1160, 'Поле заполнено!', '#ff7070'); return; }
    S.energy -= ENERGY.spawnCost;
    this.spawnItem(Phaser.Math.Between(0, CHAINS.length - 1), 0, ...cell);
    S.quests.progress.spawns++;
    this.refreshHud();
  }

  private spawnReward(level: number): boolean {
    const cell = this.findEmpty();
    if (!cell) return false;
    this.spawnItem(Phaser.Math.Between(0, CHAINS.length - 1), Math.min(level, 5), ...cell);
    this.persistBoard();
    return true;
  }

  // ---------- заказы ----------
  private makeOrders() { for (let i = 0; i < 3; i++) this.newOrder(i); }

  private newOrder(slot: number) {
    // Сложность растёт с прогрессом: заказы не выше уже открытых уровней (+1 на вырост).
    let maxLv = 1;
    S.discovered.forEach(arr => arr.forEach((d, lv) => { if (d) maxLv = Math.max(maxLv, lv); }));
    const level = Phaser.Math.Between(1, Math.min(4, maxLv + 1));
    const chain = Phaser.Math.Between(0, CHAINS.length - 1);
    this.orders[slot]?.text.destroy();
    const text = this.add.text(130 + slot * 230, 200, `Ролик с:\n${CHAINS[chain].names[level]}\n🪙 ${ORDER_REWARD_BY_LEVEL[level]}`,
      { fontSize: '21px', color: '#fff', backgroundColor: '#3d2f6e', padding: { x: 10, y: 8 }, align: 'center' })
      .setOrigin(0.5).setInteractive();
    text.on('pointerdown', () => this.deliver(slot));
    this.orders[slot] = { chain, level, text };
  }

  private deliver(slot: number) {
    const o = this.orders[slot];
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c];
      if (it && it.chain === o.chain && it.level === o.level) {
        it.obj.destroy(); this.grid[r][c] = null;
        S.coins += ORDER_REWARD_BY_LEVEL[o.level];
        S.ordersDone++; S.quests.progress.orders++; S.score += o.level * 3;
        coinSound();
        ui.toast(this, o.text.x, o.text.y, `+${ORDER_REWARD_BY_LEVEL[o.level]}🪙`);
        this.newOrder(slot);
        // Естественный стык для interstitial (капы в sdk.ts, отключаемо покупкой).
        if (S.ordersDone % INTERSTITIAL.everyNOrders === 0 && interstitialAllowed()) sdk.maybeInterstitial();
        this.refreshHud(); this.persistBoard();
        return;
      }
    }
    failSound();
    ui.toast(this, o.text.x, o.text.y, 'Нет такого существа', '#ff7070');
  }

  // ---------- ежедневный бонус ----------
  private streakPanel(mode: 'claim' | 'lost', onDone: () => void) {
    const p = ui.panel(this, '📅 Ежедневный бонус', onDone);
    const nextDay = mode === 'lost' ? 1 : (S.streakDay % 7) + 1;
    const savedDay = (S.streakDay % 7) + 1;
    STREAK_REWARDS.forEach((rw, i) => {
      const x = W / 2 - 270 + i * 90, y = H / 2 - 280;
      const got = i + 1 < (mode === 'lost' ? savedDay : nextDay);
      this.addTo(p, this.add.circle(x, y, 34, got ? 0x2e7d5b : i + 1 === nextDay ? 0xffe066 : 0x3a3a55).setStrokeStyle(2, 0xffffff, 0.4));
      this.addTo(p, this.add.text(x, y, `${i + 1}`, { fontSize: '24px', color: got || i + 1 === nextDay ? '#241a45' : '#fff' }).setOrigin(0.5));
      this.addTo(p, this.add.text(x, y + 56, rw.chest ? '📦' : rw.gems ? `${rw.gems}💎` : `${rw.coins}🪙`, { fontSize: '18px', color: '#c9a6ff' }).setOrigin(0.5));
    });
    const claim = (day: number) => {
      const rw = STREAK_REWARDS[day - 1];
      S.coins += rw.coins ?? 0; S.gems += rw.gems ?? 0;
      if (rw.chest) this.spawnReward(4);
      S.streakDay = day; S.streakLast = today();
      tada(); this.refreshHud(); persist(true); p.destroy(); onDone();
    };
    if (mode === 'claim') {
      this.addTo(p, ui.button(this, W / 2, H / 2, 420, 76, `Забрать бонус дня ${nextDay}!`, 0x2e7d5b, () => claim(nextDay)));
    } else {
      // Мягкий loss aversion: серию можно спасти рекламой — без реальной потери (PLAN.md §15).
      this.addTo(p, this.add.text(W / 2, H / 2 - 120, `Серия из ${S.streakDay} дн. прервалась!`, { fontSize: '30px', color: '#ff9d70' }).setOrigin(0.5));
      this.addTo(p, ui.button(this, W / 2, H / 2, 480, 76, '🎬 Спасти серию за рекламу', 0x2e7d5b,
        () => sdk.showRewarded(() => claim(savedDay))));
      this.addTo(p, ui.button(this, W / 2, H / 2 + 100, 480, 64, 'Начать серию заново', 0x5a48a8, () => claim(1)));
    }
  }

  private addTo(p: Phaser.GameObjects.Container, obj: Phaser.GameObjects.GameObject) { p.add(obj); }

  // ---------- квесты ----------
  private questsPanel() {
    const p = ui.panel(this, '📋 Задания дня');
    QUESTS.forEach((q, i) => {
      const y = H / 2 - 260 + i * 150;
      const prog = Math.min(S.quests.progress[q.id], q.target);
      this.addTo(p, this.add.text(W / 2 - 290, y, `${q.label}\n${prog}/${q.target} · награда ${q.coins}🪙 +${q.gems}💎`, { fontSize: '26px', color: '#fff' }));
      if (S.quests.claimed[i])
        this.addTo(p, this.add.text(W / 2 + 210, y + 20, '✅', { fontSize: '40px' }).setOrigin(0.5));
      else if (prog >= q.target)
        this.addTo(p, ui.button(this, W / 2 + 210, y + 24, 170, 60, 'Забрать', 0x2e7d5b, () => {
          S.quests.claimed[i] = true; S.coins += q.coins; S.gems += q.gems;
          coinSound(); this.refreshHud(); persist(); p.destroy(); this.questsPanel();
        }));
    });
    this.addTo(p, this.add.text(W / 2, H / 2 + 260, 'Новые задания — каждый день!', { fontSize: '24px', color: '#8f86b8' }).setOrigin(0.5));
  }

  // ---------- Мемпедия ----------
  private memePanel() {
    const total = CHAINS.length * CHAINS[0].names.length;
    const found = S.discovered.flat().filter(Boolean).length;
    const p = ui.panel(this, `📖 Мемпедия ${found}/${total}`);
    CHAINS.forEach((cfg, ci) => {
      const x = W / 2 - 240 + ci * 160;
      this.addTo(p, this.add.circle(x, H / 2 - 330, 18, cfg.color));
      cfg.names.forEach((name, lv) => {
        const known = S.discovered[ci][lv];
        this.addTo(p, this.add.text(x, H / 2 - 280 + lv * 100, known ? name : '???',
          { fontSize: '17px', color: known ? RARITY[lv].color : '#5a5474', align: 'center', wordWrap: { width: 150 } }).setOrigin(0.5));
      });
    });
  }

  // ---------- стартер-пак: единственный проактивный офер, один раз, после «вау» ----------
  private maybeStarterOffer() {
    if (S.starterBought || S.starterOffered || this.time.now < 90_000) return;
    S.starterOffered = true; persist(true);
    const p = ui.panel(this, '🎁 Подарок новичку');
    this.addTo(p, this.add.text(W / 2, H / 2 - 220, 'Стартовый набор — выгода ×5\n\n150💎 + 5000🪙\n+ 7 дней без рекламы\n\nТолько один раз!',
      { fontSize: '30px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 120, 420, 76, 'Забрать со скидкой', 0x2e7d5b, async () => {
      if (await sdk.purchase('starter', false)) {
        S.starterBought = true; S.gems += 150; S.coins += 5000; S.adFreeUntil = Date.now() + 7 * 86_400_000;
        tada(); this.refreshHud(); persist(true);
      }
      p.destroy();
    }));
  }

  // ---------- офлайн-доход ----------
  private offlinePopup() {
    const hours = Math.min((Date.now() - S.lastSeen) / 3.6e6, OFFLINE.capHours);
    const earned = Math.floor(hours * OFFLINE.coinsPerHour);
    if (earned < 5) return;
    const p = ui.panel(this, '💤 Пока вас не было…');
    this.addTo(p, this.add.text(W / 2, H / 2 - 200, `Существа заработали:\n🪙 ${earned}`, { fontSize: '38px', color: '#fff', align: 'center' }).setOrigin(0.5));
    const claim = (mult: number) => { S.coins += earned * mult; coinSound(); this.refreshHud(); persist(); p.destroy(); };
    this.addTo(p, ui.button(this, W / 2, H / 2, 420, 72, `Забрать ${earned}🪙`, 0x5a48a8, () => claim(1)));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 100, 480, 72, `🎬 Забрать ×2 (${earned * 2}🪙)`, 0x2e7d5b,
      () => sdk.showRewarded(() => claim(2))));
  }

  // ---------- FTUE: первое слияние — в первые 10 секунд (PLAN.md §15) ----------
  private startFtue() {
    this.spawnItem(0, 0, 2, 2);
    this.spawnItem(0, 0, 2, 3);
    this.hint = this.add.text(W / 2, GRID.y - 24, '👆 Перетащи одно существо на другое!', { fontSize: '26px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5);
    this.tweens.add({ targets: this.hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 500 });
  }

  // ---------- сейв ----------
  private persistBoard(force = false) {
    const items: number[][] = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) items.push([r, c, it.chain, it.level]);
    }
    S.items = items;
    persist(force);
  }
}
