import Phaser from 'phaser';
import { W, H, GRID, INCOME, spawnCostOf, GOLDEN, incomeOf, OFFLINE_MIN_COINS, GEN, PRICES, CHAINS, RARITY, sellPrice, leagueOf, nextLeague, leagueIndex, LEAGUES, SEASON, seasonId, FRAMES, frameByKey, frameRank, PASS, PASS_TRACK, PassReward, INTERSTITIAL, Chain, ZONES, SECRET_CHAIN, FONT, VERSION, EGGS, EggType, INCUBATOR, MUTATION_MULT, mutationChain, promoByCode } from './config';
import { activeEvent, daysLeft, EventDef } from './events';
import { generateSprites, textureKey, EVENT_CHAIN_INDEX } from './sprites';
import { queueSkinLoads } from './assets';
import { unitStats, teamPower, upgradeCost, ARENA_MILESTONES, makeEnemy, cupsDelta, REMATCH_BUFF, EnemyTeam, BOSSES, BossDef, bossStats } from './arena';
import { startBattle } from './battle';
import { track } from './analytics';
import { S, QUESTS, STREAK_REWARDS, restore, persist, streakStatus, interstitialAllowed, today, isoWeek, resetProgress } from './state';
import * as sdk from './sdk';
import * as ui from './ui';
import { jingleMerge, jingleOrder, jingleDiscovery, jingleFanfare, coinSound, clickSound, failSound, tada, registerSoundScene, setMuted, isMuted } from './audio';
import { openShop, rollChest, ShopApi } from './shop';
import { buzz, BUZZ } from './haptics';
import { ACHIEVEMENTS, achValue, achDone, achClaimable, achTaken, achCountDone, anyAchClaimable, achId, Achievement } from './achievements';
import { t, creatureName, rarityName, nicks, LANGS, Lang, getLang, setLang } from './i18n';

interface Item { chain: number; level: number; obj: Phaser.GameObjects.Container }

// Порог долгого нажатия: короче — кликер, дольше — карточка существа.
const HOLD_MS = 350;

export class GameScene extends Phaser.Scene {
  private static popupsShown = false; // стрик/офлайн показываем раз за сессию, не при смене локации
  private static promptedThisSession = false; // оценка/ярлык/вход — не больше одного за сессию
  private static mutShown = false; // про мутацию дня рассказываем раз за сессию
  private grid: (Item | null)[][] = [];
  private spawnBar?: Phaser.GameObjects.Graphics;
  private coinsText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private spawnLabel?: Phaser.GameObjects.Text;
  private eggLabel?: Phaser.GameObjects.Text;
  private mutChain = -1; // цепочка дня: её доход ×MUTATION_MULT
  private passToastAt = 0;
  private eggBadge?: Phaser.GameObjects.Arc;
  private comboCount = 0;
  private comboLast = 0;
  private golden?: Phaser.GameObjects.Image;
  private questBadge!: Phaser.GameObjects.Arc;
  private arenaBadge!: Phaser.GameObjects.Arc;
  private pediaBadge?: Phaser.GameObjects.Arc;
  private arenaBtn!: Phaser.GameObjects.Container;
  private lockedOverlay?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  private tipBanner?: Phaser.GameObjects.Container;
  private mergeHints?: Phaser.GameObjects.Graphics;
  private ev: EventDef | null = null;
  private evCfg?: Chain;
  private api: ShopApi = {
    spawnReward: (lv) => this.spawnReward(lv),
    spawnSecret: () => this.spawnSecret(),
    refreshHud: () => this.refreshHud(),
  };

  /** Конфиг цепочки с учётом событийной (индекс за пределами CHAINS). */
  private chainCfg(i: number): Chain { return i === EVENT_CHAIN_INDEX && this.evCfg ? this.evCfg : CHAINS[i]; }

  /** Локализованное имя существа. */
  private cname(chain: number, level: number): string { return creatureName(this.chainCfg(chain), level); }

  constructor() { super('game'); }

  preload() {
    // Кастомные PNG-скины игрока грузятся ПОД штатными ключами (см. assets.ts).
    queueSkinLoads(this.load, activeEvent()?.id);
  }

  async create() {
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    const hadSave = await restore();
    this.drawZoneBg();
    setMuted(!S.soundOn); // выбор игрока из сейва
    registerSoundScene(this);
    this.loadCustomSounds();
    for (const id of await sdk.restorePurchases()) {
      if (id === 'no_ads') S.noAds = true;
      if (id === 'starter') S.starterBought = true;
      if (id === 'offline_vip') S.offlineVip = true;
    }

    this.ev = activeEvent();
    if (this.ev) {
      this.evCfg = { id: this.ev.id, color: this.ev.color, names: this.ev.names };
      if (S.event.id !== this.ev.id) S.event = { id: this.ev.id, points: 0, claimed: this.ev.milestones.map(() => false) };
    }
    // Мутация дня считается от даты — до отрисовки поля, чтобы существа сразу
    // получили метку ×2.
    this.mutChain = mutationChain();
    generateSprites(this, CHAINS, 0);
    if (this.evCfg) generateSprites(this, [this.evCfg], EVENT_CHAIN_INDEX);

    this.drawBoard();
    this.drawHud();

    // Туториал также после сброса прогресса: иначе игрок остаётся с пустым полем.
    if ((!hadSave || !S.itemsZ[0]?.length) && S.zone === 0) this.startFtue();
    else (S.itemsZ[S.zone] ?? []).forEach(([r, c, ch, lv]) => {
      // Существа закончившегося события конвертируются в монеты — ничего не пропадает.
      if (ch >= CHAINS.length && !this.evCfg) { S.coins += 100 * (lv + 1); return; }
      this.spawnItem(ch, lv, r, c, true);
    });
    this.refreshHud(); // доход считаем сразу, а не через 5 с (первый тик) — иначе видно «+0»

    if (!GameScene.popupsShown) {
      GameScene.popupsShown = true;
      const st = streakStatus();
      if (st) this.streakPanel(st, () => this.offlinePopup());
      else this.offlinePopup();
      // Спокойный вход: если игрок уже закрыл входные окна — предлагаем ярлык.
      this.time.delayedCall(4000, () => void this.platformPrompt('session'));
    }
    this.checkSeason();
    this.syncPass();
    // Мутация дня: сообщаем один раз за сессию и только если цепочка доступна
    // игроку — иначе это шум про запертую локацию.
    if (!GameScene.mutShown && ZONES.some((z, i) => S.zoneUnlocked[i] && z.chains.includes(this.mutChain))) {
      GameScene.mutShown = true;
      this.tip('mut.banner', undefined, { name: this.cname(this.mutChain, 3), mult: MUTATION_MULT });
    }
    sdk.gameplayStart();

    this.input.dragDistanceThreshold = 12; // короткий тап = клик по существу, не драг
    this.syncBattleWeek();
    this.time.addEvent({ delay: INCOME.periodMs, loop: true, callback: () => this.incomeTick() });
    this.time.addEvent({ delay: GOLDEN.intervalMs, loop: true, callback: () => this.spawnGolden() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => { this.tickSpawnButton(); this.tickEgg(); } });
    this.time.addEvent({ delay: 10_000, loop: true, callback: () => { this.persistBoard(); sdk.submitScore('weekly_merges', S.score); } });
  }

  // ---------- пассивный доход и кликер ----------
  /** Доход одного существа с учётом мутации дня. */
  private itemIncome(chain: number, level: number): number {
    return incomeOf(chain, level) * (chain === this.mutChain ? MUTATION_MULT : 1);
  }

  /**
   * Доход поля за тик. `mutated = false` даёт чистую ставку — её пишем в S.incomeRate
   * для офлайна, чтобы мутацию нельзя было «поймать» сном вместо игры.
   */
  private totalIncome(mutated = true): number {
    let sum = 0;
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c];
      if (it) sum += mutated ? this.itemIncome(it.chain, it.level) : incomeOf(it.chain, it.level);
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
    const gain = Math.ceil(this.itemIncome(item.chain, item.level) / 2) * this.comboCount;
    S.coins += gain;
    S.quests.progress.taps++; S.stats.taps++;
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
      jingleFanfare(); buzz(BUZZ.golden);
      S.stats.golden++;
      this.addPassPoints(PASS.points.golden);
      track('golden_tap');
      ui.toast(this, img.x, img.y - 40, t('golden.tap', { n: reward }));
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
    const p = ui.panel(this, t('row.title'));
    p.add(this.add.text(W / 2, H / 2 - 300, t('row.desc'), { fontSize: '28px', color: '#fff', align: 'center' }).setOrigin(0.5));
    const buy = (ok: boolean, spend: () => void) => {
      if (!ok) { failSound(); ui.toast(this, W / 2, H / 2, t('common.notEnoughFunds'), '#ff7070'); return; }
      spend(); S.rowUnlocked = true; this.lockedOverlay?.destroy(); tada(); persist(true); p.destroy();
    };
    p.add(ui.button(this, W / 2, H / 2 - 150, 420, 70, t('row.buyCoins', { n: PRICES.rowCoins }), 0x5a48a8,
      () => buy(S.coins >= PRICES.rowCoins, () => { S.coins -= PRICES.rowCoins; this.refreshHud(); })));
    p.add(ui.button(this, W / 2, H / 2 - 60, 420, 70, t('row.buyGems', { n: PRICES.rowGems }), 0x8f5ad0,
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

  /** Сколько свободных клеток на поле (для подсказок и «поле забито»). */
  private freeCells(): number {
    let n = 0;
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) if (!this.grid[r][c]) n++;
    return n;
  }

  private spawnItem(chain: number, level: number, r: number, c: number, silent = false) {
    const { x, y } = this.cellXY(r, c);
    const box = this.add.container(x, y);
    const img = this.add.image(0, 0, textureKey(chain, level)).setDisplaySize(114, 114);
    const badge = this.add.text(42, 42, `${level + 1}`, { fontFamily: FONT, fontSize: '20px', color: RARITY[level], fontStyle: '800' }).setOrigin(0.5).setStroke('#1a1230', 4);
    box.add([img, badge]).setSize(GRID.cell, GRID.cell).setInteractive({ draggable: true });
    // Мутировавшая цепочка помечена прямо на поле: игрок видит, кого сегодня растить.
    if (chain === this.mutChain) box.add(ui.chip(this, -40, -44, 52, 24, `×${MUTATION_MULT}`, '#7fdc8f', 0x14301f));
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
    ui.toast(this, W / 2, GRID.y + 80, t('pedia.discovered', { name: this.cname(chain, level), coins, gems: gems ? ` +${gems}💎` : '' }));
    this.refreshHud();
    if (chain === SECRET_CHAIN && level === 0) this.secret67Panel();
  }

  private wireDrag(item: Item) {
    const box = item.obj;
    let dragged = false;
    // Тап остаётся кликером (монеты с комбо), долгое нажатие открывает карточку
    // существа: характеристики, продажа, отправка в команду. Разные жесты, потому
    // что кликер — отдельная механика и отдавать его под меню нельзя.
    let downAt = 0;
    box.on('pointerdown', () => { downAt = Date.now(); });
    box.on('dragstart', () => { dragged = true; downAt = 0; this.showMergeHints(item); });
    // Длительность жеста считаем по реальным меткам времени, а не таймером сцены:
    // таймер зависит от частоты кадров, а короткое касание и удержание надо
    // различать одинаково надёжно на любом устройстве.
    box.on('pointerup', () => {
      if (dragged) return;
      if (downAt && Date.now() - downAt >= HOLD_MS) this.creaturePanel(item);
      else this.tapCreature(item);
      downAt = 0;
    });
    box.on('drag', (_p: unknown, dx: number, dy: number) => { box.setPosition(dx, dy).setDepth(10); });
    box.on('dragend', () => {
      dragged = false;
      box.setDepth(0);
      this.clearMergeHints();
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

  /**
   * Подсветка клеток, с которыми перетаскиваемое существо можно слить.
   * В merge-играх это главная подсказка: игроку не приходится глазами искать пару.
   */
  private showMergeHints(item: Item) {
    this.clearMergeHints();
    if (item.level >= this.chainCfg(item.chain).names.length - 1) return; // максимум цепочки
    const g = this.add.graphics().setDepth(-1); // выше поля, ниже существ
    let found = false;
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c];
      if (!it || it === item || it.chain !== item.chain || it.level !== item.level) continue;
      const { x, y } = this.cellXY(r, c);
      const s = GRID.cell / 2 - 5;
      g.fillStyle(0xffe066, 0.16); g.fillRoundedRect(x - s, y - s, s * 2, s * 2, 12);
      g.lineStyle(4, 0xffe066, 0.95); g.strokeRoundedRect(x - s, y - s, s * 2, s * 2, 12);
      found = true;
    }
    if (!found) { g.destroy(); return; }
    this.mergeHints = g;
    this.tweens.add({ targets: g, alpha: { from: 0.5, to: 1 }, yoyo: true, repeat: -1, duration: 420 });
  }

  private clearMergeHints() {
    this.mergeHints?.destroy();
    this.mergeHints = undefined;
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
    S.quests.progress.merges++; S.stats.merges++;
    this.addPassPoints(PASS.points.merge);
    S.score += level * 2;
    if (level >= 4) track('merge_high', { level });
    if (S.battle.side >= 0 && a.chain === S.battle.side) S.battle.points += level; // очки «Битвы недели»
    buzz(BUZZ.merge);
    if (level === 5) {
      // Легендарка заслуживает имени; если имя уже есть — это всё равно «вау»-момент.
      if (!S.customNames[a.chain]) this.renamePanel(a.chain);
      else void this.platformPrompt('wow');
    }
    if (a.chain === EVENT_CHAIN_INDEX && this.ev) {
      S.event.points += level * 2;
      ui.toast(this, W / 2, GRID.y + 140, t('event.points', { emoji: this.ev.emoji, n: level * 2 }));
    }
    if (this.hint) { this.hint.destroy(); this.hint = undefined; ui.toast(this, W / 2, GRID.y - 30, t('ftue.afterMerge')); }
    this.tipIncome();
    if (level >= 3) this.maybeStarterOffer();
    this.refreshHud();
    this.persistBoard();
  }

  // ---------- получение существ ----------
  /**
   * Одна кнопка вместо четырёх генераторов наверху: пока кулдаун не вышел, существо
   * можно купить за монеты, а как выйдет — взять бесплатно. Кнопка живёт в зоне
   * большого пальца, и у игрока всегда один понятный способ добыть существо.
   */
  private freeLeft() { return GEN.cooldownMs - (Date.now() - S.freeLast); }

  private tickSpawnButton() {
    const left = this.freeLeft();
    const free = left <= 0;
    this.spawnLabel?.setText(free
      ? t('hud.spawnFree')
      : `${t('hud.creature', { cost: this.spawnCost() })}\n${t('hud.freeIn', { n: Math.ceil(left / 1000) })}`);
    this.spawnLabel?.setFontSize(free ? 21 : 17);
    // Полоска кулдауна по нижней кромке кнопки — прогресс виден без чтения цифр.
    const g = this.spawnBar;
    if (!g) return;
    g.clear();
    if (free) {
      g.fillStyle(0x7fdc8f, 0.9); g.fillRoundedRect(-124, 20, 248, 6, 3);
      return;
    }
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(-124, 20, 248, 6, 3);
    g.fillStyle(0xffb84d, 1); g.fillRoundedRect(-124, 20, 248 * (1 - left / GEN.cooldownMs), 6, 3);
  }

  /**
   * Случайная цепочка — но с поддавками: если на поле лежит «одинокое» существо
   * первого уровня, в 70% случаев выдаём ему пару. Чистый рандом при четырёх
   * цепочках слишком часто оставлял игрока с четырьмя разными существами.
   */
  private smartChain(): number {
    const pool = ZONES[S.zone].chains as number[];
    if (this.evCfg && Math.random() < 0.25) return EVENT_CHAIN_INDEX; // событийные — приоритетом
    const counts = new Map<number, number>();
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c];
      if (it?.level === 0) counts.set(it.chain, (counts.get(it.chain) ?? 0) + 1);
    }
    const lonely = pool.filter(ch => (counts.get(ch) ?? 0) % 2 === 1);
    if (lonely.length && Math.random() < 0.7) return Phaser.Math.RND.pick(lonely) as number;
    return Phaser.Math.RND.pick(pool) as number;
  }

  // ---------- HUD ----------
  /**
   * Экран разгружен сознательно: арена — ключевая механика, поэтому она главная
   * кнопка по центру нижней панели, остальные разделы — компактные иконки по краям.
   * Настройки уехали из верхнего угла в навигацию, «Битва недели» — внутрь арены,
   * а скорость дохода переехала в пилюлю монет: было три пилюли и десять кнопок.
   */
  private drawHud() {
    this.add.text(W / 2, 30, 'BRAINROT LAB: MERGE', { fontFamily: FONT, fontSize: '30px', color: '#ffe066', fontStyle: '900' })
      .setOrigin(0.5).setStroke('#120c22', 6).setShadow(0, 2, 'rgba(0,0,0,0.5)', 4);

    // Монеты + скорость дохода в одной пилюле, кристаллы во второй.
    this.coinsText = ui.pill(this, 24, 76, 400, '🪙', 0xffe066);
    this.incomeText = this.add.text(408, 76, '', { fontFamily: FONT, fontSize: '19px', color: '#7fdc8f', fontStyle: '700' }).setOrigin(1, 0.5);
    this.gemsText = ui.pill(this, 444, 76, 252, '💎', 0xc9a6ff);

    // Строка статусов: инкубатор, локация, событие. Тапают их редко, поэтому верх
    // экрана им подходит — а яйцо обязано быть на виду: это причина вернуться.
    const wide = !this.ev;
    const eggBtn = ui.button(this, wide ? 180 : 118, 126, wide ? 340 : 216, 44, '', 0x5a48a8, () => this.incubatorPanel(), 18);
    this.eggLabel = eggBtn.list[1] as Phaser.GameObjects.Text;
    this.eggBadge = this.add.circle((wide ? 340 : 216) + (wide ? 12 : 4), 108, 9, 0xff5050).setDepth(2);
    ui.button(this, wide ? 540 : 350, 126, wide ? 340 : 224, 44, `🗺️ ${t(`zone.${ZONES[S.zone].id}`)}`, 0x2e6d9d, () => this.zonesPanel(), 18);
    if (this.ev)
      ui.button(this, 582, 126, 224, 44, `${this.ev.emoji} ${t(`event.${this.ev.id}`).split(' ')[0]} · ${daysLeft(this.ev)}${t('hud.day')}`, 0xa8542e, () => this.eventPanel(), 18);

    // Действия основного цикла — по краям, чтобы центр остался под главную кнопку.
    const spawnBtn = ui.button(this, 148, 1124, 268, 62, '', 0x5a48a8, () => this.trySpawn(), 21);
    this.spawnLabel = spawnBtn.list[1] as Phaser.GameObjects.Text; // [graphics, text, hit]
    this.spawnLabel.setAlign('center').setLineSpacing(-2);
    this.spawnBar = this.add.graphics({ x: 148, y: 1124 }); // полоска кулдауна поверх кнопки
    // Rewarded-точка: игрок сам меняет ролик на буст дохода (PLAN.md §4).
    ui.button(this, 572, 1124, 268, 62, t('hud.incomeAd', { mult: INCOME.boostAdMult }), 0x2e7d5b, () =>
      sdk.showRewarded(() => {
        // если активен более сильный буст — реклама продлевает его, а не понижает
        S.boostMult = Date.now() < S.boostUntil ? Math.max(S.boostMult, INCOME.boostAdMult) : INCOME.boostAdMult;
        S.boostUntil = Date.now() + INCOME.boostAdMs;
        this.refreshHud(); persist();
        ui.toast(this, 572, 1080, t('hud.boostOn', { mult: S.boostMult }), '#7fdc8f');
      }), 19);

    this.drawNavBar();
    this.refreshHud();
  }

  /** Нижняя панель: иконки по краям, арена — приподнятая главная кнопка в центре. */
  private drawNavBar() {
    const g = this.add.graphics();
    g.fillStyle(0x1b1436, 0.98);
    g.fillRoundedRect(0, 1166, W, 130, { tl: 26, tr: 26, bl: 0, br: 0 });
    g.lineStyle(2, 0x5a48a8, 0.7);
    g.beginPath(); g.moveTo(0, 1167); g.lineTo(W, 1167); g.strokePath();

    ui.navItem(this, 78, 1222, '💎', t('nav.shop'), () => openShop(this, this.api));
    ui.navItem(this, 200, 1222, '📋', t('nav.quests'), () => this.questsPanel());
    this.questBadge = this.add.circle(232, 1196, 9, 0xff5050).setDepth(2);
    ui.navItem(this, 520, 1222, '📖', t('nav.pedia'), () => this.memePanel());
    this.pediaBadge = this.add.circle(552, 1196, 9, 0xff5050).setDepth(2);
    ui.navItem(this, 642, 1222, '⚙️', t('nav.settings'), () => this.settingsPanel());

    // Главная кнопка: приподнята в зазор между кнопками действий, со свечением.
    const hero = this.add.container(W / 2, 1184).setDepth(3);
    const hg = this.add.graphics();
    // Рамка профиля (заработана в сезоне) красит свечение главной кнопки — статус
    // виден на главном экране, а не только внутри арены.
    const fr = this.frameOf();
    hg.lineStyle(6, fr ? fr.color : 0xffb84d, fr ? 0.55 : 0.22);
    hg.strokeRoundedRect(-75, -53, 150, 106, 26);
    hg.fillStyle(0x000000, 0.4); hg.fillRoundedRect(-70, -44, 140, 96, 22);
    hg.fillGradientStyle(0xd4703a, 0xd4703a, 0x9d5a2e, 0x9d5a2e, 1);
    hg.fillRoundedRect(-70, -48, 140, 96, 22);
    hg.fillStyle(0xffffff, 0.16); hg.fillRoundedRect(-66, -44, 132, 40, 18);
    hg.lineStyle(3, 0xffd07a, 0.9); hg.strokeRoundedRect(-70, -48, 140, 96, 22);
    const hit = this.add.rectangle(0, 0, 140, 96, 0xffffff, 0.001).setInteractive();
    hero.add([hg,
      this.add.text(0, -18, '🏆', { fontSize: '38px' }).setOrigin(0.5),
      this.add.text(0, 26, t('nav.arena'), { fontFamily: FONT, fontSize: '18px', color: '#fff', fontStyle: '800' }).setOrigin(0.5),
      hit]);
    hit.on('pointerdown', () => this.tweens.add({ targets: hero, scale: 0.94, duration: 60, yoyo: true, onComplete: () => this.arenaPanel() }));
    this.arenaBtn = hero;
    // Точка на главной кнопке, когда за кубки можно забрать награду.
    this.arenaBadge = this.add.circle(W / 2 + 58, 1140, 10, 0xff5050).setDepth(4);
  }

  // ---------- настройки: звук (важно для модерации), язык, сброс ----------
  private settingsPanel() {
    const p = ui.panel(this, t('set.title'));
    const soundBtn = ui.button(this, W / 2, H / 2 - 350, 480, 68,
      isMuted() ? t('set.soundOff') : t('set.soundOn'), isMuted() ? 0x3a3a55 : 0x2e7d5b, () => {
        const on = !isMuted();
        setMuted(on); S.soundOn = !on; persist(true);
        (soundBtn.list[1] as Phaser.GameObjects.Text).setText(on ? t('set.soundOff') : t('set.soundOn'));
        if (!on) coinSound();
      }, 25);
    this.addTo(p, soundBtn);
    // Вибрация — второй канал «сочности», работает даже с выключенным звуком.
    const hapBtn = ui.button(this, W / 2, H / 2 - 272, 480, 68,
      S.hapticsOn ? t('set.hapticsOn') : t('set.hapticsOff'), S.hapticsOn ? 0x2e7d5b : 0x3a3a55, () => {
        S.hapticsOn = !S.hapticsOn; persist(true);
        (hapBtn.list[1] as Phaser.GameObjects.Text).setText(S.hapticsOn ? t('set.hapticsOn') : t('set.hapticsOff'));
        buzz(BUZZ.claim); // сразу дать почувствовать результат
      }, 25);
    this.addTo(p, hapBtn);
    this.addTo(p, this.add.text(W / 2, H / 2 - 200, t('set.lang'), { fontFamily: FONT, fontSize: '25px', color: '#c9beee' }).setOrigin(0.5));
    LANGS.forEach((l, i) => {
      const cur = getLang() === l.code;
      this.addTo(p, ui.button(this, W / 2 - 200 + i * 200, H / 2 - 140, 180, 62, l.label, cur ? 0x2e7d5b : 0x5a48a8, () => {
        if (cur) return;
        S.lang = l.code as Lang; setLang(l.code); persist(true);
        track('lang_switch', { lang: l.code });
        this.scene.restart(); // перерисовать всю сцену на новом языке
      }, 22));
    });
    // Промокод: живой канал владельца в соцсети — и метка в аналитике, по которой
    // видно, какой именно пост привёл игроков.
    this.addTo(p, ui.button(this, W / 2, H / 2 - 50, 480, 66, t('set.promo'), 0x8f5ad0, () => this.redeemPromo(), 22));
    // Ярлык вручную: игра предлагает его сама раз в жизни, но кто-то захочет позже.
    this.addTo(p, ui.button(this, W / 2, H / 2 + 30, 480, 66, t('set.shortcut'), 0x5a48a8, async () => {
      if (!await sdk.canShortcut()) { failSound(); return; }
      if (await sdk.addShortcut()) { S.shortcutAsked = true; persist(true); tada(); ui.toast(this, W / 2, H / 2, t('ask.shortcutDone')); }
    }, 22));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 160, 480, 66, t('set.reset'), 0x9d2e4d, () => {
      const c = ui.panel(this, t('set.reset'));
      this.addTo(c, this.add.text(W / 2, H / 2 - 120, t('set.resetAsk'), { fontFamily: FONT, fontSize: '28px', color: '#fff', align: 'center' }).setOrigin(0.5));
      this.addTo(c, ui.button(this, W / 2, H / 2 + 20, 460, 74, t('set.resetYes'), 0x9d2e4d, () => {
        resetProgress(); track('progress_reset'); this.scene.restart();
      }, 24));
    }, 24));
    this.addTo(p, this.add.text(W / 2, H / 2 + 280, `${t('set.version', { v: VERSION })}\n${t('set.credits')}`,
      { fontFamily: FONT, fontSize: '20px', color: '#8f86b8', align: 'center' }).setOrigin(0.5));
  }

  /** Ввод промокода: разбираем награду, отмечаем код использованным. */
  private redeemPromo() {
    const raw = window.prompt(t('promo.prompt'), '');
    if (!raw?.trim()) return;
    const code = promoByCode(raw);
    if (!code) { failSound(); ui.toast(this, W / 2, H / 2, t('promo.bad'), '#ff7070'); return; }
    if (S.codesUsed.includes(code.code)) { failSound(); ui.toast(this, W / 2, H / 2, t('promo.used'), '#ff7070'); return; }
    S.codesUsed.push(code.code);
    if (code.gems) S.gems += code.gems;
    if (code.egg) this.giveEgg(code.egg);
    tada(); buzz(BUZZ.claim);
    track('code_redeem', { code: code.code });
    ui.toast(this, W / 2, H / 2, t('promo.ok', {
      gems: code.gems ? t('promo.gems', { n: code.gems }) : '',
      egg: code.egg ? t('promo.egg', { name: t(`egg.${code.egg}`) }) : '',
    }));
    this.refreshHud(); persist(true);
  }

  // ---------- FTUE 2.0: по одной подсказке на механику, каждая один раз ----------
  /** Баннер в свободной зоне + пульс целевого элемента (стрелки не нужны — глаз ловит движение). */
  private tip(key: string, target?: Phaser.GameObjects.GameObject, params?: Record<string, string | number>) {
    this.tipBanner?.destroy();
    const b = this.add.container(W / 2, 1064).setDepth(20);
    const label = this.add.text(0, 0, t(key, params), {
      fontFamily: FONT, fontSize: '22px', color: '#ffe066', fontStyle: '700',
      align: 'center', wordWrap: { width: 600 },
    }).setOrigin(0.5);
    const w = label.width + 36, h = label.height + 22;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 14);
    g.fillStyle(0x2a1f4d, 0.98); g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, 0xffe066, 0.7); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    b.add([g, label]);
    this.tipBanner = b;
    this.tweens.add({ targets: b, y: { from: 1084, to: 1064 }, alpha: { from: 0, to: 1 }, duration: 260 });
    if (target) this.tweens.add({ targets: target, scale: 1.15, yoyo: true, repeat: 5, duration: 520 });
    this.time.delayedCall(6200, () => {
      if (this.tipBanner === b) this.tipBanner = undefined;
      this.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: () => b.destroy() });
    });
  }

  private tipIncome() {
    if (S.tips.income) return;
    S.tips.income = true; persist();
    this.tip('ftue.income', this.incomeText);
  }

  /** Триггеры подсказок проверяем в refreshHud — он вызывается на каждое изменение. */
  private checkTips() {
    if (!S.tips.tap && S.tips.income && S.coins >= 30) {
      const any = this.grid.flat().find(Boolean);
      if (any) { S.tips.tap = true; persist(); this.tip('ftue.tap', any.obj); }
    }
    if (!S.tips.arena && (S.coins >= 500 || S.discovered.some(ch => ch[5]))) {
      S.tips.arena = true; persist();
      this.tip('ftue.arena', this.arenaBtn);
    }
    // Про карточку существа рассказываем, когда поле почти забито: именно тогда
    // игроку впервые нужно что-то продать или отправить в бой.
    if (!S.tips.card && this.freeCells() <= 3) {
      const any = this.grid.flat().find(Boolean);
      if (any) { S.tips.card = true; persist(); this.tip('ftue.card', any.obj); }
    }
  }

  /** Цена существа зависит от дохода поля — см. spawnCostOf в config.ts. */
  private spawnCost(): number { return spawnCostOf(S.spawnBought, this.totalIncome() * (60_000 / INCOME.periodMs)); }

  private refreshHud() {
    this.coinsText.setText(`${S.coins}`);
    this.gemsText.setText(`${S.gems}`);
    const boost = Date.now() < S.boostUntil ? ` ×${S.boostMult}` : '';
    this.incomeText.setText(`+${this.totalIncome()}/5${t('hud.sec')}${boost}`);
    this.tickSpawnButton(); // подпись кнопки зависит от кулдауна, а не только от цены
    this.tickEgg();
    const claimable = QUESTS.some((q, i) => !S.quests.claimed[i] && S.quests.progress[q.id] >= q.target);
    this.questBadge?.setVisible(claimable || this.passClaimable());
    this.arenaBadge?.setVisible(ARENA_MILESTONES.some((m, i) => !S.arenaClaimed[i] && S.cupsBest >= m.cups));
    this.pediaBadge?.setVisible(anyAchClaimable());
    this.checkTips();
  }

  /** Бесплатно, если кулдаун вышел; иначе за монеты по растущей цене. */
  private trySpawn() {
    const free = this.freeLeft() <= 0;
    const cost = this.spawnCost();
    if (!free && S.coins < cost) {
      failSound(); buzz(BUZZ.fail);
      ui.toast(this, 148, 1080, t('hud.freeSoon', { n: Math.ceil(this.freeLeft() / 1000) }), '#ff7070');
      return;
    }
    const cell = this.findEmpty();
    if (!cell) { failSound(); buzz(BUZZ.fail); ui.toast(this, 148, 1080, t('common.boardFull'), '#ff7070'); return; }
    if (free) {
      S.freeLast = Date.now();
    } else {
      S.coins -= cost;
      S.spawnBought++; // цена растёт только от покупок за монеты
    }
    this.spawnItem(this.smartChain(), 0, ...cell);
    S.quests.progress.spawns++; S.stats.spawns++;
    if (free) coinSound();
    this.tickSpawnButton();
    this.refreshHud();
  }

  private spawnSecret(): boolean {
    const cell = this.findEmpty();
    if (!cell) return false;
    this.spawnItem(SECRET_CHAIN, 0, ...cell);
    this.persistBoard();
    return true;
  }

  private spawnReward(level: number): boolean { return !!this.spawnRewardItem(level); }

  /** То же, но возвращает, кто именно родился — нужно для сообщений («вылупился X»). */
  private spawnRewardItem(level: number): { chain: number; level: number } | null {
    const cell = this.findEmpty();
    if (!cell) return null;
    const chain = Phaser.Math.RND.pick(ZONES[S.zone].chains) as number;
    const lv = Math.min(level, 5);
    this.spawnItem(chain, lv, ...cell);
    this.persistBoard();
    return { chain, level: lv };
  }

  // ---------- заказы ----------
  /**
   * Карточка существа по долгому нажатию: доход, боевые характеристики, продажа и
   * отправка в команду арены. Заменила систему заказов — теперь игрок сам решает,
   * что держать ради дохода, что продать, а что поставить в бой, видя все цифры.
   */
  private creaturePanel(item: Item) {
    const cfg = this.chainCfg(item.chain);
    const name = item.level === 5 && S.customNames[item.chain]
      ? `«${S.customNames[item.chain]}»` : this.cname(item.chain, item.level);
    const p = ui.panel(this, name);
    const st = unitStats(item.chain, item.level);
    const price = sellPrice(item.chain, item.level);

    this.addTo(p, this.add.image(W / 2, H / 2 - 300, textureKey(item.chain, item.level)).setDisplaySize(190, 190));
    this.addTo(p, this.add.text(W / 2, H / 2 - 185, `${rarityName(item.level)} · ${t('card.level', { n: item.level + 1 })}`,
      { fontFamily: FONT, fontSize: '23px', color: RARITY[item.level], fontStyle: '700' }).setOrigin(0.5));

    // Доход — главная причина держать существо на поле.
    this.addTo(p, ui.card(this, W / 2, H / 2 - 110, 560, 76, 0x2e6d9d));
    this.addTo(p, this.add.text(W / 2, H / 2 - 118, t('card.income', { n: this.itemIncome(item.chain, item.level) }),
      { fontFamily: FONT, fontSize: '26px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
    if (item.chain === this.mutChain)
      this.addTo(p, this.add.text(W / 2, H / 2 - 88, t('mut.card', { mult: MUTATION_MULT }),
        { fontFamily: FONT, fontSize: '19px', color: '#7fdc8f', fontStyle: '700' }).setOrigin(0.5));

    // Боевые характеристики — чтобы выбирать бойцов осознанно.
    this.addTo(p, ui.card(this, W / 2, H / 2 - 10, 560, 82, 0x3a2f66));
    this.addTo(p, this.add.text(W / 2, H / 2 - 26, `⚔ ${st.dmg}    ❤ ${st.hp}    ⏱ ${(st.spd / 1000).toFixed(1)}${t('hud.sec')}`,
      { fontFamily: FONT, fontSize: '25px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 + 6, t(`card.type.${st.type}`),
      { fontFamily: FONT, fontSize: '19px', color: '#c9beee' }).setOrigin(0.5));

    // В команду — если есть свободный слот; иначе объясняем, почему нельзя.
    const inTeam = S.team.length >= 5;
    this.addTo(p, ui.button(this, W / 2, H / 2 + 110, 520, 74,
      inTeam ? t('card.teamFull') : t('card.toTeam'), inTeam ? 0x3a3a55 : 0x9d5a2e, () => {
        if (inTeam) { failSound(); return; }
        S.team.push([item.chain, item.level]);
        this.removeItem(item);
        jingleFanfare(); track('team_add');
        this.persistBoard(true); this.refreshHud();
        p.destroy();
      }, 24));

    const sell = () => {
      S.coins += price;
      S.sold++;
      this.removeItem(item);
      coinSound(); track('creature_sold', { level: item.level });
      ui.toast(this, W / 2, H / 2, `+${price}🪙`);
      this.persistBoard(true); this.refreshHud();
      p.destroy();
    };
    this.addTo(p, ui.button(this, W / 2, H / 2 + 210, 520, 74, t('card.sell', { n: price }), 0x2e7d5b, () => {
      // Легендарку продают только с подтверждением: собирается она долго.
      if (item.level < 5) { sell(); return; }
      const c = ui.panel(this, t('card.sellSure'));
      this.addTo(c, this.add.text(W / 2, H / 2 - 60, t('card.sellLegend', { name, n: price }),
        { fontFamily: FONT, fontSize: '26px', color: '#fff', align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5));
      this.addTo(c, ui.button(this, W / 2, H / 2 + 60, 460, 74, t('card.sell', { n: price }), 0x9d2e4d, () => { c.destroy(); sell(); }, 24));
    }, 24));
    void cfg;
  }

  /** Убрать существо с поля (продажа или отправка в команду). */
  private removeItem(item: Item) {
    const at = this.findItem(item);
    if (at) this.grid[at[0]][at[1]] = null;
    item.obj.destroy();
  }

  // ---------- ежедневный бонус ----------
  private streakPanel(mode: 'claim' | 'lost', onDone: () => void) {
    const p = ui.panel(this, t('streak.title'), onDone);
    const nextDay = mode === 'lost' ? 1 : (S.streakDay % 7) + 1;
    const savedDay = (S.streakDay % 7) + 1;
    STREAK_REWARDS.forEach((rw, i) => {
      const x = W / 2 - 270 + i * 90, y = H / 2 - 280;
      const got = i + 1 < (mode === 'lost' ? savedDay : nextDay);
      this.addTo(p, this.add.circle(x, y, 34, got ? 0x2e7d5b : i + 1 === nextDay ? 0xffe066 : 0x3a3a55).setStrokeStyle(2, 0xffffff, 0.4));
      this.addTo(p, this.add.text(x, y, `${i + 1}`, { fontSize: '24px', color: got || i + 1 === nextDay ? '#241a45' : '#fff' }).setOrigin(0.5));
      this.addTo(p, this.add.text(x, y + 56, rewardLabel(rw), { fontSize: '18px', color: '#c9a6ff' }).setOrigin(0.5));
    });
    const claim = (day: number) => {
      const rw = STREAK_REWARDS[day - 1];
      S.coins += rw.coins ?? 0; S.gems += rw.gems ?? 0;
      if (rw.chest) this.spawnReward(4);
      S.streakDay = day; S.streakLast = today();
      tada(); buzz(BUZZ.claim); track('daily_claim', { day });
      this.refreshHud(); persist(true); p.destroy();
      ui.toast(this, W / 2, H / 2 - 40, t('streak.comeBack', { reward: rewardLabel(STREAK_REWARDS[day % 7]) }), '#c9a6ff');
      onDone();
    };
    if (mode === 'claim') {
      this.addTo(p, ui.button(this, W / 2, H / 2, 420, 76, t('streak.claimDay', { n: nextDay }), 0x2e7d5b, () => claim(nextDay)));
      // Тизер завтрашнего дня: игрок уходит, зная, что его ждёт — классический D1.
      this.addTo(p, this.add.text(W / 2, H / 2 + 96, t('streak.tomorrow', { reward: rewardLabel(STREAK_REWARDS[nextDay % 7]) }),
        { fontFamily: FONT, fontSize: '24px', color: '#c9a6ff', fontStyle: '700' }).setOrigin(0.5));
    } else {
      // Мягкий loss aversion: серию можно спасти рекламой — без реальной потери (PLAN.md §15).
      this.addTo(p, this.add.text(W / 2, H / 2 - 120, t('streak.lost', { n: S.streakDay }), { fontSize: '30px', color: '#ff9d70' }).setOrigin(0.5));
      this.addTo(p, ui.button(this, W / 2, H / 2, 480, 76, t('streak.save'), 0x2e7d5b,
        () => sdk.showRewarded(() => claim(savedDay))));
      this.addTo(p, ui.button(this, W / 2, H / 2 + 100, 480, 64, t('streak.restart'), 0x5a48a8, () => claim(1)));
    }
  }

  private addTo(p: Phaser.GameObjects.Container, obj: Phaser.GameObjects.GameObject) { p.add(obj); }

  // ---------- квесты ----------
  private questsPanel() {
    const p = ui.panel(this, t('quests.title'));
    this.tabsFor(p, 'quests');
    QUESTS.forEach((q, i) => {
      const y = H / 2 - 250 + i * 145;
      const prog = Math.min(S.quests.progress[q.id], q.target);
      this.addTo(p, this.add.text(W / 2 - 290, y,
        t('quests.line', { label: t(`quest.${q.id}`), prog, target: q.target, coins: q.coins, gems: q.gems }),
        { fontSize: '26px', color: '#fff' }));
      if (S.quests.claimed[i])
        this.addTo(p, this.add.text(W / 2 + 210, y + 20, '✅', { fontSize: '40px' }).setOrigin(0.5));
      else if (prog >= q.target)
        this.addTo(p, ui.button(this, W / 2 + 210, y + 24, 170, 60, t('common.claim'), 0x2e7d5b, () => {
          S.quests.claimed[i] = true; S.coins += q.coins; S.gems += q.gems;
          this.addPassPoints(PASS.points.quest);
          coinSound(); buzz(BUZZ.claim); this.refreshHud(); persist(); p.destroy(); this.questsPanel();
        }));
    });
    this.addTo(p, this.add.text(W / 2, H / 2 + 260, t('quests.footer'), { fontSize: '24px', color: '#8f86b8' }).setOrigin(0.5));
  }

  // ---------- «Лабораторный журнал»: сезонный трек ----------
  /** Сезон журнала совпадает с сезоном арены; на стыке трек начинается заново. */
  private syncPass() {
    const now = seasonId();
    if (S.pass.season === now) return;
    S.pass = { season: now, points: 0, claimed: [], premium: S.pass.premium === now ? now : '' };
    persist(true);
  }

  private passUnlocked() { return Math.min(PASS.tiers, Math.floor(S.pass.points / PASS.perTier)); }
  private passPremium() { return S.pass.premium === seasonId(); }
  private passClaimable() {
    const un = this.passUnlocked();
    return PASS_TRACK.some((_, i) => i < un && !S.pass.claimed[i]);
  }

  /**
   * Очки журнала за обычную игру. Тост показываем не чаще раза в 10 секунд —
   * иначе слияния превратят экран в поток цифр.
   */
  private addPassPoints(n: number) {
    this.syncPass();
    S.pass.points += n;
    if (Date.now() - this.passToastAt > 10_000) {
      this.passToastAt = Date.now();
      ui.toast(this, 620, 160, t('pass.gained', { n }), '#c9a6ff');
    }
    this.refreshHud();
  }

  /** Читаемая награда тира; монеты — в минутах дохода, чтобы не обесценивались. */
  private passRewardText(rw: PassReward): string {
    const mult = this.passPremium() ? 2 : 1;
    return [
      rw.coinsMin && t('pass.coinsMin', { n: rw.coinsMin * mult }),
      rw.gems && `${rw.gems * mult}💎`,
      rw.egg && `🥚 ${t(`egg.${rw.egg}`)}${mult > 1 ? ' ×2' : ''}`,
      rw.chest && `${t('event.chest')}${mult > 1 ? ' ×2' : ''}`,
      rw.frame && `🖼️ ${this.frameName(rw.frame)} (${t('pass.premiumOnly')})`,
    ].filter(Boolean).join(' + ');
  }

  private claimPassTier(i: number) {
    const rw = PASS_TRACK[i];
    const prem = this.passPremium();
    const mult = prem ? 2 : 1;
    S.pass.claimed[i] = true;
    if (rw.coinsMin) {
      const perMin = this.totalIncome() * (60_000 / INCOME.periodMs);
      S.coins += Math.max(200, Math.round(perMin * rw.coinsMin)) * mult;
    }
    if (rw.gems) S.gems += rw.gems * mult;
    if (rw.egg) { this.giveEgg(rw.egg); if (prem) this.giveEgg(rw.egg); }
    if (rw.chest) { rollChest(this.api, this, W / 2, H / 2 + 200); if (prem) rollChest(this.api, this, W / 2, H / 2 + 240); }
    // Рамка — единственная премиум-эксклюзивная награда трека.
    if (rw.frame && prem && !S.frames.includes(rw.frame)) { S.frames.push(rw.frame); S.frame = rw.frame; }
    tada(); buzz(BUZZ.claim);
    track('pass_claim', { tier: i + 1, premium: prem });
    this.refreshHud(); persist(true);
  }

  private passPanel() {
    this.syncPass();
    const un = this.passUnlocked();
    const p = ui.panel(this, t('pass.title', { tier: un, total: PASS.tiers }));
    this.tabsFor(p, 'pass');
    // Прогресс до следующего тира
    const inTier = S.pass.points % PASS.perTier;
    const capped = un >= PASS.tiers;
    const g = this.add.graphics();
    g.fillStyle(0x161028, 0.9); g.fillRoundedRect(W / 2 - 280, H / 2 - 300, 560, 24, 12);
    g.fillStyle(0x8f5ad0, 1); g.fillRoundedRect(W / 2 - 277, H / 2 - 297, 554 * (capped ? 1 : inTier / PASS.perTier), 18, 9);
    this.addTo(p, g);
    this.addTo(p, this.add.text(W / 2, H / 2 - 265,
      capped ? t('pass.done') : t('pass.progress', { points: inTier, need: PASS.perTier }),
      { fontFamily: FONT, fontSize: '21px', color: '#c9beee' }).setOrigin(0.5));

    // Окно из пяти тиров вокруг первого незабранного — весь трек в окно не влезет.
    const firstOpen = PASS_TRACK.findIndex((_, i) => !S.pass.claimed[i]);
    const start = Math.max(0, Math.min(firstOpen < 0 ? PASS.tiers - 5 : firstOpen - 1, PASS.tiers - 5));
    PASS_TRACK.slice(start, start + 5).forEach((rw, k) => {
      const i = start + k;
      const y = H / 2 - 190 + k * 92;
      const open = i < un, claimed = !!S.pass.claimed[i];
      this.addTo(p, ui.card(this, W / 2, y, 616, 80, claimed ? 0x2f4d3a : open ? 0x3d2f6e : 0x2a2247, 14));
      this.addTo(p, this.add.text(W / 2 - 286, y - 16, t('pass.tier', { n: i + 1 }),
        { fontFamily: FONT, fontSize: '21px', color: open ? '#ffe066' : '#8f86b8', fontStyle: '800' }).setOrigin(0, 0.5));
      this.addTo(p, this.add.text(W / 2 - 286, y + 16, this.passRewardText(rw),
        { fontFamily: FONT, fontSize: '18px', color: '#fff', wordWrap: { width: 400 } }).setOrigin(0, 0.5));
      if (claimed) this.addTo(p, this.add.text(W / 2 + 240, y, '✅', { fontSize: '32px' }).setOrigin(0.5));
      else if (open)
        this.addTo(p, ui.button(this, W / 2 + 240, y, 120, 56, t('common.claim'), 0x2e7d5b, () => {
          this.claimPassTier(i); p.destroy(); this.passPanel();
        }, 18));
      else
        this.addTo(p, this.add.text(W / 2 + 240, y, t('pass.locked', { n: (i + 1) * PASS.perTier - S.pass.points }),
          { fontFamily: FONT, fontSize: '16px', color: '#8f86b8', align: 'center', wordWrap: { width: 130 } }).setOrigin(0.5));
    });

    this.addTo(p, this.add.text(W / 2, H / 2 + 334, t('pass.how', PASS.points),
      { fontFamily: FONT, fontSize: '18px', color: '#8f86b8', align: 'center' }).setOrigin(0.5));
    // Премиум — синк кристаллов: удвоение наград и рамка, но не сила в бою.
    if (this.passPremium())
      this.addTo(p, this.add.text(W / 2, H / 2 + 258, t('pass.bought'),
        { fontFamily: FONT, fontSize: '22px', color: '#c9a6ff', fontStyle: '700' }).setOrigin(0.5));
    else
      this.addTo(p, ui.button(this, W / 2, H / 2 + 256, 520, 62, t('pass.buy', { gems: PASS.premiumGems }), 0x8f5ad0, () => {
        if (S.gems < PASS.premiumGems) { failSound(); ui.toast(this, W / 2, H / 2, t('common.notEnoughGems'), '#ff7070'); return; }
        if (!window.confirm(t('pass.buyAsk', { id: S.pass.season, gems: PASS.premiumGems }))) return;
        S.gems -= PASS.premiumGems;
        S.pass.premium = seasonId();
        tada(); track('pass_premium');
        this.refreshHud(); persist(true); p.destroy(); this.passPanel();
      }, 22));
  }

  /** Общий переключатель вкладок «Задания дня» / «Журнал». */
  private tabsFor(p: Phaser.GameObjects.Container, cur: 'quests' | 'pass') {
    const mk = (x: number, key: string, to: 'quests' | 'pass') =>
      this.addTo(p, ui.button(this, x, H / 2 - 352, 300, 52, t(key), cur === to ? 0x2e7d5b : 0x3a3a55, () => {
        if (cur === to) return;
        p.destroy();
        if (to === 'quests') this.questsPanel(); else this.passPanel();
      }, 20));
    mk(W / 2 - 158, 'pass.tabQuests', 'quests');
    mk(W / 2 + 158, 'pass.tab', 'pass');
  }

  // ---------- локации ----------
  private zonesPanel() {
    const p = ui.panel(this, t('zones.title'));
    ZONES.forEach((z, i) => {
      const y = H / 2 - 250 + i * 170;
      const label = `${t(`zone.${z.id}`)}\n${t('zones.chains', { n: z.chains.length })}`;
      if (S.zoneUnlocked[i]) {
        this.addTo(p, ui.button(this, W / 2, y, 520, 120, i === S.zone ? `📍 ${label}` : label, i === S.zone ? 0x2e7d5b : 0x5a48a8,
          () => { if (i !== S.zone) this.switchZone(i); }));
      } else {
        this.addTo(p, ui.button(this, W / 2, y, 520, 120, `🔒 ${label}\n${t('zones.unlock', { coins: z.unlockCoins, gems: z.unlockGems })}`, 0x3a3a55, () => {
          if (S.coins >= z.unlockCoins) S.coins -= z.unlockCoins;
          else if (S.gems >= z.unlockGems) S.gems -= z.unlockGems;
          else { failSound(); ui.toast(this, W / 2, y, t('common.notEnoughFunds'), '#ff7070'); return; }
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
    const p = ui.panel(this, `${ev.emoji} ${t(`event.${ev.id}`)}`);
    this.addTo(p, this.add.text(W / 2, H / 2 - 330,
      t('event.info', { days: daysLeft(ev), points: S.event.points, emoji: ev.emoji }),
      { fontSize: '24px', color: '#fff', align: 'center' }).setOrigin(0.5));
    ev.milestones.forEach((m, i) => {
      const y = H / 2 - 180 + i * 110;
      const rw = [m.coins && `${m.coins}🪙`, m.gems && `${m.gems}💎`, m.chest && t('event.chest'), m.egg && `🥚 ${t(`egg.${m.egg}`)}`].filter(Boolean).join(' + ');
      this.addTo(p, this.add.text(W / 2 - 280, y, `${Math.min(S.event.points, m.points)}/${m.points} ${ev.emoji}\n${rw}`, { fontSize: '25px', color: '#fff' }));
      if (S.event.claimed[i])
        this.addTo(p, this.add.text(W / 2 + 210, y + 24, '✅', { fontSize: '38px' }).setOrigin(0.5));
      else if (S.event.points >= m.points)
        this.addTo(p, ui.button(this, W / 2 + 210, y + 28, 170, 58, t('common.claim'), 0x2e7d5b, () => {
          S.event.claimed[i] = true; S.coins += m.coins ?? 0; S.gems += m.gems ?? 0;
          if (m.chest) this.spawnReward(4);
          if (m.egg) this.giveEgg(m.egg);
          jingleFanfare(); track('event_milestone', { points: m.points });
          this.refreshHud(); persist(true); p.destroy(); this.eventPanel();
        }));
    });
    this.addTo(p, this.add.text(W / 2, H / 2 + 300, t('event.footer'), { fontSize: '20px', color: '#8f86b8', align: 'center' }).setOrigin(0.5));
  }

  // ---------- Мемпедия и награды: «музей игрока» на двух вкладках ----------
  private memePanel(tab: 'pedia' | 'ach' = 'pedia') {
    const total = CHAINS.reduce((n, ch) => n + ch.names.length, 0);
    const found = S.discovered.flat().filter(Boolean).length;
    const p = ui.panel(this, tab === 'pedia'
      ? t('pedia.title', { found, total })
      : t('ach.title', { done: achCountDone(), total: ACHIEVEMENTS.length }));
    const tabBtn = (x: number, key: string, to: 'pedia' | 'ach') =>
      this.addTo(p, ui.button(this, x, H / 2 - 352, 300, 52, t(key), tab === to ? 0x2e7d5b : 0x3a3a55, () => {
        if (tab === to) return;
        p.destroy(); this.memePanel(to);
      }, 20));
    tabBtn(W / 2 - 158, 'ach.tabPedia', 'pedia');
    tabBtn(W / 2 + 158, 'ach.tab', 'ach');
    if (tab === 'ach') { this.achList(p); return; }
    // Сетка портретов: ряд — цепочка, колонка — уровень. Тап по портрету — имя.
    const x0 = W / 2 - 180, y0 = H / 2 - 288;
    CHAINS.forEach((cfg, ci) => {
      const y = y0 + ci * 56;
      this.addTo(p, this.add.image(x0 - 100, y, textureKey(ci, 0)).setDisplaySize(42, 42).setAlpha(0.85));
      cfg.names.forEach((_ru, lv) => {
        const x = x0 + lv * 72;
        const name = this.cname(ci, lv);
        if (S.discovered[ci][lv]) {
          const img = this.add.image(x, y, textureKey(ci, lv)).setDisplaySize(54, 54).setInteractive();
          const shown = lv === 5 && S.customNames[ci] ? `«${S.customNames[ci]}» (${name})` : name;
          img.on('pointerdown', () => ui.toast(this, W / 2, y, `${shown} · ${rarityName(lv)}`, RARITY[lv]));
          this.addTo(p, img);
        } else {
          const box = this.add.rectangle(x, y, 52, 52, 0x161028, 0.9).setStrokeStyle(2, 0x4a3a80).setInteractive();
          box.on('pointerdown', () => ui.toast(this, W / 2, y, t(ci === SECRET_CHAIN ? 'pedia.secretHint' : 'pedia.locked'), '#8f86b8'));
          this.addTo(p, box);
          this.addTo(p, this.add.text(x, y, '?', { fontFamily: FONT, fontSize: '24px', color: '#5a5474', fontStyle: '700' }).setOrigin(0.5));
        }
      });
    });
  }

  /**
   * Список наград. Показываем семь строк: сначала то, что можно забрать, потом
   * самое близкое к цели. Полный список из 28 в окно не влезет, а забранные
   * строки только зашумляют — они уходят вниз.
   */
  private achList(p: Phaser.GameObjects.Container) {
    const rank = (a: Achievement) => {
      if (achClaimable(a)) return 1000;
      if (achTaken(a)) return -1;
      return Math.min(1, achValue(a) / a.at);
    };
    const rows = ACHIEVEMENTS.map((a, i) => ({ a, i }))
      .sort((x, y) => rank(y.a) - rank(x.a))
      .slice(0, 7);
    rows.forEach(({ a }, row) => {
      const y = H / 2 - 260 + row * 88;
      const val = achValue(a), done = achDone(a);
      this.addTo(p, ui.card(this, W / 2, y, 616, 76, done ? 0x2f4d3a : 0x322558, 14));
      this.addTo(p, this.add.text(W / 2 - 286, y - 15, t(`ach.${a.metric}`, { n: a.at }),
        { fontFamily: FONT, fontSize: '22px', color: '#fff', fontStyle: '700' }).setOrigin(0, 0.5));
      const prog = a.at > 1 ? `${Math.min(val, a.at)}/${a.at}` : done ? '✔' : '—';
      this.addTo(p, this.add.text(W / 2 - 286, y + 17, `${prog}    +${a.gems}💎`,
        { fontFamily: FONT, fontSize: '18px', color: '#c9beee' }).setOrigin(0, 0.5));
      if (achClaimable(a)) {
        this.addTo(p, ui.button(this, W / 2 + 226, y, 148, 54, t('common.claim'), 0x2e7d5b, () => {
          S.achClaimed.push(achId(a)); S.gems += a.gems;
          tada(); buzz(BUZZ.claim); track('ach_claim', { metric: a.metric, at: a.at });
          this.refreshHud(); persist(true); p.destroy(); this.memePanel('ach');
        }, 19));
      } else if (achTaken(a) && a.share) {
        this.addTo(p, ui.button(this, W / 2 + 226, y, 148, 54, t('ach.share').slice(0, 2), 0x5a48a8, () => this.shareAch(a), 24));
      } else if (achTaken(a)) {
        this.addTo(p, this.add.text(W / 2 + 226, y, '✅', { fontSize: '34px' }).setOrigin(0.5));
      }
    });
  }

  /** Хвастовство: у «социальных» наград свой текст — его и копируем в буфер. */
  private shareAch(a: Achievement) {
    const key = `ach.share${a.metric[0].toUpperCase()}${a.metric.slice(1)}`;
    navigator.clipboard?.writeText(t(key, { n: achValue(a) })).catch(() => {});
    track('ach_share', { metric: a.metric });
    ui.toast(this, W / 2, H / 2, t('common.copied'));
  }

  // ---------- боссы лиг: проверка на силу, а не на удачу ----------
  /**
   * Босс лиги: пятеро твоих против одного гиганта. Его характеристики статичны и
   * привязаны к лиге (см. arena.ts), поэтому «прийти позже сильнее» работает буквально:
   * симуляция показывает, что эталонная пятёрка лиги проигрывает, а та же команда с
   * пятью уровнями казармы или на уровень выше — выигрывает уверенно.
   */
  private bossPanel(i: number) {
    const def = BOSSES[i];
    const st = bossStats(def);
    const name = this.cname(def.chain, def.level);
    const p = ui.panel(this, t('boss.title', { name }), () => this.arenaPanel());
    this.addTo(p, this.add.image(W / 2, H / 2 - 250, textureKey(def.chain, def.level)).setDisplaySize(240, 240));
    this.addTo(p, this.add.text(W / 2, H / 2 - 90, t('boss.desc', {
      hp: st.hp, dmg: st.dmg, spd: (st.spd / 1000).toFixed(1), type: t(`card.type.${st.type}`).split('—')[0].trim(),
    }), { fontFamily: FONT, fontSize: '23px', color: '#fff', align: 'center', lineSpacing: 6 }).setOrigin(0.5));
    // Подсказка про сплэш — не флейвор: против одиночной цели он бьёт в 0.45 силы,
    // и состав команды решает исход сильнее, чем уровень казармы.
    this.addTo(p, ui.card(this, W / 2, H / 2 + 20, 600, 116, 0x322558));
    this.addTo(p, this.add.text(W / 2, H / 2 + 20, t('boss.hint'),
      { fontFamily: FONT, fontSize: '20px', color: '#c9beee', align: 'center', lineSpacing: 6 }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 + 120, t('arena.power', { n: Math.round(teamPower(S.team)) }),
      { fontFamily: FONT, fontSize: '22px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 200, 480, 78, t('boss.fight'), 0x9d2e4d, () => {
      if (S.team.length < 3) { failSound(); ui.toast(this, W / 2, H / 2, t('arena.needTeam'), '#ff7070'); return; }
      p.destroy(); this.startBossBattle(i, 1);
    }, 26));
  }

  private startBossBattle(i: number, factor: number) {
    const def = BOSSES[i];
    track('boss_battle', { league: i });
    sdk.gameplayStart();
    startBattle(this, S.team, factor, [], 1, this.cname(def.chain, def.level),
      win => this.bossResult(i, win), bossStats(def));
  }

  private bossResult(i: number, win: boolean) {
    const def = BOSSES[i];
    S.battles++;
    if (win) {
      S.bossBeaten[i] = true;
      S.gems += def.gems;
      this.giveEgg('gold'); // главный приз: сутки ожидания и эпическое существо
      jingleFanfare(); buzz(BUZZ.win);
      track('boss_win', { league: i });
    } else {
      failSound();
      track('boss_lose', { league: i });
    }
    persist(true); this.refreshHud();
    const p = ui.panel(this, t(win ? 'boss.win' : 'boss.lose'), () => this.arenaPanel());
    this.addTo(p, this.add.image(W / 2, H / 2 - 240, textureKey(def.chain, def.level))
      .setDisplaySize(200, 200).setAlpha(win ? 1 : 0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 80, win ? t('boss.reward', { gems: def.gems }) : t('boss.loseInfo'),
      { fontFamily: FONT, fontSize: win ? '28px' : '23px', color: '#fff', align: 'center', lineSpacing: 8 }).setOrigin(0.5));
    if (!win)
      // Реванш с бустом — честный инструмент, когда до победы не хватает совсем чуть-чуть.
      this.addTo(p, ui.button(this, W / 2, H / 2 + 80, 500, 72, t('boss.rematch', { buff: REMATCH_BUFF }), 0x2e7d5b, () =>
        sdk.showRewarded(() => { p.destroy(); this.startBossBattle(i, REMATCH_BUFF); }), 22));
    if (S.battles % INTERSTITIAL.everyNBattles === 0 && interstitialAllowed()) sdk.maybeInterstitial();
  }

  // ---------- сезон арены: месячный цикл с мягким сбросом ----------
  /**
   * Сезон = календарный месяц. На стыке выдаём награду за пиковую лигу и мягко
   * срезаем кубки: лестница снова даёт быстрый рост вместо стены. Пороги наград
   * живут на S.cupsBest, поэтому сброс ничего не отбирает.
   */
  private checkSeason() {
    const now = seasonId();
    if (!S.season.id) { // первый запуск после обновления — просто начинаем сезон
      S.season = { id: now, peak: leagueIndex(S.cups) };
      persist(true);
      return;
    }
    if (S.season.id === now) { S.season.peak = Math.max(S.season.peak, leagueIndex(S.cups)); return; }
    const peak = Math.max(S.season.peak, leagueIndex(S.cups));
    const gems = SEASON.gems[peak] ?? SEASON.gems[0];
    const league = LEAGUES[peak];
    const before = S.cups;
    S.cups = Math.floor(S.cups * SEASON.reset);
    S.season = { id: now, peak: leagueIndex(S.cups) };
    const fresh = !S.frames.includes(league.key);
    if (fresh) S.frames.push(league.key);
    if (!S.frame || frameRank(S.frame) < frameRank(league.key)) S.frame = league.key; // надеваем лучшую
    S.gems += gems;
    track('season_end', { peak: league.key, cups: before });
    persist(true);
    this.seasonPanel(league, gems, fresh);
  }

  private seasonPanel(league: typeof LEAGUES[number], gems: number, fresh: boolean) {
    const p = ui.panel(this, t('season.title'));
    jingleFanfare(); buzz(BUZZ.win);
    this.addTo(p, this.add.text(W / 2, H / 2 - 320, t('season.peak'),
      { fontFamily: FONT, fontSize: '24px', color: '#c9beee' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 240, league.emblem, { fontSize: '96px' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 155, t(`league.${league.key}`),
      { fontFamily: FONT, fontSize: '34px', color: `#${league.color.toString(16).padStart(6, '0')}`, fontStyle: '800' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 90, t('season.reward', { gems }),
      { fontFamily: FONT, fontSize: '30px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
    if (fresh)
      this.addTo(p, this.add.text(W / 2, H / 2 - 30, t('season.frame', { name: t(`league.${league.key}`) }),
        { fontFamily: FONT, fontSize: '23px', color: '#ffe066', align: 'center', wordWrap: { width: 580 } }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 + 70, t('season.reset', { cups: S.cups }),
      { fontFamily: FONT, fontSize: '22px', color: '#c9beee', align: 'center', lineSpacing: 6 }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 200, 520, 78, t('season.claim'), 0x2e7d5b, () => {
      tada(); this.refreshHud(); p.destroy();
    }, 25));
  }

  /** Сколько дней осталось до конца календарного месяца. */
  private seasonDaysLeft(): number {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
  }

  /** Надетая рамка профиля (null — рамок ещё нет). */
  private frameOf() { return S.frame ? frameByKey(S.frame) : null; }

  /** Имя рамки: у лиговых — название лиги, у особых — своё. */
  private frameName(key: string) { return key === 'pass' ? t('frame.pass') : t(`league.${key}`); }

  // ---------- Арена: команда 5 бойцов, кубки, казарма, лидерборд ----------
  private arenaPanel() {
    while (S.arenaClaimed.length < ARENA_MILESTONES.length) S.arenaClaimed.push(false);
    const p = ui.panel(this, t('arena.title', { n: S.cups }));
    // слоты команды: боец снят с поля и НЕ приносит доход
    this.addTo(p, this.add.text(W / 2, H / 2 - 372, t('arena.teamHint'), { fontFamily: FONT, fontSize: '20px', color: '#c9beee' }).setOrigin(0.5));
    for (let i = 0; i < 5; i++) {
      const x = W / 2 - 240 + i * 120, y = H / 2 - 296;
      const member = S.team[i];
      const slot = ui.card(this, x, y, 108, 108, member ? 0x3a2f66 : 0x231b42, 14);
      this.addTo(p, slot);
      if (member) {
        const st = unitStats(member[0], member[1]);
        slot.add(this.add.image(0, -8, textureKey(member[0], member[1])).setDisplaySize(84, 84));
        slot.add(ui.chip(this, 0, 40, 100, 24, `⚔${st.dmg} ❤${st.hp}`, '#c9beee'));
      } else {
        slot.add(this.add.text(0, 0, '+', { fontFamily: FONT, fontSize: '46px', color: '#5a5474', fontStyle: '700' }).setOrigin(0.5));
      }
      const hit = this.add.rectangle(0, 0, 108, 108, 0xffffff, 0.001).setInteractive();
      hit.on('pointerdown', () => (member ? this.removeFromTeam(i, p) : (p.destroy(), this.teamPicker())));
      slot.add(hit);
    }
    this.addTo(p, this.add.text(W / 2, H / 2 - 200, t('arena.power', { n: Math.round(teamPower(S.team)) }), { fontFamily: FONT, fontSize: '23px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 - 130, 420, 78, t('arena.fight'), 0x9d2e4d, () => {
      if (!S.team.length) { failSound(); ui.toast(this, W / 2, H / 2 - 130, t('arena.needTeam'), '#ff7070'); return; }
      p.destroy();
      this.startArenaBattle(1);
    }, 30));
    // казарма — бесконечный синк монет (+5% к статам за уровень)
    (['atk', 'hp'] as const).forEach((k, i) => {
      const cost = upgradeCost(S.upgrades[k]);
      this.addTo(p, ui.button(this, W / 2 - 150 + i * 300, H / 2 - 40, 280, 64,
        t(k === 'atk' ? 'arena.atk' : 'arena.hp', { n: S.upgrades[k], cost }), 0x2e6d9d, () => {
          if (S.coins < cost) { failSound(); ui.toast(this, W / 2, H / 2 - 40, t('common.notEnoughCoins'), '#ff7070'); return; }
          S.coins -= cost; S.upgrades[k]++;
          coinSound(); track('barracks_upgrade', { stat: k });
          this.refreshHud(); persist(); p.destroy(); this.arenaPanel();
        }, 19));
    });
    // милстоуны кубков
    // Лига: где игрок сейчас и сколько до следующей. Читается лучше числа кубков.
    const league = leagueOf(S.cups), up = nextLeague(S.cups);
    const lg = this.add.graphics();
    lg.fillStyle(league.color, 0.22); lg.fillRoundedRect(W / 2 - 280, H / 2 + 6, 560, 62, 14);
    lg.lineStyle(2, league.color, 0.9); lg.strokeRoundedRect(W / 2 - 280, H / 2 + 6, 560, 62, 14);
    if (up) { // полоса прогресса до следующей лиги
      const prev = league.cups;
      const k = Math.max(0.02, Math.min(1, (S.cups - prev) / (up.cups - prev)));
      lg.fillStyle(0x161028, 0.8); lg.fillRoundedRect(W / 2 - 268, H / 2 + 44, 536, 16, 8);
      lg.fillStyle(league.color, 1); lg.fillRoundedRect(W / 2 - 266, H / 2 + 46, 532 * k, 12, 6);
    }
    this.addTo(p, lg);
    this.addTo(p, this.add.text(W / 2 - 266, H / 2 + 24, `🏆 ${t(`league.${league.key}`)}`,
      { fontFamily: FONT, fontSize: '24px', color: '#fff', fontStyle: '800' }).setOrigin(0, 0.5));
    this.addTo(p, this.add.text(W / 2 + 266, H / 2 + 24,
      up ? `${S.cups} / ${up.cups}🏆` : `${S.cups}🏆`,
      { fontFamily: FONT, fontSize: '21px', color: '#c9beee', fontStyle: '700' }).setOrigin(1, 0.5));

    // Ближайшие три незабранные награды: полный список из десяти не влезает, а
    // забранные строки только зашумляют — они исчезают.
    const pending = ARENA_MILESTONES.map((m, i) => ({ m, i })).filter(({ i }) => !S.arenaClaimed[i]).slice(0, 3);
    pending.forEach(({ m, i }, row) => {
      const y = H / 2 + 106 + row * 48;
      const rw = [m.coins && `${m.coins}🪙`, m.gems && `${m.gems}💎`, m.chest && t('event.chest')].filter(Boolean).join(' + ');
      const reached = S.cupsBest >= m.cups;
      this.addTo(p, this.add.text(W / 2 - 280, y, `${m.cups}🏆 — ${rw}`,
        { fontFamily: FONT, fontSize: '20px', color: reached ? '#fff' : '#6b6490', fontStyle: reached ? '600' : '400' }).setOrigin(0, 0.5));
      if (reached)
        this.addTo(p, ui.button(this, W / 2 + 210, y, 150, 40, t('common.claim'), 0x2e7d5b, () => {
          S.arenaClaimed[i] = true; S.coins += m.coins ?? 0; S.gems += m.gems ?? 0;
          tada(); track('arena_milestone', { cups: m.cups });
          if (m.chest) rollChest(this.api, this, W / 2, H / 2 + 200);
          this.refreshHud(); persist(true); p.destroy(); this.arenaPanel();
        }, 16));
    });
    if (!pending.length)
      this.addTo(p, this.add.text(W / 2, H / 2 + 150, t('arena.allClaimed'),
        { fontFamily: FONT, fontSize: '22px', color: '#8f86b8', align: 'center' }).setOrigin(0.5));
    // Босс лиги: открывается по личному рекорду кубков, побеждается один раз.
    const bossIdx = Math.min(BOSSES.length - 1, leagueIndex(S.cupsBest));
    const bossOpen = leagueIndex(S.cupsBest) >= 1; // первый босс — со второй лиги
    const bossDone = !!S.bossBeaten[bossIdx];
    const bossName = this.cname(BOSSES[bossIdx].chain, BOSSES[bossIdx].level);
    this.addTo(p, ui.button(this, W / 2, H / 2 + 196, 560, 58,
      !bossOpen ? t('boss.locked', { name: t(`league.${LEAGUES[1].key}`) })
        : bossDone ? t('boss.done') : t('boss.btn', { name: bossName }),
      !bossOpen || bossDone ? 0x3a3a55 : 0x9d2e4d, () => {
        if (!bossOpen || bossDone) { failSound(); return; }
        p.destroy(); this.bossPanel(bossIdx);
      }, 20));
    // Сезон: сколько осталось и какая рамка надета (тап — сменить).
    this.addTo(p, this.add.text(W / 2, H / 2 + 242, t('season.now', { id: S.season.id || seasonId(), days: this.seasonDaysLeft() }),
      { fontFamily: FONT, fontSize: '20px', color: '#8f86b8' }).setOrigin(0.5));
    if (S.frames.length) {
      const fr = this.frameOf() ?? FRAMES[0];
      const chip = ui.chip(this, W / 2, H / 2 + 284, 420, 40,
        `${fr.emblem} ${this.frameName(fr.key)} · ${t('season.frameHint')}`, `#${fr.color.toString(16).padStart(6, '0')}`);
      const hit = this.add.rectangle(0, 0, 420, 40, 0xffffff, 0.001).setInteractive();
      hit.on('pointerdown', () => {
        const i = S.frames.indexOf(S.frame);
        S.frame = S.frames[(i + 1) % S.frames.length];
        clickSound(1); persist(true);
        p.destroy(); this.arenaPanel();
      });
      chip.add(hit);
      this.addTo(p, chip);
    }
    // «Битва недели» жила отдельной кнопкой в шапке — перенесена сюда, к состязаниям.
    this.addTo(p, ui.button(this, W / 2 - 92, H / 2 + 336, 176, 48, t('arena.top'), 0x5a48a8, () => { p.destroy(); this.leaderboardPanel(); }, 17));
    this.addTo(p, ui.button(this, W / 2 + 96, H / 2 + 336, 176, 48, t('wb.short'), 0x9d2e4d, () => { p.destroy(); this.battlePanel(); }, 17));
  }

  /** Пикер бойца: существо переезжает с поля в команду (клетка освобождается). */
  private teamPicker() {
    const p = ui.panel(this, t('arena.pickTitle'), () => this.arenaPanel());
    const items: { item: Item; r: number; c: number }[] = [];
    for (let r = 0; r < this.maxRows(); r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) items.push({ item: it, r, c });
    }
    if (!items.length)
      this.addTo(p, this.add.text(W / 2, H / 2, t('arena.pickEmpty'), { fontFamily: FONT, fontSize: '26px', color: '#fff', align: 'center' }).setOrigin(0.5));
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
    if (!cell) { failSound(); ui.toast(this, W / 2, H / 2 - 290, t('arena.noRoom'), '#ff7070'); return; }
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
    const leagueBefore = leagueOf(S.cups);
    S.cups = Math.max(0, S.cups + d);
    S.cupsBest = Math.max(S.cupsBest, S.cups); // пороги наград живут на рекорде
    S.season.peak = Math.max(S.season.peak, leagueIndex(S.cups));
    S.battles++;
    let coins = 0;
    if (win) { S.wins++; S.quests.progress.wins++; coins = 150 + Math.floor(enemyPower / 5); S.coins += coins; }
    if (win) this.addPassPoints(PASS.points.win);
    if (win && S.wins % INCUBATOR.winEvery === 0) this.giveEgg('common');
    sdk.submitScore('cups', S.cups);
    track(win ? 'arena_win' : 'arena_lose', { cups: S.cups });
    persist(true); this.refreshHud();
    // Повышение в лиге — отдельный праздник, его не должно съесть окно результата.
    const leagueNow = leagueOf(S.cups);
    const promoted = leagueNow.cups > leagueBefore.cups;
    const p = ui.panel(this, t(win ? 'arena.win' : 'arena.lose'),
      promoted ? () => void this.platformPrompt('wow') : undefined);
    if (win) buzz(BUZZ.win);
    if (promoted) {
      jingleFanfare(); track('league_up', { league: leagueNow.key });
      this.giveEgg('rare'); // новая лига — редкое яйцо: награда за рост, а не за гринд
      this.addTo(p, this.add.text(W / 2, H / 2 - 330, t('arena.leagueUp', { name: t(`league.${leagueNow.key}`) }),
        { fontFamily: FONT, fontSize: '30px', color: '#ffe066', fontStyle: '800', align: 'center' }).setOrigin(0.5));
    }
    const info = win
      ? t('arena.winInfo', { d: `${d >= 0 ? '+' : ''}${d}`, coins }) + (S.wins % 3 === 0 ? `\n\n${t('arena.chestHint')}` : '')
      : t('arena.loseInfo', { d });
    this.addTo(p, this.add.text(W / 2, H / 2 - 220, info,
      { fontFamily: FONT, fontSize: '30px', color: '#fff', align: 'center', fontStyle: '700' }).setOrigin(0.5));
    if (win && S.wins % 3 === 0) rollChest(this.api, this, W / 2, H / 2 - 100);
    this.addTo(p, ui.button(this, W / 2, H / 2 + 60, 380, 72, t('arena.again'), 0x9d2e4d, () => { p.destroy(); this.startArenaBattle(1); }, 24));
    if (!win)
      this.addTo(p, ui.button(this, W / 2, H / 2 + 160, 460, 66, t('arena.rematch', { buff: REMATCH_BUFF }), 0x2e7d5b, () =>
        sdk.showRewarded(() => { p.destroy(); this.startArenaBattle(REMATCH_BUFF, en); }), 21));
    // Конец боя — естественный стык для interstitial (заказов, служивших якорем
    // раньше, больше нет). Капы и запрет в первую сессию — в sdk.ts.
    if (S.battles % INTERSTITIAL.everyNBattles === 0 && interstitialAllowed()) sdk.maybeInterstitial();
  }

  private async leaderboardPanel() {
    const p = ui.panel(this, t('arena.lbTitle'), () => this.arenaPanel());
    const me = t('arena.you');
    let rows = await sdk.getLeaderboardTop('cups');
    if (!rows.length) { // dev-мок: правдоподобный топ вокруг игрока
      rows = nicks().slice(0, 9).map((name, i) => ({ rank: i + 1, name, score: Math.max(10, S.cups + (5 - i) * 47) }));
      rows.push({ rank: rows.length + 1, name: me, score: S.cups });
      rows.sort((a, b) => b.score - a.score).forEach((r, i) => (r.rank = i + 1));
    }
    rows.slice(0, 10).forEach((r, i) => {
      const y = H / 2 - 330 + i * 66;
      const isMe = r.name === me;
      const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : ` ${r.rank}.`;
      const fr = isMe ? this.frameOf() : null; // рамка профиля видна в общем списке
      this.addTo(p, this.add.text(W / 2 - 280, y, `${medal} ${r.name}${fr ? ` ${fr.emblem}` : ''}`, { fontFamily: FONT, fontSize: '24px', color: isMe ? '#ffe066' : '#fff', fontStyle: isMe ? '800' : '400' }).setOrigin(0, 0.5));
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
      ui.toast(this, W / 2, H / 2, t('wb.over', { gems: reward, points: S.battle.points }));
    }
    S.battle = { week, side: -1, points: 0 };
    persist();
  }

  private battlePanel() {
    const [ta, tb] = this.battleTeams();
    const p = ui.panel(this, t('wb.title'));
    this.addTo(p, this.add.text(W / 2, H / 2 - 310,
      t('wb.desc', { a: this.cname(ta, 5), b: this.cname(tb, 5) }),
      { fontFamily: FONT, fontSize: '23px', color: '#fff', align: 'center' }).setOrigin(0.5));
    [ta, tb].forEach((ch, i) => {
      const x = W / 2 - 150 + i * 300;
      this.addTo(p, this.add.image(x, H / 2 - 140, textureKey(ch, 3)).setDisplaySize(140, 140));
      if (S.battle.side < 0)
        this.addTo(p, ui.button(this, x, H / 2 - 30, 250, 62, t('wb.join', { name: this.cname(ch, 0) }), i ? 0x9d2e4d : 0x2e6d9d, () => {
          S.battle.side = ch;
          jingleFanfare(); track('battle_join', { chain: CHAINS[ch].id });
          persist(true); p.destroy(); this.battlePanel();
        }, 20));
      else if (S.battle.side === ch)
        this.addTo(p, this.add.text(x, H / 2 - 30, t('wb.mine'), { fontFamily: FONT, fontSize: '22px', color: '#ffe066', fontStyle: '700' }).setOrigin(0.5));
    });
    if (S.battle.side >= 0) {
      this.addTo(p, this.add.text(W / 2, H / 2 + 80, t('wb.points', { n: S.battle.points }), { fontFamily: FONT, fontSize: '30px', color: '#fff', fontStyle: '700' }).setOrigin(0.5));
      this.addTo(p, ui.button(this, W / 2, H / 2 + 170, 480, 66, t('wb.invite'), 0x2e7d5b, () => {
        navigator.clipboard?.writeText(t('wb.share', { name: this.cname(S.battle.side, 5), n: S.battle.points })).catch(() => {});
        track('battle_share');
        ui.toast(this, W / 2, H / 2 + 120, t('common.copied'));
      }, 22));
    }
  }

  // ---------- имя для легендарки: пользовательский контент = скриншоты ----------
  private renamePanel(chain: number) {
    // Закрыл окно имени — самый радостный момент за сессию, тут и просим оценку.
    const p = ui.panel(this, t('rename.title'), () => void this.platformPrompt('wow'));
    this.addTo(p, this.add.image(W / 2, H / 2 - 230, textureKey(chain, 5)).setDisplaySize(190, 190));
    this.addTo(p, this.add.text(W / 2, H / 2 - 80, t('rename.desc', { name: this.cname(chain, 5) }),
      { fontFamily: FONT, fontSize: '24px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 60, 420, 70, t('rename.btn'), 0x8f5ad0, () => {
      const nm = window.prompt(t('rename.prompt'), S.customNames[chain] ?? '');
      if (nm?.trim()) {
        S.customNames[chain] = nm.trim().slice(0, 24);
        track('legend_named');
        persist(true);
        ui.toast(this, W / 2, H / 2, t('rename.done', { name: S.customNames[chain] }));
      }
    }));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 160, 480, 64, t('rename.brag'), 0x2e7d5b, () => {
      navigator.clipboard?.writeText(t('rename.share', { name: S.customNames[chain] ?? this.cname(chain, 5) })).catch(() => {});
      track('legend_share');
      ui.toast(this, W / 2, H / 2 + 110, t('common.copied'));
    }, 22));
  }

  // ---------- секретный «67»: главный вирусный крючок ----------
  private secret67Panel() {
    track('secret_67_found');
    const p = ui.panel(this, t('s67.title'));
    this.addTo(p, this.add.image(W / 2, H / 2 - 220, textureKey(SECRET_CHAIN, 0)).setDisplaySize(180, 180));
    this.addTo(p, this.add.text(W / 2, H / 2 - 60, t('s67.desc'),
      { fontFamily: FONT, fontSize: '26px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 140, 480, 72, t('s67.brag'), 0x2e7d5b, () => {
      navigator.clipboard?.writeText(t('s67.share')).catch(() => {});
      track('secret_67_share');
      ui.toast(this, W / 2, H / 2 + 90, t('common.copied'));
    }));
  }

  // ---------- стартер-пак: единственный проактивный офер, один раз, после «вау» ----------
  private maybeStarterOffer() {
    if (S.starterBought || S.starterOffered || this.time.now < 90_000) return;
    S.starterOffered = true; persist(true);
    const p = ui.panel(this, t('starter.title'));
    this.addTo(p, this.add.text(W / 2, H / 2 - 220, t('starter.desc'),
      { fontSize: '30px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 120, 420, 76, t('starter.btn'), 0x2e7d5b, async () => {
      if (await sdk.purchase('starter', false)) {
        S.starterBought = true; S.gems += 150; S.coins += 5000; S.adFreeUntil = Date.now() + 7 * 86_400_000;
        tada(); this.refreshHud(); persist(true);
      }
      p.destroy();
    }));
  }

  // ---------- инкубатор: причина вернуться через два часа ----------
  /** Сколько осталось ждать (мс). ≤0 — яйцо готово. */
  private eggLeft(): number {
    const e = S.egg;
    return e ? e.startedAt + EGGS[e.type].hours * 3_600_000 - Date.now() : 0;
  }

  /** «1:42» для часов и «42 м» для минут — на чипе нужна короткая форма. */
  private fmtLeft(ms: number): string {
    const min = Math.max(0, Math.ceil(ms / 60_000));
    return min >= 60 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}` : `${min}${t('hud.min')}`;
  }

  private tickEgg() {
    if (!this.eggLabel) return;
    const e = S.egg;
    const left = this.eggLeft();
    const ready = !!e && left <= 0;
    this.eggLabel.setText(!e ? t('egg.chipNone') : ready ? t('egg.chipReady') : `🥚 ${this.fmtLeft(left)}`);
    this.eggLabel.setColor(ready ? '#7fdc8f' : '#ffffff');
    this.eggBadge?.setVisible(ready);
  }

  /**
   * Выдать яйцо. Занятый инкубатор награду не съедает: она уходит в очередь, а если
   * и очередь полна — превращается в кристаллы. Игрок никогда не остаётся ни с чем.
   */
  private giveEgg(type: EggType) {
    const name = t(`egg.${type}`);
    if (!S.egg) {
      S.egg = { type, startedAt: Date.now(), ads: 0, adsDay: today() };
      ui.toast(this, W / 2, 176, t('egg.got', { name }));
    } else if (S.eggQueue.length < INCUBATOR.queueMax) {
      S.eggQueue.push(type);
      ui.toast(this, W / 2, 176, t('egg.gotQueued', { name }));
    } else {
      const gems = EGGS[type].gems || 5;
      S.gems += gems;
      ui.toast(this, W / 2, 176, t('egg.gems', { n: gems }));
    }
    jingleDiscovery(); buzz(BUZZ.claim);
    track('egg_got', { type });
    this.tickEgg(); this.refreshHud(); persist(true);
  }

  private hatchEgg() {
    const e = S.egg;
    if (!e || this.eggLeft() > 0) return;
    const cfg = EGGS[e.type];
    S.egg = null; S.eggsHatched++;
    const secret = cfg.secret > 0 && Math.random() < cfg.secret;
    const born = secret ? (this.spawnSecret() ? { chain: SECRET_CHAIN, level: 0 } : null) : this.spawnRewardItem(cfg.level);
    if (cfg.gems) S.gems += cfg.gems;
    if (born) {
      ui.toast(this, W / 2, GRID.y + 80, secret ? t('chest.secret') : t('egg.hatched', { name: this.cname(born.chain, born.level) }));
    } else {
      const coins = 200 * (cfg.level + 1);
      S.coins += coins;
      ui.toast(this, W / 2, GRID.y + 80, t('egg.hatchedFull', { n: coins }));
    }
    if (cfg.gems) ui.toast(this, W / 2, GRID.y + 150, t('egg.gems', { n: cfg.gems }), '#c9a6ff');
    // Следующее яйцо встаёт в инкубатор само: возвращаться ради нажатия кнопки — плохой крючок.
    const next = S.eggQueue.shift();
    if (next) S.egg = { type: next, startedAt: Date.now(), ads: 0, adsDay: today() };
    tada(); buzz(BUZZ.win);
    track('egg_hatched', { type: e.type });
    this.tickEgg(); this.refreshHud(); persist(true);
  }

  private incubatorPanel() {
    const p = ui.panel(this, t('egg.title'));
    const e = S.egg;
    if (!e) {
      this.addTo(p, this.add.text(W / 2, H / 2 - 260, '🥚', { fontSize: '110px' }).setOrigin(0.5).setAlpha(0.35));
      this.addTo(p, this.add.text(W / 2, H / 2 - 40, t('egg.none', { n: INCUBATOR.winEvery }),
        { fontFamily: FONT, fontSize: '25px', color: '#fff', align: 'center', lineSpacing: 10 }).setOrigin(0.5));
      return;
    }
    const cfg = EGGS[e.type];
    const left = this.eggLeft();
    const ready = left <= 0;
    const col = `#${cfg.color.toString(16).padStart(6, '0')}`;

    // Свечение в цвет типа: эмодзи-яйцо одинаковое, а редкость должна читаться сразу.
    const glow = this.add.graphics();
    glow.fillStyle(cfg.color, 0.22); glow.fillCircle(W / 2, H / 2 - 290, 96);
    glow.fillStyle(cfg.color, 0.14); glow.fillCircle(W / 2, H / 2 - 290, 124);
    this.addTo(p, glow);
    const icon = this.add.text(W / 2, H / 2 - 290, '🥚', { fontSize: '130px' }).setOrigin(0.5);
    this.addTo(p, icon);
    // Готовое яйцо трясётся заметно сильнее — это видно краем глаза.
    this.tweens.add({
      targets: icon, angle: ready ? { from: -14, to: 14 } : { from: -4, to: 4 },
      yoyo: true, repeat: -1, duration: ready ? 200 : 900,
    });
    this.addTo(p, this.add.text(W / 2, H / 2 - 180, t(`egg.${e.type}`).toUpperCase(),
      { fontFamily: FONT, fontSize: '26px', color: col, fontStyle: '800' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 138,
      t('egg.reward', { lvl: cfg.level + 1, gems: cfg.gems ? t('egg.rewardGems', { n: cfg.gems }) : '' }),
      { fontFamily: FONT, fontSize: '22px', color: '#c9beee' }).setOrigin(0.5));

    // Полоса прогресса: видно, что ожидание конечно.
    const total = cfg.hours * 3_600_000;
    const done = Math.max(0.02, Math.min(1, 1 - left / total));
    const g = this.add.graphics();
    g.fillStyle(0x161028, 0.9); g.fillRoundedRect(W / 2 - 260, H / 2 - 96, 520, 26, 13);
    g.fillStyle(cfg.color, 1); g.fillRoundedRect(W / 2 - 257, H / 2 - 93, 514 * done, 20, 10);
    this.addTo(p, g);
    this.addTo(p, this.add.text(W / 2, H / 2 - 40, ready ? t('egg.ready') : t('egg.hatchIn', { time: this.fmtLeft(left) }),
      { fontFamily: FONT, fontSize: '30px', color: ready ? '#7fdc8f' : '#fff', fontStyle: '700' }).setOrigin(0.5));

    if (ready) {
      this.addTo(p, ui.button(this, W / 2, H / 2 + 60, 480, 84, t('egg.hatch'), 0x2e7d5b, () => {
        p.destroy(); this.hatchEgg();
      }, 30));
    } else {
      // Ускорение продаёт время, а не силу: подождать можно бесплатно.
      if (e.adsDay !== today()) { e.ads = 0; e.adsDay = today(); }
      const capped = e.ads >= INCUBATOR.adPerDay;
      this.addTo(p, ui.button(this, W / 2, H / 2 + 40, 500, 74,
        capped ? t('egg.adCap') : t('egg.ad', { n: INCUBATOR.adMinutes }), capped ? 0x3a3a55 : 0x2e7d5b, () => {
          if (capped) { failSound(); return; }
          sdk.showRewarded(() => {
            e.ads++;
            e.startedAt -= INCUBATOR.adMinutes * 60_000;
            coinSound(); track('egg_ad');
            this.tickEgg(); persist(true); p.destroy(); this.incubatorPanel();
          });
        }, 23));
      this.addTo(p, ui.button(this, W / 2, H / 2 + 140, 500, 70,
        t('egg.gem', { min: INCUBATOR.gemMinutes, cost: INCUBATOR.gemCost }), 0x8f5ad0, () => {
          if (S.gems < INCUBATOR.gemCost) { failSound(); ui.toast(this, W / 2, H / 2 + 140, t('common.notEnoughGems'), '#ff7070'); return; }
          S.gems -= INCUBATOR.gemCost;
          e.startedAt -= INCUBATOR.gemMinutes * 60_000;
          coinSound(); track('egg_gems');
          this.tickEgg(); this.refreshHud(); persist(true); p.destroy(); this.incubatorPanel();
        }, 23));
    }
    if (S.eggQueue.length)
      this.addTo(p, this.add.text(W / 2, H / 2 + 250, t('egg.queue', { n: S.eggQueue.length }),
        { fontFamily: FONT, fontSize: '22px', color: '#8f86b8' }).setOrigin(0.5));
  }

  // ---------- платформенные предложения: оценка, облако, ярлык ----------
  /**
   * Оценка влияет на ранжирование игры в каталоге, вход в аккаунт спасает прогресс
   * гостя, ярлык возвращает игрока в один тап. Всё это бесплатные проценты к
   * удержанию — но только если не надоедать: одно предложение за сессию, никогда
   * поверх открытого окна, и «Не сейчас» уважается неделю.
   *
   * `moment`: 'wow' — сразу после победного момента (легендарка, новая лига),
   * 'session' — спокойный вход в игру.
   */
  private async platformPrompt(moment: 'wow' | 'session') {
    if (GameScene.promptedThisSession || ui.panelsOpen() || !S.tips.income) return;
    const week = 7 * 86_400_000;
    if (moment === 'wow' && !S.reviewDone && Date.now() - S.reviewAsked > week && await sdk.canReview()) {
      S.reviewAsked = Date.now(); persist(true);
      this.askPanel('review', '⭐', async () => {
        const sent = await sdk.requestReview();
        if (sent) { S.reviewDone = true; persist(true); }
        return sent;
      });
      return;
    }
    // Гость с легендаркой уже реально рискует прогрессом — момент честный.
    if (moment === 'wow' && !sdk.isAuthorized() && Date.now() - S.authAsked > week) {
      S.authAsked = Date.now(); persist(true);
      this.askPanel('auth', '☁️', () => sdk.authorize());
      return;
    }
    if (S.daysPlayed >= 2 && !S.shortcutAsked && await sdk.canShortcut()) {
      S.shortcutAsked = true; persist(true);
      this.askPanel('shortcut', '📌', () => sdk.addShortcut());
    }
  }

  /** Окно предложения: заголовок/текст/кнопка из ключей `ask.<key>*`, отказ без последствий. */
  private askPanel(key: string, icon: string, run: () => Promise<boolean>) {
    GameScene.promptedThisSession = true;
    track(`ask_${key}`);
    const p = ui.panel(this, t(`ask.${key}Title`));
    this.addTo(p, this.add.text(W / 2, H / 2 - 290, icon, { fontSize: '110px' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 120, t(`ask.${key}Desc`),
      { fontFamily: FONT, fontSize: '27px', color: '#fff', align: 'center', lineSpacing: 8 }).setOrigin(0.5));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 80, 520, 78, t(`ask.${key}Yes`), 0x2e7d5b, async () => {
      p.destroy();
      if (!await run()) return;
      tada(); buzz(BUZZ.claim);
      ui.toast(this, W / 2, H / 2, t(`ask.${key}Done`));
      track(`ask_${key}_yes`);
    }, 26));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 185, 380, 62, t('ask.later'), 0x3a3a55, () => p.destroy(), 22));
  }

  // ---------- офлайн-доход ----------
  /** Уровень офлайна: бесплатный (50% за 2 ч) или купленный «склад» (100% за 5 ч). */
  private offlineTier() { return S.offlineVip ? INCOME.offlinePaid : INCOME.offlineFree; }

  private offlinePopup() {
    const tier = this.offlineTier();
    const away = (Date.now() - S.lastSeen) / 1000;
    const seconds = Math.min(away, tier.hours * 3600);
    const earned = Math.floor(S.incomeRate * tier.rate * (seconds * 1000 / INCOME.periodMs));
    if (earned < OFFLINE_MIN_COINS) return;
    const p = ui.panel(this, t('offline.title'));
    this.addTo(p, this.add.text(W / 2, H / 2 - 220, t('offline.desc', { n: earned }), { fontSize: '38px', color: '#fff', align: 'center' }).setOrigin(0.5));
    this.addTo(p, this.add.text(W / 2, H / 2 - 130,
      t('offline.tier', { hours: tier.hours, percent: Math.round(tier.rate * 100) }),
      { fontFamily: FONT, fontSize: '21px', color: '#c9beee', align: 'center' }).setOrigin(0.5));
    const claim = (mult: number) => { S.coins += earned * mult; coinSound(); this.refreshHud(); persist(); p.destroy(); };
    this.addTo(p, ui.button(this, W / 2, H / 2 - 30, 420, 72, t('offline.claim', { n: earned }), 0x5a48a8, () => claim(1)));
    this.addTo(p, ui.button(this, W / 2, H / 2 + 70, 480, 72, t('offline.claim2', { n: earned * 2 }), 0x2e7d5b,
      () => sdk.showRewarded(() => claim(2))));
    // Про «склад» говорим только когда время реально упёрлось в лимит: это честный
    // момент («ты потерял часы»), а не навязчивое предложение при каждом входе.
    if (!S.offlineVip && away > tier.hours * 3600 * 1.2)
      this.addTo(p, ui.button(this, W / 2, H / 2 + 190, 520, 66, t('offline.upsell', { hours: INCOME.offlinePaid.hours }), 0x8f5ad0,
        () => { p.destroy(); openShop(this, this.api); }, 20));
  }

  // ---------- FTUE: первое слияние — в первые 10 секунд (PLAN.md §15) ----------
  private startFtue() {
    this.spawnItem(0, 0, 2, 2);
    this.spawnItem(0, 0, 2, 3);
    this.hint = this.add.text(W / 2, GRID.y + 120, t('ftue.drag'), { fontSize: '26px', color: '#ffe066', fontStyle: 'bold', align: 'center', wordWrap: { width: 600 } }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: this.hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 500 });
  }

  // ---------- сейв ----------
  private persistBoard(force = false) {
    const items: number[][] = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const it = this.grid[r][c]; if (it) items.push([r, c, it.chain, it.level]);
    }
    S.itemsZ[S.zone] = items;
    S.incomeRate = this.totalIncome(false); // для офлайна — чистая ставка, без мутации дня
    persist(force);
  }
}

/** Короткая подпись награды дня: сундук, кристаллы или монеты. */
function rewardLabel(rw: { coins?: number; gems?: number; chest?: boolean }): string {
  return rw.chest ? '📦' : rw.gems ? `${rw.gems}💎` : `${rw.coins}🪙`;
}
