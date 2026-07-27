// Симуляция баланса: прогон 14 игровых дней экономики + 1000 боёв арены.
// Запуск: npm run sim
//
// Считает по РЕАЛЬНЫМ константам из src/config.ts и правилам боя из src/arena.ts,
// поэтому цифры двигаются вместе с игрой: поменял конфиг — перезапустил sim.
//
// Модель поведения игрока (осознанные допущения, меняй здесь):
//   3 сессии в день × 7 минут = 21 активная минута, остальное — офлайн по
//   бесплатному уровню (INCOME.offlineFree: половина ставки за 2 часа);
//   в активную минуту: 12 тиков дохода, TAPS_PER_MIN тапов со средним комбо,
//   бесплатное существо по кулдауну GEN.cooldownMs (одна кнопка, «умный» рандом),
//   покупка существ пока хватает монет с запасом, жадные слияния,
//   продажа «одиночек» когда поле почти забито (заказов больше нет),
//   BATTLES_PER_SESSION боёв арены за сессию с ростом кубков, милстоунами и сундуками,
//   мутация дня (одна цепочка ×2 дохода) — считается от календарной даты дня прогона,
//   инкубатор: яйцо за каждую INCUBATOR.winEvery-ю победу и за новую лигу, вылупление
//   по расписанию (в том числе пока игрок офлайн) — это новый кран существ,
//   прокачка казармы, когда монет втрое больше цены — это главный слив монет.
import { GRID, INCOME, spawnCostOf, PRICES, ZONES, GEN, sellPrice, leagueOf, incomeOf, EGGS, EggType, INCUBATOR, MUTATION_MULT, mutationChain } from '../src/config';
import { unitStats, unitPower, teamPower, upgradeCost, makeEnemy, simulateBattle, simulateBattleDetailed, cupsDelta, REMATCH_BUFF, BALANCE, ARENA_MILESTONES } from '../src/arena';
import { S } from '../src/state';

/**
 * Детерминированный ГПСЧ (mulberry32) вместо Math.random: один и тот же конфиг
 * должен давать один и тот же отчёт. Без этого шум между прогонами путают с
 * эффектом правки — «легендарка на 1-й день» и «на 4-й» встречались при одинаковом
 * балансе. Поменял SEED — получил другую, но столь же воспроизводимую партию.
 */
const SEED = 20260726;
let rngState = SEED;
Math.random = () => {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const DAYS = 14;
const SESSIONS_PER_DAY = 3;
const MINUTES_PER_SESSION = 7;
const TAPS_PER_MIN = 20;      // «спокойный» игрок, не автокликер
const AVG_COMBO = 2.5;        // тапы в пределах 1.2 с подряд, но не идеально
const BATTLES_PER_SESSION = 4;
// Главное ограничение merge-игры: игрок физически успевает ~20 действий в минуту
// (перетаскивание, покупка, сдача заказа ≈ 3 с каждое). Без этого бюджета симуляция
// показывает недостижимый идеал: легендарку на первый день и монеты в миллионах.
const ACTIONS_PER_MIN = 20;

const MAX_LEVEL = 5;

interface Cell { chain: number; level: number }

class Sim {
  coins = 0;
  zone = 0;   // у каждой локации своё поле, доход идёт только с текущей
  board: Cell[] = [];
  spawnBought = 0;
  merges = 0;
  sold = 0;
  rowUnlocked = false;
  taps = 0;
  team: Cell[] = [];
  cups = 0;
  battles = 0;
  wins = 0;
  barracks = 0;
  claimed: boolean[] = ARENA_MILESTONES.map(() => false);
  // Инкубатор: часы идут и в офлайне, поэтому нужен модельный «сейчас» в минутах.
  now = 0;
  mutChain = -1;   // цепочка дня: её доход ×MUTATION_MULT (в офлайн не входит)
  egg: { type: EggType; due: number } | null = null;
  eggQueue: EggType[] = [];
  eggsHatched = 0;
  eggCreatures = 0;   // сколько существ реально попало на поле из яиц
  eggCoins = 0;       // и сколько монет вместо них, когда поле было забито

  get chains() { return ZONES[this.zone].chains; }

  get capacity() { return GRID.cols * (this.rowUnlocked ? GRID.rows : GRID.rows - 1); }
  get spawnCost() { return spawnCostOf(this.spawnBought, this.income * (60_000 / INCOME.periodMs)); }
  /** Доход поля за один тик (5 с) с учётом мутации дня. */
  get income() {
    return this.board.reduce((s, c) => s + incomeOf(c.chain, c.level) * (c.chain === this.mutChain ? MUTATION_MULT : 1), 0);
  }
  /** Чистая ставка без мутации — именно её игра пишет в офлайн-доход. */
  get incomeClean() { return this.board.reduce((s, c) => s + incomeOf(c.chain, c.level), 0); }
  /** Человеческий уровень лучшего существа (1..6); 0 — поле пустое. */
  get bestLevel() { return this.board.length ? this.board.reduce((m, c) => Math.max(m, c.level), 0) + 1 : 0; }

  /** Одна покупка; false — если нет места или монет. */
  buyOne(): boolean {
    if (this.board.length >= this.capacity || this.coins < this.spawnCost * 1.2) return false;
    this.coins -= this.spawnCost;
    this.spawnBought++;
    this.board.push({ chain: this.chains[Math.floor(Math.random() * this.chains.length)], level: 0 });
    return true;
  }

  /**
   * Бесплатное существо по кулдауну — «двигатель» поля. Раньше это были четыре
   * генератора по цепочкам, теперь одна кнопка со случайной цепочкой и поддавками:
   * если на поле есть «одиночка» первого уровня, в 70% случаев выдаётся его пара.
   */
  private freeProgress = 0;
  collectFree(seconds: number) {
    this.freeProgress += seconds / (GEN.cooldownMs / 1000);
    while (this.freeProgress >= 1) {
      this.freeProgress -= 1;
      if (this.board.length >= this.capacity) break;
      const lonely = this.chains.filter(ch =>
        this.board.filter(c => c.chain === ch && c.level === 0).length % 2 === 1);
      const ch = lonely.length && Math.random() < 0.7
        ? lonely[Math.floor(Math.random() * lonely.length)]
        : this.chains[Math.floor(Math.random() * this.chains.length)];
      this.board.push({ chain: ch, level: 0 });
    }
  }

  /** Одно слияние (самая высокая доступная пара — так играет разумный игрок). */
  mergeOne(): boolean {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < this.board.length; i++)
      for (let j = i + 1; j < this.board.length; j++) {
        const a = this.board[i], b = this.board[j];
        if (a.chain === b.chain && a.level === b.level && a.level < MAX_LEVEL && a.level > best) {
          best = a.level; bi = i; bj = j;
        }
      }
    if (bi < 0) return false;
    this.board.splice(bj, 1);
    this.board[bi].level++;
    this.merges++;
    return true;
  }

  /**
   * Продажа: игрок избавляется от «одиночки» — существа без пары для слияния, —
   * и только когда место кончается. Держать выгоднее (доход вечен), поэтому продажа
   * это способ освободить клетку, а не основной заработок.
   */
  sellOne(): boolean {
    if (this.board.length < this.capacity - 1) return false;
    let idx = -1, worst = Infinity;
    this.board.forEach((c, i) => {
      const lonely = !this.board.some((o, j) => j !== i && o.chain === c.chain && o.level === c.level);
      const inc = incomeOf(c.chain, c.level);
      if (lonely && inc < worst) { worst = inc; idx = i; }
    });
    if (idx < 0) return false;
    const [sold] = this.board.splice(idx, 1);
    this.coins += sellPrice(sold.chain, sold.level);
    this.sold++;
    return true;
  }

  /** Забрать пятёрку лучших с поля в команду арены — как игрок делает это один раз. */
  draftTeam() {
    while (this.team.length < 5 && this.board.length > 6) {
      let bi = 0;
      for (let i = 1; i < this.board.length; i++) if (this.board[i].level > this.board[bi].level) bi = i;
      this.team.push(this.board.splice(bi, 1)[0]);
    }
  }

  /** Бои арены: кубки, лига, милстоуны и сундуки за них. */
  fightBattles(n: number) {
    this.draftTeam();
    if (this.team.length < 3) return;
    S.team = this.team.map(c => [c.chain, c.level]);
    S.upgrades = { atk: this.barracks, hp: this.barracks };
    for (let i = 0; i < n; i++) {
      S.cups = this.cups;
      const en = makeEnemy();
      const power = teamPower(en.team, false) * en.factor;
      const win = simulateBattle(S.team, en.team, 1, en.factor);
      if (win) { this.coins += 150 + Math.floor(power / 5); this.wins++; }
      if (win && this.wins % INCUBATOR.winEvery === 0) this.giveEgg('common');
      const leagueBefore = leagueOf(this.cups);
      this.cups = Math.max(0, this.cups + cupsDelta(win, power));
      if (leagueOf(this.cups).cups > leagueBefore.cups) this.giveEgg('rare');
      this.battles++;
      ARENA_MILESTONES.forEach((m, idx) => {
        if (this.claimed[idx] || this.cups < m.cups) return;
        this.claimed[idx] = true;
        this.coins += m.coins ?? 0;
        if (m.chest && this.board.length < this.capacity) {
          const r = Math.random(); // уровни как в rollChest (src/shop.ts)
          this.board.push({
            chain: this.chains[Math.floor(Math.random() * this.chains.length)],
            level: r < 0.2 ? 4 : r < 0.55 ? 3 : 2,
          });
        }
      });
    }
    // Казарма — главный слив монет: качаем, пока есть тройной запас.
    while (this.coins > upgradeCost(this.barracks) * 6) {
      this.coins -= upgradeCost(this.barracks) * 2; // обе ветки
      this.barracks++;
    }
  }

  giveEgg(type: EggType) {
    if (!this.egg) this.egg = { type, due: this.now + EGGS[type].hours * 60 };
    else if (this.eggQueue.length < INCUBATOR.queueMax) this.eggQueue.push(type);
    // Очередь полна — в игре награда превращается в кристаллы; на монеты не влияет.
  }

  /**
   * Ход времени: яйца вылупляются и в офлайне (иначе крючок наказывал бы за сон).
   * Ускорения рекламой/кристаллами не моделируем — считаем «ленивого» игрока.
   */
  tickClock(minutes: number) {
    this.now += minutes;
    while (this.egg && this.now >= this.egg.due) {
      const cfg = EGGS[this.egg.type];
      this.eggsHatched++;
      if (this.board.length < this.capacity) {
        this.board.push({ chain: this.chains[Math.floor(Math.random() * this.chains.length)], level: cfg.level });
        this.eggCreatures++;
      } else {
        this.coins += 200 * (cfg.level + 1);
        this.eggCoins += 200 * (cfg.level + 1);
      }
      const next = this.eggQueue.shift();
      this.egg = next ? { type: next, due: this.now + EGGS[next].hours * 60 } : null;
    }
  }

  tapMinute() {
    // Игрок тапает самое доходное существо: gain = ceil(income/2) × комбо.
    if (!this.board.length) return;
    const best = this.board.reduce((a, b) => (incomeOf(a.chain, a.level) > incomeOf(b.chain, b.level) ? a : b));
    const per = Math.ceil(incomeOf(best.chain, best.level) / 2) * AVG_COMBO;
    this.coins += Math.round(per * TAPS_PER_MIN);
    this.taps += TAPS_PER_MIN;
  }

  activeMinute() {
    this.tickClock(1);
    this.coins += this.income * (60_000 / INCOME.periodMs);
    this.tapMinute();
    this.collectFree(60);
    // Бюджет действий: сначала слияния (прогресс), потом покупки, потом продажа
    // лишнего, если место кончилось.
    let budget = ACTIONS_PER_MIN;
    while (budget > 0) {
      if (this.mergeOne()) { budget--; continue; }
      if (this.buyOne()) { budget--; continue; }
      if (this.sellOne()) { budget--; continue; }
      break; // делать больше нечего — ждём бесплатное существо/доход
    }
    if (!this.rowUnlocked && this.coins > PRICES.rowCoins * 3) { this.coins -= PRICES.rowCoins; this.rowUnlocked = true; }
  }

  /**
   * Насыщение: сливать больше нечего (поле забито максимальным уровнем). В игре это
   * означает «зона пройдена» — дальше открывают следующую, где доход выше, но поле
   * пустое и всё начинается заново. Доход считается только с текущей локации.
   */
  get saturated() {
    // «Зона пройдена» = большая часть поля занята максимальным уровнем. Прежний
    // критерий (поле забито И сливать нечего) ломался о продажи: после каждой
    // продажи в поле появлялась дырка, и проверка не срабатывала никогда.
    return this.board.filter(c => c.level === MAX_LEVEL).length >= Math.floor(this.capacity * 0.6);
  }
  canMerge() {
    for (let i = 0; i < this.board.length; i++)
      for (let j = i + 1; j < this.board.length; j++) {
        const a = this.board[i], b = this.board[j];
        if (a.chain === b.chain && a.level === b.level && a.level < MAX_LEVEL) return true;
      }
    return false;
  }
  maybeNextZone(day: number): number | null {
    if (this.zone >= ZONES.length - 1 || !this.saturated) return null;
    const z = ZONES[this.zone + 1];
    if (this.coins < z.unlockCoins) return null;
    this.coins -= z.unlockCoins;
    this.zone++;
    this.board = [];        // новая локация — новое поле
    this.spawnBought = 0;   // цена существ считается заново
    return day;
  }

  offline(hours: number) {
    // Считаем по бесплатному уровню: баланс проверяем на неплатящем игроке.
    const tier = INCOME.offlineFree;
    const capped = Math.min(hours, tier.hours);
    this.coins += Math.floor(this.incomeClean * tier.rate * (capped * 3_600_000 / INCOME.periodMs));
    this.tickClock(hours * 60); // яйца ждать не перестают

  }
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

console.log('=== ЭКОНОМИКА: 14 дней ===');
console.log(`модель: ${SESSIONS_PER_DAY}×${MINUTES_PER_SESSION} мин/день, ${TAPS_PER_MIN} тапов/мин ` +
  `(комбо ${AVG_COMBO}), ${BATTLES_PER_SESSION} боя за сессию\n`);
console.log('день | монеты | доход/тик | цена | ур | слияний | продано | кубки | лига | казарма | зона');
const sim = new Sim();
// стартовые два существа как в FTUE
sim.board.push({ chain: 0, level: 0 }, { chain: 0, level: 0 });
const daily: { day: number; income: number; cost: number; tapShare: number }[] = [];
let legendaryDay = 0;
let mutDays = 0; // сколько дней из DAYS мутация попала в текущую локацию игрока
const zoneDays: string[] = []; // день, когда впервые появилось существо 6-го уровня
for (let day = 1; day <= DAYS; day++) {
  const beforeTaps = sim.taps;
  // Календарная дата нужна, чтобы мутация дня менялась так же, как в игре.
  sim.mutChain = mutationChain(new Date(Date.UTC(2026, 6, day)).toISOString().slice(0, 10));
  if (ZONES[sim.zone].chains.includes(sim.mutChain)) mutDays++;
  for (let s = 0; s < SESSIONS_PER_DAY; s++) {
    for (let m = 0; m < MINUTES_PER_SESSION; m++) sim.activeMinute();
    sim.fightBattles(BATTLES_PER_SESSION);
    const moved = sim.maybeNextZone(day);
    if (moved !== null) zoneDays.push(`${ZONES[sim.zone].id}: день ${moved}`);
    sim.offline(s < SESSIONS_PER_DAY - 1 ? 4 : 12); // между сессиями и ночь
  }
  if (!legendaryDay && sim.bestLevel >= 6) legendaryDay = day;
  const inc = sim.income;
  const perMin = inc * (60_000 / INCOME.periodMs);
  const tapPerMin = sim.board.length
    ? Math.ceil(Math.max(...sim.board.map(c => incomeOf(c.chain, c.level))) / 2) * AVG_COMBO * TAPS_PER_MIN
    : 0;
  const secToBuy = perMin > 0 ? (sim.spawnCost / (perMin / 60)).toFixed(1) : '∞';
  daily.push({ day, income: perMin, cost: sim.spawnCost, tapShare: tapPerMin / Math.max(1, perMin) });
  console.log([
    pad(day, 4), pad(fmt(sim.coins), 7), pad(fmt(inc), 10), pad(fmt(sim.spawnCost), 5),
    pad(sim.bestLevel, 3), pad(sim.merges, 8), pad(sim.sold, 8), pad(sim.cups, 6),
    pad(leagueOf(sim.cups).key, 9), pad(sim.barracks, 8), pad(ZONES[sim.zone].id, 6),
  ].join(' |'));
  void secToBuy;
  void beforeTaps;
}

const last = daily[daily.length - 1];
console.log('\nпроверки экономики:');
// Кнопка покупки жива, если существо стоит разумное время дохода ИЛИ если на руках
// накоплено достаточно монет (учитывать только доход в минуту — недостаточно).
const affordable = last.cost <= last.income * 10 || sim.coins > last.cost * 20;
console.log(`  • цена существа vs доход: ${affordable ? 'OK' : 'ПЛОХО'} ` +
  `(цена ${fmt(last.cost)}; доход ${fmt(last.income)}/мин; на руках ${fmt(sim.coins)})`);
console.log(`  • первая легендарка (6 ур.): ${legendaryDay ? `день ${legendaryDay}` : 'не достигнута за 14 дней'}`);
console.log(`  • переходы по локациям: ${zoneDays.length ? zoneDays.join(', ') : 'ни одной новой за 14 дней — проверь цены разблокировки'}`);
console.log(`  • мутация дня попадала в локацию игрока ${mutDays} из ${DAYS} дней ` +
  `(в такие дни доход ×${MUTATION_MULT} у одной цепочки)`);
console.log(`  • инкубатор: ${sim.eggsHatched} яиц за ${DAYS} дн. — ${sim.eggCreatures} существ на поле, ` +
  `${fmt(sim.eggCoins)}🪙 компенсации (поле было забито)`);
console.log(`  • вклад тапов vs пассив: ×${last.tapShare.toFixed(1)} ` +
  `${last.tapShare > 5 ? '— ПЛОХО: тапы обесценивают пассивный доход и офлайн' : '— OK'}`);

// ---------- БОИ ----------
const N = 1000;
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const randomTeam = (lvMin: number, lvMax: number) =>
  Array.from({ length: 5 }, () => [Math.floor(Math.random() * 12), lvMin + Math.floor(Math.random() * (lvMax - lvMin + 1))]);

console.log('\n=== БОИ: 1000 симуляций на каждый сценарий ===');
const rate = (f: () => boolean, n = N) => {
  let w = 0;
  for (let i = 0; i < n; i++) if (f()) w++;
  return (100 * w) / n;
};

S.upgrades = { atk: 0, hp: 0 };
const mirror = randomTeam(2, 4);
console.log(`зеркальный бой (одинаковые составы):        ${rate(() => simulateBattle(mirror, mirror)).toFixed(1)}% ` +
  '(норма 45–55%)');

let sumRate = 0;
for (let k = 0; k < 10; k++) {
  const team = randomTeam(1, 5);
  sumRate += rate(() => simulateBattle(team, team), 100);
}
console.log(`зеркальный бой, 10 случайных составов:      ${(sumRate / 10).toFixed(1)}%`);

// Против штатного матчмейкинга (makeEnemy читает S.team и S.cups).
// Кубки — рейтинг, поэтому winrate зависит от того, где игрок на лестнице:
// на старте (0 кубков) он должен уверенно выигрывать, на своём плато — около 50%.
const team = randomTeam(2, 4);
S.team = team;
const vsMatchmaker = () => {
  const en = makeEnemy();
  return simulateBattle(S.team, en.team, 1, en.factor);
};
S.cups = 0;
console.log(`первые бои (0 кубков, онбординг):           ${rate(vsMatchmaker).toFixed(1)}% (норма 70–85%)`);
S.cups = 600;
console.log(`600 кубков без прокачки (выше своего плато): ${rate(vsMatchmaker).toFixed(1)}% — здесь игрок ДОЛЖЕН`);
console.log('                                            проигрывать: лестница вернёт его на плато');
console.log(`с рекламным бустом (реванш, 600 кубков):    ${rate(() => {
  const en = makeEnemy();
  return simulateBattle(S.team, en.team, REMATCH_BUFF, en.factor);
}).toFixed(1)}% (норма 60–80%: помогает, но не гарантия)`);

// ---------- КАЗАРМА ----------
// Кубки — рейтинг: сложность растёт вместе с ними, поэтому winrate при фиксированных
// кубках ничего не говорит. Меряем ПЛАТО: до каких кубков доходит игрок за 300 боёв.
console.log('\n=== КАЗАРМА: окупается ли прокачка (плато кубков за 300 боёв) ===');
console.log('ур | цена уровня | всего вложено | плато кубков | winrate на плато | сила команды');
const ladderPlateau = (battlesCount = 300) => {
  S.cups = 0;
  let wins = 0, lastWins = 0, lastCount = 0;
  for (let i = 0; i < battlesCount; i++) {
    const en = makeEnemy();
    const win = simulateBattle(S.team, en.team, 1, en.factor);
    if (win) wins++;
    if (i >= battlesCount - 100) { lastCount++; if (win) lastWins++; } // winrate на последних 100
    S.cups = Math.max(0, S.cups + cupsDelta(win, teamPower(en.team, false) * en.factor));
  }
  void wins;
  return { cups: S.cups, wr: (100 * lastWins) / Math.max(1, lastCount) };
};
for (const lv of [0, 3, 6, 10, 15]) {
  S.upgrades = { atk: lv, hp: lv };
  let spent = 0;
  for (let i = 0; i < lv; i++) spent += upgradeCost(i) * 2; // обе ветки
  const { cups, wr } = ladderPlateau();
  console.log([pad(lv, 2), pad(fmt(upgradeCost(lv)), 12), pad(fmt(spent), 14), pad(`${cups}🏆`, 13),
    pad(`${wr.toFixed(0)}%`, 17), pad(fmt(teamPower(S.team)), 13)].join(' |'));
}

// ---------- КАЛИБРОВКА typeValue бисекцией ----------
// Подбирать ценность типов руками бессмысленно: система резко нелинейна, поправки
// «на глаз» давали качели 1% ↔ 100%. Здесь бисекция сама ищет typeValue, при которых
// моно-состав каждого типа играет с эталоном (sniper) вровень. Замер симметричный:
// сторона 0 бьёт первой при равных таймингах, поэтому усредняем оба направления.
console.log('\n=== КАЛИБРОВКА typeValue (бисекция до паритета со sniper) ===');
S.upgrades = { atk: 0, hp: 0 };
const TYPES = ['melee', 'sniper', 'splash'] as const;
const byType: Record<string, number[]> = { melee: [], sniper: [], splash: [] };
for (let ch = 0; ch < 12; ch++) byType[unitStats(ch, 3, false).type].push(ch);
const monoOf = (ch: number) => Array.from({ length: 5 }, () => [ch, 3]);

/** Симметричный winrate моно-состава A против моно-состава B. */
const duel = (ca: number, cb: number, n = 120) => {
  const fwd = rate(() => simulateBattle(monoOf(ca), monoOf(cb)), n);
  const bwd = rate(() => simulateBattle(monoOf(cb), monoOf(ca)), n);
  return (fwd + (100 - bwd)) / 2;
};
/** Средний winrate типа против эталонных снайперов. */
const vsRef = (tp: typeof TYPES[number]) => {
  let sum = 0, n = 0;
  for (const ca of byType[tp]) for (const cb of byType.sniper) {
    if (ca === cb) continue;
    sum += duel(ca, cb, 120); n++;
  }
  return sum / Math.max(1, n);
};
for (const tp of ['melee', 'splash'] as const) {
  let lo = 0.4, hi = 4.0;
  for (let it = 0; it < 11; it++) {
    const mid = (lo + hi) / 2;
    BALANCE.typeValue[tp] = mid;
    // Больше typeValue → меньше урона по формуле archDmg → тип слабее.
    if (vsRef(tp) > 50) lo = mid; else hi = mid;
  }
  BALANCE.typeValue[tp] = (lo + hi) / 2;
  const check = (vsRef(tp) + vsRef(tp)) / 2; // контрольный замер по двум прогонам
  console.log(`  ${pad(tp, 7)}: typeValue = ${BALANCE.typeValue[tp].toFixed(2)} (контрольный winrate против sniper ${check.toFixed(0)}%)`);
}
console.log(`  → впиши в BALANCE.typeValue: { melee: ${BALANCE.typeValue.melee.toFixed(2)}, sniper: 1, splash: ${BALANCE.typeValue.splash.toFixed(2)} }`);

// ---------- АРХЕТИПЫ: не доминирует ли одна цепочка ----------
// Замер симметричный и против ОДНОГО эталона (цепочка 0): сравнение со «случайным
// смешанным» составом мерило плохое — моно-состав всегда сильнее смеси, потому что
// пять одинаковых бойцов фокусируют урон согласованно, а смесь его распыляет.
// Это свойство стратегии (собрать команду одного типа), а не дисбаланс цепочек.
console.log('\n=== АРХЕТИПЫ: моно-состав против эталонного (цепочка 0), уровень 3 ===');
S.upgrades = { atk: 0, hp: 0 };
const REF = 0;
const archRates: { chain: number; wr: number }[] = [];
for (let ch = 0; ch < 12; ch++) {
  if (ch === REF) continue;
  archRates.push({ chain: ch, wr: duel(ch, REF, 150) });
}
archRates.sort((a, b) => b.wr - a.wr).forEach(({ chain, wr }) => {
  const st = unitStats(chain, 3, false);
  console.log(`  цепочка ${pad(chain, 2)} (${st.type.padEnd(6)}, ⚔${pad(st.dmg, 4)} ❤${pad(st.hp, 5)} ${st.spd}мс): ${wr.toFixed(1)}%`);
});
// Разброс winrate — ПЛОХОЙ измеритель баланса в этом формате: снежный ком (убил
// бойца → урон врага упал на 20%) раздувает разницу в силе 5% до счёта 5:95.
// Настоящая мера — множитель силы из блока КАЛИБРОВКА ЦЕПОЧЕК ниже.
const spread = archRates[0].wr - archRates[archRates.length - 1].wr;
console.log(`  разброс winrate: ${spread.toFixed(1)} п.п. — сам по себе ни о чём не говорит,`);
console.log('  смотри «КАЛИБРОВКА ЦЕПОЧЕК»: там разница в силе, а не усиленная снежным комом');
// Диагностика: длительность боя и доля таймаутов. Если бои упираются в лимит,
// исход решает правило «у кого больше выживших», а не сила составов.
{
  let ms = 0, timeouts = 0, n = 0;
  for (let ch = 0; ch < 12; ch++) for (let cb = 0; cb < 12; cb++) {
    const r = simulateBattleDetailed(monoOf(ch), monoOf(cb));
    ms += r.ms; timeouts += r.timeout ? 1 : 0; n++;
  }
  console.log(`  длительность боя: в среднем ${(ms / n / 1000).toFixed(1)} с, таймаутов ${((100 * timeouts) / n).toFixed(0)}% ` +
    `${timeouts / n > 0.1 ? '— ПЛОХО: исход решает правило таймаута' : '(цель 20–30 с)'}`);
}
console.log(`  (моно-состав против случайной смеси: ${rate(() => simulateBattle(Array.from({ length: 5 }, () => [REF, 3]), randomTeam(3, 3)), 300).toFixed(0)}% — ` +
  'превосходство фокуса над смесью, так и задумано)');

// ---------- КАЛИБРОВКА ЦЕПОЧЕК: сколько на самом деле стоит каждая ----------
// Для каждой цепочки бисекцией ищем множитель силы f, при котором её моно-состав
// играет вровень с эталонной цепочкой, усиленной в f раз. Это и есть настоящая
// относительная сила цепочки — её и надо подставить в оценку для матчмейкинга,
// чтобы слабый состав получал соперников по себе.
console.log('\n=== КАЛИБРОВКА ЦЕПОЧЕК (относительно цепочки 0) ===');
S.upgrades = { atk: 0, hp: 0 };
const chainValues: number[] = [];
for (let ch = 0; ch < 12; ch++) {
  if (ch === REF) { chainValues.push(1); continue; }
  let lo = 0.25, hi = 4;
  for (let it = 0; it < 10; it++) {
    const mid = (lo + hi) / 2;
    // моно-состав цепочки против эталона, усиленного в mid раз (симметрично)
    const fwd = rate(() => simulateBattle(monoOf(ch), monoOf(REF), 1, mid), 60);
    const bwd = rate(() => simulateBattle(monoOf(REF), monoOf(ch), mid, 1), 60);
    const wr = (fwd + (100 - bwd)) / 2;
    if (wr > 50) lo = mid; else hi = mid; // выстоял против более сильного — цепочка дороже
  }
  chainValues.push(Math.round(((lo + hi) / 2) * 100) / 100);
}
chainValues.forEach((v, ch) => {
  const st = unitStats(ch, 3, false);
  console.log(`  цепочка ${pad(ch, 2)} (${st.type.padEnd(6)}): ×${v.toFixed(2)}`);
});
console.log(`  → впиши в BALANCE.chainValue: [${chainValues.map(v => v.toFixed(2)).join(', ')}]`);
const cvSpread = Math.max(...chainValues) / Math.min(...chainValues);
console.log(`  разница между сильнейшей и слабейшей цепочкой: ×${cvSpread.toFixed(2)} ` +
  `${cvSpread > 1.35 ? '— ПЛОХО: перекос по цепочкам' : '— OK (цель ≤ ×1.35)'}`);

// ---------- СВИП: ищем гранулярность боя (SIM_SWEEP=1 npm run sim) ----------
// Гипотеза: чем больше ударов уходит на убийство, тем меньше исход зависит от
// целочисленных порогов, и тем ближе winrate к разнице в силе. Для честного
// сравнения на каждом шаге заново калибруем typeValue бисекцией.
if (process.env.SIM_SWEEP) {
  console.log('\n=== СВИП: масштаб периода атаки vs разброс силы цепочек ===');
  console.log('spdScale | ударов на убийство | разброс цепочек | длительность боя | зеркальный бой');
  const REF2 = 0;
  for (const scale of [1, 0.62, 0.45, 0.3]) {
    BALANCE.spdScale = scale;
    // перекалибровка typeValue под новую гранулярность
    for (const tp of ['melee', 'splash'] as const) {
      let lo = 0.4, hi = 4.0;
      for (let it = 0; it < 10; it++) {
        const mid = (lo + hi) / 2;
        BALANCE.typeValue[tp] = mid;
        if (vsRef(tp) > 50) lo = mid; else hi = mid;
      }
      BALANCE.typeValue[tp] = (lo + hi) / 2;
    }
    const rates = [];
    for (let ch = 0; ch < 12; ch++) if (ch !== REF2) rates.push(duel(ch, REF2, 120));
    const spread = Math.max(...rates) - Math.min(...rates);
    const st = unitStats(REF2, 3, false);
    const hitsToKill = st.hp / Math.max(1, st.dmg);
    let ms = 0, n = 0;
    for (let ch = 0; ch < 12; ch++) { ms += simulateBattleDetailed(monoOf(ch), monoOf(REF2)).ms; n++; }
    console.log([pad(scale.toFixed(2), 8), pad(hitsToKill.toFixed(1), 19), pad(`${spread.toFixed(0)} п.п.`, 16),
      pad(`${(ms / n / 1000).toFixed(1)} с`, 17), pad(`${rate(() => simulateBattle(mirror, mirror), 400).toFixed(0)}%`, 15)].join(' |'));
  }
  BALANCE.spdScale = 1;
}

// ---------- КУБКИ: скорость роста ----------
console.log('\n=== КУБКИ: сколько боёв до милстоунов ===');
S.upgrades = { atk: 0, hp: 0 };
S.cups = 0;
let battles = 0;
const marks = [100, 300, 600, 1000];
const hit: Record<number, number> = {};
while (battles < 400 && marks.some(m => !hit[m])) {
  battles++;
  const en = makeEnemy();
  const win = simulateBattle(S.team, en.team, 1, en.factor);
  S.cups = Math.max(0, S.cups + cupsDelta(win, teamPower(en.team, false) * en.factor));
  for (const m of marks) if (!hit[m] && S.cups >= m) hit[m] = battles;
}
marks.forEach(m => console.log(`  ${pad(m, 4)}🏆: ${hit[m] ? `${hit[m]} боёв` : 'не достигнуто за 400 боёв'}`));
void unitPower;
