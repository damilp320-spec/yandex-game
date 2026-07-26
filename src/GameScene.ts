import Phaser from 'phaser';
import { W, H, GRID, INCOME, SPAWN, GOLDEN, incomeOf, OFFLINE_MIN_COINS, GEN, PRICES, CHAINS, RARITY, ORDER_REWARD_BY_LEVEL, INTERSTITIAL, Chain, ZONES, SECRET_CHAIN, FONT } from './config';
import { activeEvent, daysLeft, EventDef } from './events';
import { generateSprites, textureKey, EVENT_CHAIN_INDEX } from './sprites';
import { queueSkinLoads } from './assets';
import { unitStats, teamPower, upgradeCost, ARENA_MILESTONES, makeEnemy, cupsDelta, EnemyTeam } from './arena';
import { startBattle } from './battle';
import { track } from './analytics';
import { S, QUESTS, STREAK_REWARDS, restore, persist, streakStatus, interstitialAllowed, today, isoWeek } from './state';
import * as sdk from './sdk';
import * as ui from './ui';
import { jingleMerge, jingleOrder, jingleDiscovery, jingleFanfare, coinSound, clickSound, failSound, tada, registerSoundScene } from './audio';
import { openShop, rollChest, ShopApi } from './shop';

interface Item { chain: number; level: number; obj: Phaser.GameObjects.Container }
interface Order { chain: number; level: number; text: Phaser.GameObjects.Text }

export class GameScene extends Phaser.Scene {
  private static popupsShown = false; // стрик/офлайн показываем раз за сессию, не при смене локации
  private grid: (Item | null)[][] = [];
  private orders: Order[] = [];
  private genEntries: { chain: number; text: Phaser.GameObjects.Text }[] = [];
  private coinsText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private spawnLabel?: Phaser.GameObjects.Text;
  private comboCount = 0;
  private comboLast = 0;
  private golden?: Phaser.GameObjects.Image;
  private questBadge!: Phaser.GameObjects.Arc;
  private lockedOverlay?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  private ev: EventDef | null = null;
  private evCfg?: Chain;
  private api: ShopApi = {
    spawnReward: (lv) => this.spawnReward(lv),
    spawnSecret: () => this.spawnSecret(),
    refreshHud: () => this.refreshHud(),
  };

  /** Конфиг цепочки с учётом событийной (индекс за пределами CHAINS). */
  private chainCfg(i: number): Chain { return i === EVENT_CHAIN_INDEX && this.evCfg ? this.evCfg : CHAINS[i]; }

  constructor() { super('game'); }

  preload() {
    // Кастомные PNG-скины игрока грузятся ПОД штатными ключами (см. assets.ts).
    queueSkinLoads(this.load, activeEvent()?.id);
  }

  async create() {
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    this.orders = [];
    this.genEntries = [];
    const hadSave = await restore();
    this.drawZoneBg();
    registerSoundScene(this);
    this.loadCustomSounds();
    for (const id of await sdk.restorePurchases()) {
      if (id === 'no_ads') S.noAds = true;
      if (id === 'starter') S.starterBought = true;
    }

    this.ev = activeEvent();
    if (this.ev) {
      this.evCfg = { id: this.ev.id, color: this.ev.color, names: this.ev.names };
      if (S.event.id !== this.ev.id) S.event = { id: this.ev.id, points: 0, claimed: this.ev.milestones.map(() => false) };
    }
    generateSprites(this, CHAINS, 0);
    if (this.evCfg) generateSprites(this, [this.evCfg], EVENT_CHAIN_INDEX);

    this.drawBoard();
    this.drawGenerators();
    this.drawHud();
    this.makeOrders();

    if (!hadSave && S.zone === 0) this.startFtue();
    else (S.itemsZ[S.zone] ?? []).forEach(([r, c, ch, lv]) => {
      // Существа закончившегося события конвертируются в монеты — ничего не пропадает.
      if (ch >= CHAINS.length && !this.evCfg) { S.coins += 100 * (lv + 1); return; }
      this.spawnItem(ch, lv, r, c, true);
    });

    if (!GameScene.popupsShown) {
      GameScene.popupsShown = true;
      const st = streakStatus();
      if (st) this.streakPanel(st, () => this.offlinePopup());
      else this.offlinePopup();
    }
    sdk.gameplayStart();

    this.input.dragDistanceThreshold = 12; // короткий тап = клик по существу, не драг
    this.syncBattleWeek();
    this.time.addEvent({ delay: INCOME.periodMs, loop: true, callback: () => this.incomeTick() });
    this.time.addEvent({ delay: GOLDEN.intervalMs, loop: true, callback: () => this.spawnGolden() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickGenerators() });
    this.time.addEvent({ delay: 10_000, loop: true, callback: () => { this.persistBoard(); sdk.submitScore('weekly_merges', S.score); } });
  }

  // ---------- пассивный доход и кликер ----------
  private totalIncome(): number {
    let sum = 0;
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) sum += incomeOf(it.chain, it.level);
    }
    return sum;
  }

  private incomeTick() {
    const inc = this.totalIncome();
    if (!inc) return;
    const mult = Date.now() < S.boostUntil ? S.boostMult : 1;
    S.coins += inc * mult;
    this.refreshHud();
    this.tweens.add({ targets: this.incomeText, scale: { from: 1.25, to: 1 }, duration: 250 });
  }

  private tapCreature(item: Item) {
    const now = Date.now();
    this.comboCount = now - this.comboLast < 1200 ? Math.min(5, this.comboCount + 1) : 1;
    this.comboLast = now;
    const gain = Math.ceil(incomeOf(item.chain, item.level) / 2) * this.comboCount;
    S.coins += gain;
    S.quests.progress.taps++;
    clickSound(this.comboCount);
    this.tweens.add({ targets: item.obj, scale: { from: 0.85, to: 1 }, duration: 120 });
    ui.toast(this, item.obj.x, item.obj.y - 30, this.comboCount > 1 ? `+${gain} ×${this.comboCount}` : `+${gain}`, '#ffe066');
    this.refreshHud();
  }

  /** «Золотой брейнрот» пролетает по экрану — успей тапнуть (2 минуты дохода разом). */
  private spawnGolden() {
    if (this.golden?.active) return;
    const chain = Phaser.Math.RND.pick(ZONES[S.zone].chains) as number;
    const y = Phaser.Math.Between(400, 1000);
    const img = this.add.image(-70, y, textureKey(chain, 4)).setDisplaySize(96, 96)
      .setTint(0xffd700).setDepth(15).setInteractive();
    this.golden = img;
    this.tweens.add({ targets: img, x: W + 70, duration: GOLDEN.lifeMs, onComplete: () => img.destroy() });
    this.tweens.add({ targets: img, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 300 });
    img.on('pointerdown', () => {
      const reward = Math.max(GOLDEN.minReward, this.totalIncome() * Math.round(GOLDEN.rewardSec * 1000 / INCOME.periodMs));
      S.coins += reward;
      jingleFanfare();
      track('golden_tap');
      ui.toast(this, img.x, img.y - 40, `✨ ЗОЛОТОЙ! +${reward}🪙`);
      img.destroy();
      this.refreshHud(); persist();
    });
  }

  private maxRows() { return S.rowUnlocked ? GRID.rows : GRID.rows - 1; }

  /** Кастомные джинглы игрока: public/sounds/manifest.json со списком имён (см. audio.ts). */
  private loadCustomSounds() {
    fetch('sounds/manifest.json')
      .then(r => (r.ok ? r.json() : null))
      .then((list: string[] | null) => {
        if (!Array.isArray(list) || !list.length) return;
        list.forEach(n => this.load.audio(`snd_${n}`, `sounds/${n}.mp3`));
        this.load.start();
      })
      .catch(() => {});
  }

  /** Тематический фон локации: кастомный PNG (skins/bg_<id>.png), иначе — процедурный. */
  private drawZoneBg() {
    this.cameras.main.setBackgroundColor(ZONES[S.zone].bg);
    const id = ZONES[S.zone].id;
    if (this.textures.exists(`skinbg_${id}`)) {
      this.add.image(W / 2, H / 2, `skinbg_${id}`).setDisplaySize(W, H).setDepth(-10);
      return;
    }
    const g = this.add.graphics().setDepth(-10);
    if (id === 'lab') { // лаборатория: пузырьки в колбах и мягкое свечение
      g.fillGradientStyle(0x241645, 0x241645, 0x120c22, 0x120c22, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0x8f7bd8, 0.06);
      for (let i = 0; i < 14; i++) g.fillCircle((i * 173) % W, (i * 291) % H, 24 + (i * 37) % 60);
      g.fillStyle(0x5ad0c0, 0.05); g.fillEllipse(W / 2, H - 60, W * 1.4, 300);
    } else if (id === 'club') { // клуб: неоновые лучи и дискотечные блики
      g.fillGradientStyle(0x101c3a, 0x101c3a, 0x080d1c, 0x080d1c, 1); g.fillRect(0, 0, W, H);
      const beams: [number, number][] = [[0xe0409a, 120], [0x3ba7dc, 360], [0x58c0a8, 600]];
      beams.forEach(([col, bx]) => { g.fillStyle(col, 0.07); g.fillTriangle(bx, 0, bx - 170, H, bx + 170, H); });
      g.fillStyle(0xffffff, 0.08);
      for (let i = 0; i < 22; i++) g.fillCircle((i * 137 + 40) % W, (i * 211) % H, 3);
    } else if (id === 'space') { // космо-база: звёзды и планета
      g.fillGradientStyle(0x10163a, 0x10163a, 0x05070f, 0x05070f, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0xffffff, 0.5);
      for (let i = 0; i < 40; i++) g.fillCircle((i * 149 + 30) % W, (i * 233 + 20) % H, (i % 3) + 1);
      g.fillStyle(0x7a4ec0, 0.35); g.fillCircle(W - 90, 190, 70);
      g.lineStyle(6, 0x9f7ad8, 0.35); g.strokeEllipse(W - 90, 190, 220, 60);
    } else { // ночной дозор: луна, туман и свет фонаря
      g.fillGradientStyle(0x2c1c16, 0x2c1c16, 0x140c0a, 0x140c0a, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0xf2e2b0, 0.1); g.fillCircle(W - 110, 150, 95);
      g.fillStyle(0xf2e2b0, 0.75); g.fillCircle(W - 110, 150, 52);
      g.fillStyle(0xd8b46a, 0.06); g.fillTriangle(90, 60, 0, H * 0.75, 320, H * 0.75); // конус фонаря
      g.fillStyle(0xcabfae, 0.05); g.fillEllipse(W / 2, H - 140, W * 1.5, 220); // туман
      g.fillStyle(0xcabfae, 0.04); g.fillEllipse(W / 3, H - 300, W, 160);
    }
  }

  // ---------- поле ----------
  private drawBoard() {
    const { cols, rows, cell, x, y } = GRID;
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x - 8 + 3, y - 8 + 6, cols * cell + 16, rows * cell + 16, 22); // тень
    g.fillGradientStyle(0x322558, 0x322558, 0x241b42, 0x241b42, 1);
    g.fillRoundedRect(x - 8, y - 8, cols * cell + 16, rows * cell + 16, 22);
    g.lineStyle(3, 0x5a48a8, 0.9); g.strokeRoundedRect(x - 8, y - 8, cols * cell + 16, rows * cell + 16, 22);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        g.fillStyle((r + c) % 2 ? 0x3a2f66 : 0x352a5e, 1); // мягкая «шахматка»
        g.fillRoundedRect(x + c * cell + 3, y + r * cell + 3, cell - 6, cell - 6, 12);
      }
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
    const box = this.add.container(x, y);
    const img = this.add.image(0, 0, textureKey(chain, level)).setDisplaySize(114, 114);
    const badge = this.add.text(42, 42, `${level + 1}`, { fontFamily: FONT, fontSize: '20px', color: RARITY[level].color, fontStyle: '800' }).setOrigin(0.5).setStroke('#1a1230', 4);
    box.add([img, badge]).setSize(GRID.cell, GRID.cell).setInteractive({ draggable: true });
    const item: Item = { chain, level, obj: box };
    this.grid[r][c] = item;
    this.wireDrag(item);
    if (!silent) this.tweens.add({ targets: box, scale: { from: 0.3, to: 1 }, duration: 150 });
    this.checkDiscovery(chain, level, silent);
  }

  private checkDiscovery(chain: number, level: number, silent: boolean) {
    if (chain >= CHAINS.length) return; // событийные существа не входят в Мемпедию
    if (S.discovered[chain][level]) return;
    S.discovered[chain][level] = true;
    if (silent) return;
    const coins = 25 * (level + 1), gems = level >= 4 ? 5 : 0;
    S.coins += coins; S.gems += gems;
    jingleDiscovery();
    ui.toast(this, W / 2, GRID.y + 80, `📖 Открыто: ${CHAINS[chain].names[level]}! +${coins}🪙${gems ? ` +${gems}💎` : ''}`);
    this.refreshHud();
    if (chain === SECRET_CHAIN && level === 0) this.secret67Panel();
  }

  private wireDrag(item: Item) {
    const box = item.obj;
    let dragged = false;
    box.on('dragstart', () => { dragged = true; });
    box.on('pointerup', () => { if (!dragged) this.tapCreature(item); });
    box.on('drag', (_p: unknown, dx: number, dy: number) => { box.setPosition(dx, dy).setDepth(10); });
    box.on('dragend', () => {
      dragged = false;
      box.setDepth(0);
      const from = this.findItem(item)!;
      const to = this.cellAt(box.x, box.y);
      if (to) {
        const [r, c] = to, target = this.grid[r][c];
        if (!target) { this.grid[from[0]][from[1]] = null; this.grid[r][c] = item; }
        else if (target !== item && target.chain === item.chain && target.level === item.level && item.level < this.chainCfg(item.chain).names.length - 1) {
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
    jingleMerge(level, a.chain);
    S.quests.progress.merges++;
    S.score += level * 2;
    if (level >= 4) track('merge_high', { level });
    if (S.battle.side >= 0 && a.chain === S.battle.side) S.battle.points += level; // очки «Битвы недели»
    if (level === 5 && !S.customNames[a.chain]) this.renamePanel(a.chain); // легендарка заслуживает имени
    if (a.chain === EVENT_CHAIN_INDEX && this.ev) {
      S.event.points += level * 2;
      ui.toast(this, W / 2, GRID.y + 140, `${this.ev.emoji} +${level * 2} очков события`);
    }
    if (this.hint) { this.hint.destroy(); this.hint = undefined; ui.toast(this, W / 2, 180, 'Отлично! Теперь выполни заказ наверху 👆'); }
    if (level >= 3) this.maybeStarterOffer();
    this.refreshHud();
    this.persistBoard();
  }

  // ---------- генераторы ----------
  private drawGenerators() {
    const chains = ZONES[S.zone].chains;
    chains.forEach((ch, i) => {
      const x = W / 2 - (chains.length - 1) * 80 + i * 160, y = 296;
      this.add.circle(x, y, 34, 0x2a1f4d).setStrokeStyle(3, CHAINS[ch].color);
      const icon = this.add.image(x, y, textureKey(ch, 0)).setDisplaySize(58, 58).setInteractive();
      this.genEntries.push({ chain: ch, text: this.add.text(x, y + 44, '', { fontSize: '18px', color: '#7fdcff' }).setOrigin(0.5) });
      icon.on('pointerdown', () => this.tapGenerator(ch));
    });
    this.tickGenerators();
  }

  private tapGenerator(ch: number) {
    const left = GEN.cooldownMs - (Date.now() - S.genLast[ch]);
    if (left > 0) { failSound(); ui.toast(this, W / 2, 260, `Ещё ${Math.ceil(left / 1000)} с`, '#ff7070'); return; }
    const cell = this.findEmpty();
    if (!cell) { failSound(); ui.toast(this, W / 2, 260, 'Поле заполнено!', '#ff7070'); return; }
    S.genLast[ch] = Date.now();
    this.spawnItem(ch, 0, ...cell);
    S.quests.progress.spawns++;
    this.refreshHud();
  }

  private tickGenerators() {
    this.genEntries.forEach(({ chain, text }) => {
      const left = GEN.cooldownMs - (Date.now() - S.genLast[chain]);
      text.setText(left > 0 ? `${Math.ceil(left / 1000)}с` : 'ГОТОВ').setColor(left > 0 ? '#8f86b8' : '#7fdcff');
    });
  }

  // ---------- HUD ----------
  private drawHud() {
    this.add.text(W / 2, 36, 'BRAINROT LAB: MERGE', { fontFamily: FONT, fontSize: '40px', color: '#ffe066', fontStyle: '900' })
      .setOrigin(0.5).setStroke('#120c22', 8).setShadow(0, 3, 'rgba(0,0,0,0.5)', 4);
    if (this.ev)
      ui.button(this, 165, 134, 290, 44, `${this.ev.emoji} ${this.ev.title.split(' ')[0]} · ${daysLeft(this.ev)}д`, 0xa8542e, () => this.eventPanel(), 18);
    ui.button(this, 445, 134, 250, 44, `🗺️ ${ZONES[S.zone].title}`, 0x2e6d9d, () => this.zonesPanel(), 18);
    ui.button(this, 635, 134, 110, 44, '⚔️', 0x9d2e4d, () => this.battlePanel(), 22);
    this.coinsText = ui.pill(this, 24, 88, 220, '🪙', 0xffe066);
    this.gemsText = ui.pill(this, 264, 88, 170, '💎', 0xc9a6ff);
    this.incomeText = ui.pill(this, 454, 88, 242, '💰', 0x7fdc8f);

    ui.button(this, 105, 1132, 170, 56, '💎 Магазин', 0x8f5ad0, () => openShop(this, this.api), 18);
    ui.button(this, 285, 1132, 170, 56, '📋 Задания', 0x2e6d9d, () => this.questsPanel(), 18);
    this.questBadge = this.add.circle(362, 1108, 9, 0xff5050).setDepth(1);
    ui.button(this, 465, 1132, 170, 56, '📖 Мемпедия', 0x5a48a8, () => this.memePanel(), 18);
    ui.button(this, 645, 1132, 170, 56, '🏆 Арена', 0x9d5a2e, () => this.arenaPanel(), 18);

    const spawnBtn = ui.button(this, 200, 1210, 360, 64, '', 0x5a48a8, () => this.trySpawn());
    this.spawnLabel = spawnBtn.list[1] as Phaser.GameObjects.Text; // [graphics, text, hit]
    // Rewarded-точка: игрок сам меняет ролик на буст дохода (PLAN.md §4).
    ui.button(this, 555, 1210, 290, 64, `🎬 Доход ×${INCOME.boostAdMult} (2 мин)`, 0x2e7d5b, () =>
      sdk.showRewarded(() => {
        // если активен более сильный буст — реклама продлевает его, а не понижает
        S.boostMult = Date.now() < S.boostUntil ? Math.max(S.boostMult, INCOME.boostAdMult) : INCOME.boostAdMult;
        S.boostUntil = Date.now() + INCOME.boostAdMs;
        this.refreshHud(); persist();
        ui.toast(this, 555, 1160, `Доход ×${S.boostMult}!`, '#7fdc8f');
      }), 21);
    this.refreshHud();
  }

  private spawnCost(): number { return Math.floor(SPAWN.baseCost * Math.pow(SPAWN.growth, S.spawnBought)); }

  private refreshHud() {
    this.coinsText.setText(`${S.coins}`);
    this.gemsText.setText(`${S.gems}`);
    const boost = Date.now() < S.boostUntil ? ` ×${S.boostMult}` : '';
    this.incomeText.setText(`+${this.totalIncome()}/5с${boost}`);
    this.spawnLabel?.setText(`Существо (${this.spawnCost()}🪙)`);
    const claimable = QUESTS.some((q, i) => !S.quests.claimed[i] && S.quests.progress[q.id] >= q.target);
    this.questBadge?.setVisible(claimable);
  }

  private trySpawn() {
    const cost = this.spawnCost();
    if (S.coins < cost) { failSound(); ui.toast(this, W / 2, 1160, 'Не хватает монет!', '#ff7070'); return; }
    const cell = this.findEmpty();
    if (!cell) { failSound(); ui.toast(this, W / 2, 1160, 'Поле заполнено!', '#ff7070'); return; }
    S.coins -= cost;
    S.spawnBought++;
    // Во время события 25% новых существ — событийные; остальные — из цепочек локации.
    const chain = this.evCfg && Math.random() < 0.25 ? EVENT_CHAIN_INDEX : (Phaser.Math.RND.pick(ZONES[S.zone].chains) as number);
    this.spawnItem(chain, 0, ...cell);
    S.quests.progress.spawns++;
    this.refreshHud();
  }

  private spawnSecret(): boolean {
    const cell = this.findEmpty();
    if (!cell) return false;
    this.spawnItem(SECRET_CHAIN, 0, ...cell);
    this.persistBoard();
    return true;
  }

  private spawnReward(level: number): boolean {
    const cell = this.findEmpty();
    if (!cell) return false;
    this.spawnItem(Phaser.Math.RND.pick(ZONES[S.zone].chains) as number, Math.min(level, 5), ...cell);
    this.persistBoard();
    return true;
  }

  // ---------- заказы ----------
  private makeOrders() { for (let i = 0; i < 3; i++) this.newOrder(i); }

  private newOrder(slot: number) {
    // Сложность растёт с прогрессом: заказы не выше уже открытых уровней локации (+1 на вырост).
    const pool = ZONES[S.zone].chains;
    let maxLv = 1;
    pool.forEach(ch => S.discovered[ch].forEach((d, lv) => { if (d) maxLv = Math.max(maxLv, lv); }));
    const level = Phaser.Math.Between(1, Math.min(4, maxLv + 1));
    const chain = Phaser.Math.RND.pick(pool) as number;
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
        jingleOrder();
        track('order_done');
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
      tada(); track('daily_claim', { day });
      this.refreshHud(); persist(true); p.destroy(); onDone();
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

  // ---------- локации ----------
  private zonesPanel() {
    const p = ui.panel(this, '🗺️ Локации');
    ZONES.forEach((z, i) => {
      const y = H / 2 - 250 + i * 170;
      const label = `${z.title}\n${z.chains.length} цепочки существ`;
      if (S.zoneUnlocked[i]) {
        this.addTo(p, ui.button(this, W / 2, y, 520, 120, i === S.zone ? `📍 ${label}` : label, i === S.zone ? 0x2e7d5b : 0x5a48a8,
          () => { if (i !== S.zone) this.switchZone(i); }));
      } else {
        this.addTo(p, ui.button(this, W / 2, y, 520, 120, `🔒 ${label}\nОткрыть: ${z.unlockCoins}🪙 или ${z.unlockGems}💎`, 0x3a3a55, () => {
          if (S.coins >= z.unlockCoins) S.coins -= z.unlockCoins;
          else if (S.gems >= z.unlockGems) S.gems -= z.unlockGems;
          else { failSound(); ui.toast(this, W / 2, y, 'Не хватает средств', '#ff7070'); return; }
          S.zoneUnlocked[i] = true;
          // стартовые существа новой локации — чтобы было что сливать сразу
          S.itemsZ[i] = [[2, 2, z.chains[0], 0], [2, 3, z.chains[0], 0], [3, 2, z.chains[1] ?? z.chains[0], 0], [3, 3, z.chains[1] ?? z.chains[0], 0]];
          jingleFanfare();
          track('zone_unlock', { zone: z.id });
          this.switchZone(i);
        }, 22));
      }
    });
  }

  private switchZone(i: number) {
    this.persistBoard(true);
    S.zone = i;
    persist(true);
    this.scene.restart();
  }

  // ---------- сезонное событие ----------
  private eventPanel() {
    const ev = this.ev!;
    const p = ui.panel(this, `${ev.emoji} ${ev.title}`);
    this.addTo(p, this.add.text(W / 2, H / 2 - 330,
      `Осталось ${daysLeft(ev)} дн. · Очки: ${S.event.points} ${ev.emoji}\n\nСобытийные существа появляются при создании\nновых (шанс 25%). Сливай их и копи очки!`,
      { fontSize: '24px', color: '#fff', align: 'center' }).setOrigin(0.5));
    ev.milestones.forEach((m, i) => {
      const y = H / 2 - 180 + i * 110;
      const rw = [m.coins && `${m.coins}🪙`, m.gems && `${m.gems}💎`, m.chest && '📦 сундук'].filter(Boolean).join(' + ');
      this.addTo(p, this.add.text(W / 2 - 280, y, `${Math.min(S.event.points, m.points)}/${m.points} ${ev.emoji}\n${rw}`, { fontSize: '25px', color: '#fff' }));
      if (S.event.claimed[i])
        this.addTo(p, this.add.text(W / 2 + 210, y + 24, '✅', { fontSize: '38px' }).setOrigin(0.5));
      else if (S.event.points >= m.points)
        this.addTo(p, ui.button(this, W / 2 + 210, y + 28, 170, 58, 'Забрать', 0x2e7d5b, () => {
          S.event.claimed[i] = true; S.coins += m.coins ?? 0; S.gems += m.gems ?? 0;
          if (m.chest) this.spawnReward(4);
          jingleFanfare(); track('event_milestone', { points: m.points });
          this.refreshHud(); persist(true); p.destroy(); this.eventPanel();
        }));
    });
    this.addTo(p, this.add.text(W / 2, H / 2 + 300, 'Когда событие закончится, его существа\nпревратятся в монеты — ничего не пропадёт!', { fontSize: '20px', color: '#8f86b8', align: 'center' }).setOrigin(0.5));
  }

  // ---------- Мемпедия ----------
  private memePanel() {
    const total = CHAINS.reduce((n, ch) => n + ch.names.length, 0);
    const found = S.discovered.flat().filter(Boolean).length;
    const p = ui.panel(this, `📖 Мемпедия ${found}/${total}`);
    // Сетка портретов: ряд — цепочка, колонка — уровень. Тап по портрету — имя.
    const x0 = W / 2 - 180, y0 = H / 2 - 352;
    CHAINS.forEach((cfg, ci) => {
      const y = y0 + ci * 60;
      this.addTo(p, this.add.image(x0 - 100, y, textureKey(ci, 0)).setDisplaySize(42, 42).setAlpha(0.85));
      cfg.names.forEach((name, lv) => {
        const x = x0 + lv * 72;
        if (S.discovered[ci][lv]) {
          const img = this.add.image(x, y, textureKey(ci, lv)).setDisplaySize(54, 54).setInteractive();
          const shown = lv === 5 && S.customNames[ci] ? `«${S.customNames[ci]}» (${name})` : name;
          img.on('pointerdown', () => ui.toast(this, W / 2, y, `${shown} · ${RARITY[lv].name}`, RARITY[lv].color));
          this.addTo(p, img);
        } else {
          const box = this.add.rectangle(x, y, 52, 52, 0x161028, 0.9).setStrokeStyle(2, 0x4a3a80).setInteractive();
          box.on('pointerdown', () => ui.toast(this, W / 2, y, ci === SECRET_CHAIN ? 'Секрет… ищи в сундуках 👀' : 'Ещё не открыт', '#8f86b8'));
          this.addTo(p, box);
          this.addTo(p, this.add.text(x, y, '?', { fontFamily: FONT, fontSize: '24px', color: '#5a5474', fontStyle: '700' }).setOrigin(0.5));
        }
      });
    });
  }

  // ---------- Арена: команда 5 бойцов, кубки, казарма, лидерборд ----------
  private arenaPanel() {
    while (S.arenaClaimed.length < ARENA_MILESTONES.length) S.arenaClaimed.push(false);
    const p = ui.panel(this, `🏆 Арена · ${S.cups} кубков`);
    // слоты команды: боец снят с поля и НЕ приносит доход
    this.addTo(p, this.add.text(W / 2, H / 2 - 372, 'Команда (бойцы не приносят доход на поле):', { fontFamily: FONT, fontSize: '20px', color: '#c9beee' }).setOrigin(0.5));
    for (let i = 0; i < 5; i++) {
      const x = W / 2 - 240 + i * 120, y = H / 2 - 290;
      const box = this.add.rectangle(x, y, 106, 106, 0x161028, 0.9).setStrokeStyle(2, 0x8f7bd8).setInteractive();
      this.addTo(p, box);
      const member = S.team[i];
      if (member) {
        const st = unitStats(member[0], member[1]);
        this.addTo(p, this.add.image(x, y, textureKey(member[0], member[1])).setDisplaySize(96, 96));
        this.addTo(p, this.add.text(x, y + 66, `⚔${st.dmg} ❤${st.hp}`, { fontFamily: FONT, fontSize: '15px', color: '#c9beee' }).setOrigin(0.5));
        box.on('pointerdown', () => this.removeFromTeam(i, p));
      } else {
        this.addTo(p, this.add.text(x, y, '+', { fontFamily: FONT, fontSize: '44px', color: '#5a5474' }).setOrigin(0.5));
        box.on('pointerdown', () => { p.destroy(); this.teamPicker(); });
      }
    }
    this.addTo(p, this.add.text(W / 2, H / 2 - 200, `Сила команды: ${Math.round(teamPower(S.team))}`, { fontFamily: FONT, fontSize: '23px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 - 130, 420, 78, '⚔️ В БОЙ!', 0x9d2e4d, () => {
      if (!S.team.length) { failSound(); ui.toast(this, W / 2, H / 2 - 130, 'Сначала добавь бойцов!', '#ff7070'); return; }
      p.destroy();
      this.startArenaBattle(1);
    }, 30));
    // казарма — бесконечный синк монет (+5% к статам за уровень)
    (['atk', 'hp'] as const).forEach((k, i) => {
      const cost = upgradeCost(S.upgrades[k]);
      this.addTo(p, ui.button(this, W / 2 - 150 + i * 300, H / 2 - 40, 280, 64,
        `${k === 'atk' ? '⚔ Атака' : '❤ Броня'} ур.${S.upgrades[k]}\n${cost}🪙`, 0x2e6d9d, () => {
          if (S.coins < cost) { failSound(); ui.toast(this, W / 2, H / 2 - 40, 'Не хватает монет', '#ff7070'); return; }
          S.coins -= cost; S.upgrades[k]++;
          coinSound(); track('barracks_upgrade', { stat: k });
          this.refreshHud(); persist(); p.destroy(); this.arenaPanel();
        }, 19));
    });
    // милстоуны кубков
    ARENA_MILESTONES.forEach((m, i) => {
      const y = H / 2 + 40 + i * 52;
      const rw = m.coins ? `${m.coins}🪙` : `${m.gems}💎`;
      this.addTo(p, this.add.text(W / 2 - 280, y, `${m.cups}🏆 — ${rw}`, { fontFamily: FONT, fontSize: '21px', color: S.cups >= m.cups ? '#fff' : '#5a5474' }).setOrigin(0, 0.5));
      if (S.arenaClaimed[i]) this.addTo(p, this.add.text(W / 2 + 230, y, '✅', { fontSize: '26px' }).setOrigin(0.5));
      else if (S.cups >= m.cups)
        this.addTo(p, ui.button(this, W / 2 + 220, y, 150, 44, 'Забрать', 0x2e7d5b, () => {
          S.arenaClaimed[i] = true; S.coins += m.coins ?? 0; S.gems += m.gems ?? 0;
          tada(); this.refreshHud(); persist(true); p.destroy(); this.arenaPanel();
        }, 17));
    });
    this.addTo(p, ui.button(this, W / 2, H / 2 + 330, 340, 52, '🏅 Топ игроков', 0x5a48a8, () => { p.destroy(); this.leaderboardPanel(); }, 19));
  }

  /** Пикер бойца: существо переезжает с поля в команду (клетка освобождается). */
  private teamPicker() {
    const p = ui.panel(this, '➕ Выбери бойца с поля', () => this.arenaPanel());
    const items: { item: Item; r: number; c: number }[] = [];
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) items.push({ item: it, r, c });
    }
    if (!items.length)
      this.addTo(p, this.add.text(W / 2, H / 2, 'На поле пусто!\nКупи существ и возвращайся.', { fontFamily: FONT, fontSize: '26px', color: '#fff', align: 'center' }).setOrigin(0.5));
    items.slice(0, 24).forEach((e, i) => {
      const x = W / 2 - 225 + (i % 4) * 150, y = H / 2 - 300 + Math.floor(i / 4) * 120;
      const st = unitStats(e.item.chain, e.item.level);
      const img = this.add.image(x, y, textureKey(e.item.chain, e.item.level)).setDisplaySize(92, 92).setInteractive();
      img.on('pointerdown', () => {
        if (S.team.length >= 5) return;
        S.team.push([e.item.chain, e.item.level]);
        e.item.obj.destroy();
        this.grid[e.r][e.c] = null;
        jingleFanfare(); track('team_add');
        this.persistBoard(true); this.refreshHud();
        p.destroy(); this.arenaPanel();
      });
      this.addTo(p, img);
      this.addTo(p, this.add.text(x, y + 56, `⚔${st.dmg} ❤${st.hp}`, { fontFamily: FONT, fontSize: '14px', color: '#c9beee' }).setOrigin(0.5));
    });
  }

  private removeFromTeam(i: number, panel: Phaser.GameObjects.Container) {
    const cell = this.findEmpty();
    if (!cell) { failSound(); ui.toast(this, W / 2, H / 2 - 290, 'На поле нет места!', '#ff7070'); return; }
    const [ch, lv] = S.team[i];
    S.team.splice(i, 1);
    this.spawnItem(ch, lv, ...cell);
    this.persistBoard(true); this.refreshHud();
    panel.destroy(); this.arenaPanel();
  }

  private startArenaBattle(playerFactor: number, rematch?: EnemyTeam) {
    const en = rematch ?? makeEnemy();
    track('arena_battle');
    sdk.gameplayStart();
    startBattle(this, S.team, playerFactor, en.team, en.factor, `${en.name} (${en.cups}🏆)`, win => this.battleResult(win, en));
  }

  private battleResult(win: boolean, en: EnemyTeam) {
    const enemyPower = teamPower(en.team, false) * en.factor;
    const d = cupsDelta(win, enemyPower);
    S.cups = Math.max(0, S.cups + d);
    let coins = 0;
    if (win) { S.wins++; coins = 150 + Math.floor(enemyPower / 5); S.coins += coins; }
    sdk.submitScore('cups', S.cups);
    track(win ? 'arena_win' : 'arena_lose', { cups: S.cups });
    persist(true); this.refreshHud();
    const p = ui.panel(this, win ? '🎉 ПОБЕДА!' : '💀 Поражение…');
    this.addTo(p, this.add.text(W / 2, H / 2 - 220,
      win ? `${d >= 0 ? '+' : ''}${d}🏆  ·  +${coins}🪙${S.wins % 3 === 0 ? '\n\n🎁 Каждая 3-я победа — сундук!' : ''}`
        : `${d}🏆\n\nПодкачай команду в казарме\nили слей существ повыше уровнем.`,
      { fontFamily: FONT, fontSize: '30px', color: '#fff', align: 'center', fontStyle: '700' }).setOrigin(0.5));
    if (win && S.wins % 3 === 0) rollChest(this.api, this, W / 2, H / 2 - 100);
    this.addTo(p, ui.button(this, W / 2, H / 2 + 60, 380, 72, '⚔️ Ещё бой!', 0x9d2e4d, () => { p.destroy(); this.startArenaBattle(1); }, 24));
    if (!win)
      this.addTo(p, ui.button(this, W / 2, H / 2 + 160, 460, 66, '🎬 Реванш с бустом ×1.2', 0x2e7d5b, () =>
        sdk.showRewarded(() => { p.destroy(); this.startArenaBattle(1.2, en); }), 21));
    if (S.ordersDone > 0 && interstitialAllowed()) sdk.maybeInterstitial(); // естественный стык
  }

  private async leaderboardPanel() {
    const p = ui.panel(this, '🏅 Топ по кубкам', () => this.arenaPanel());
    let rows = await sdk.getLeaderboardTop('cups');
    if (!rows.length) { // dev-мок: правдоподобный топ вокруг игрока
      rows = ['Скуф67', 'НагибаторТоля', 'КапибараЛюб', 'xX_БравлеР_Xx', 'сигма-с-урока', 'ПростоДаня', 'Тимофей TV', 'Абобус228', 'ЛещДесантный']
        .map((name, i) => ({ rank: i + 1, name, score: Math.max(10, S.cups + (5 - i) * 47) }));
      rows.push({ rank: rows.length + 1, name: 'Ты', score: S.cups });
      rows.sort((a, b) => b.score - a.score).forEach((r, i) => (r.rank = i + 1));
    }
    rows.slice(0, 10).forEach((r, i) => {
      const y = H / 2 - 330 + i * 66;
      const me = r.name === 'Ты';
      const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : ` ${r.rank}.`;
      this.addTo(p, this.add.text(W / 2 - 280, y, `${medal} ${r.name}`, { fontFamily: FONT, fontSize: '24px', color: me ? '#ffe066' : '#fff', fontStyle: me ? '800' : '400' }).setOrigin(0, 0.5));
      this.addTo(p, this.add.text(W / 2 + 280, y, `${r.score}🏆`, { fontFamily: FONT, fontSize: '24px', color: '#c9beee' }).setOrigin(1, 0.5));
    });
  }

  // ---------- «Битва недели»: команды персонажей, очки за слияния, повод для споров ----------
  private battleTeams(): [number, number] {
    const week = isoWeek();
    const h = [...week].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const a = h % CHAINS.length;
    let b = (a + 1 + ((h >> 3) % (CHAINS.length - 1))) % CHAINS.length;
    if (b === a) b = (a + 1) % CHAINS.length;
    return [a, b];
  }

  private syncBattleWeek() {
    const week = isoWeek();
    if (S.battle.week === week) return;
    if (S.battle.side >= 0 && S.battle.points > 0) { // награда за прошлую неделю
      const reward = Math.min(30, 5 + Math.floor(S.battle.points / 10));
      S.gems += reward;
      ui.toast(this, W / 2, H / 2, `⚔️ Битва недели окончена: +${reward}💎 за ${S.battle.points} очков!`);
    }
    S.battle = { week, side: -1, points: 0 };
    persist();
  }

  private battlePanel() {
    const [ta, tb] = this.battleTeams();
    const p = ui.panel(this, '⚔️ Битва недели');
    this.addTo(p, this.add.text(W / 2, H / 2 - 310,
      `${CHAINS[ta].names[5]}  VS  ${CHAINS[tb].names[5]}\n\nВыбери сторону — очки идут за слияния\nсуществ твоей команды. В конце недели —\nкристаллы по очкам. Сторону не сменить!`,
      { fontFamily: FONT, fontSize: '23px', color: '#fff', align: 'center' }).setOrigin(0.5));
    [ta, tb].forEach((ch, i) => {
      const x = W / 2 - 150 + i * 300;
      this.addTo(p, this.add.image(x, H / 2 - 140, textureKey(ch, 3)).setDisplaySize(140, 140));
      if (S.battle.side < 0)
        this.addTo(p, ui.button(this, x, H / 2 - 30, 250, 62, `За ${CHAINS[ch].names[0]}!`, i ? 0x9d2e4d : 0x2e6d9d, () => {
          S.battle.side = ch;
          jingleFanfare(); track('battle_join', { chain: CHAINS[ch].id });
          persist(true); p.destroy(); this.battlePanel();
        }, 20));
      else if (S.battle.side === ch)
        this.addTo(p, this.add.text(x, H / 2 - 30, '⭐ Твоя команда', { fontFamily: FONT, fontSize: '22px', color: '#ffe066', fontStyle: '700' }).setOrigin(0.5));
    });
    if (S.battle.side >= 0) {
      this.addTo(p, this.add.text(W / 2, H / 2 + 80, `Твои очки: ${S.battle.points} ⚔️`, { fontFamily: FONT, fontSize: '30px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
      this.addTo(p, ui.button(this, W / 2, H / 2 + 170, 480, 66, '📣 Позвать друзей в мою команду', 0x2e7d5b, () => {
        navigator.clipboard?.writeText(`Я топлю за команду «${CHAINS[S.battle.side].names[5]}» в Битве недели Brainrot Lab: Merge (${S.battle.points} очков) ⚔️ А ты за кого? Игра — на Яндекс Играх!`).catch(() => {});
        track('battle_share');
        ui.toast(this, W / 2, H / 2 + 120, 'Скопировано — кидай в чат!');
      }, 22));
    }
  }

  // ---------- имя для легендарки: пользовательский контент = скриншоты ----------
  private renamePanel(chain: number) {
    const p = ui.panel(this, '⭐ ЛЕГЕНДАРКА!');
    this.addTo(p, this.add.image(W / 2, H / 2 - 230, textureKey(chain, 5)).setDisplaySize(190, 190));
    this.addTo(p, this.add.text(W / 2, H / 2 - 80,
      `Ты вырастил «${CHAINS[chain].names[5]}»!\nТакое существо заслуживает СОБСТВЕННОЕ имя.\nОно останется в твоей Мемпедии навсегда.`,
      { fontFamily: FONT, fontSize: '24px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 60, 420, 70, '✏️ Дать имя', 0x8f5ad0, () => {
      const nm = window.prompt('Имя для твоей легендарки:', S.customNames[chain] ?? '');
      if (nm?.trim()) {
        S.customNames[chain] = nm.trim().slice(0, 24);
        track('legend_named');
        persist(true);
        ui.toast(this, W / 2, H / 2, `Теперь это «${S.customNames[chain]}»!`);
      }
    }));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 160, 480, 64, '📣 Похвастаться легендаркой', 0x2e7d5b, () => {
      const nm = S.customNames[chain] ?? CHAINS[chain].names[5];
      navigator.clipboard?.writeText(`Моя легендарка «${nm}» уже качает в Brainrot Lab: Merge 🏆 Покажи свою! Игра — на Яндекс Играх.`).catch(() => {});
      track('legend_share');
      ui.toast(this, W / 2, H / 2 + 110, 'Скопировано — кидай в чат!');
    }, 22));
  }

  // ---------- секретный «67»: главный вирусный крючок ----------
  private secret67Panel() {
    track('secret_67_found');
    const p = ui.panel(this, '⁉️ 6 7 !!!');
    this.addTo(p, this.add.image(W / 2, H / 2 - 220, textureKey(SECRET_CHAIN, 0)).setDisplaySize(180, 180));
    this.addTo(p, this.add.text(W / 2, H / 2 - 60,
      'Ты выбил СЕКРЕТНОГО 67!\nШанс — всего 6,7%.\n\nТаких игроков — единицы.\nСольёшь до ЛЕГЕНДО 67 — станешь легендой сам.',
      { fontFamily: FONT, fontSize: '26px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 140, 480, 72, '📣 Скопировать хвастовство', 0x2e7d5b, () => {
      navigator.clipboard?.writeText('Я выбил секретного 67 в Brainrot Lab: Merge — шанс всего 6,7% 🔵6️⃣7️⃣ Слабо повторить? Ищи игру на Яндекс Играх!').catch(() => {});
      track('secret_67_share');
      ui.toast(this, W / 2, H / 2 + 90, 'Скопировано — кидай в чат!');
    }));
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
    // Офлайн-доход = доход поля на момент выхода × время (кап 8 часов).
    const seconds = Math.min((Date.now() - S.lastSeen) / 1000, INCOME.offlineCapHours * 3600);
    const earned = Math.floor(S.incomeRate * (seconds * 1000 / INCOME.periodMs));
    if (earned < OFFLINE_MIN_COINS) return;
    const p = ui.panel(this, '💤 Пока вас не было…');
    this.addTo(p, this.add.text(W / 2, H / 2 - 200, `Твои брейнроты наработали:\n🪙 ${earned}`, { fontSize: '38px', color: '#fff', align: 'center' }).setOrigin(0.5));
    const claim = (mult: number) => { S.coins += earned * mult; coinSound(); this.refreshHud(); persist(); p.destroy(); };
    this.addTo(p, ui.button(this, W / 2, H / 2, 420, 72, `Забрать ${earned}🪙`, 0x5a48a8, () => claim(1)));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 100, 480, 72, `🎬 Забрать ×2 (${earned * 2}🪙)`, 0x2e7d5b,
      () => sdk.showRewarded(() => claim(2))));
  }

  // ---------- FTUE: первое слияние — в первые 10 секунд (PLAN.md §15) ----------
  private startFtue() {
    this.spawnItem(0, 0, 2, 2);
    this.spawnItem(0, 0, 2, 3);
    this.hint = this.add.text(W / 2, GRID.y + 120, '👆 Перетащи одно существо на другое!', { fontSize: '26px', color: '#ffe066', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: this.hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 500 });
  }

  // ---------- сейв ----------
  private persistBoard(force = false) {
    const items: number[][] = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) items.push([r, c, it.chain, it.level]);
    }
    S.itemsZ[S.zone] = items;
    S.incomeRate = this.totalIncome(); // для офлайн-начисления
    persist(force);
  }
}
