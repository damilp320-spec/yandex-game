// Симуляция баланса: прогон 14 игровых дней экономики + 1000 боёв арены.
// Запуск: npm run sim
//
// Считает по РЕАЛЬНЫМ константам из src/config.ts и правилам боя из src/arena.ts,
// поэтому цифры двигаются вместе с игрой: поменял конфиг — перезапустил sim.
//
// Модель поведения игрока (осознанные допущения, меняй здесь):
//   3 сессии в день × 7 минут = 21 активная минута, остальное — офлайн (кап 8 ч);
//   в активную минуту: 12 тиков дохода, TAPS_PER_MIN тапов со средним комбо,
//   бесплатное существо по кулдауну GEN.cooldownMs (одна кнопка, «умный» рандом),
//   покупка существ пока хватает монет с запасом, жадные слияния,
//   до 2 заказов в минуту (если на поле есть подходящее существо).
import { GRID, INCOME, spawnCostOf, PRICES, ZONES, GEN, ORDER_REWARD_BY_LEVEL, incomeOf } from '../src/config';
import { unitStats, unitPower, teamPower, upgradeCost, makeEnemy, simulateBattle, simulateBattleDetailed, cupsDelta, REMATCH_BUFF, BALANCE } from '../src/arena';
import { S } from '../src/state';

const DAYS = 14;
const SESSIONS_PER_DAY = 3;
const MINUTES_PER_SESSION = 7;
const TAPS_PER_MIN = 20;      // «спокойный» игрок, не автокликер
const AVG_COMBO = 2.5;        // тапы в пределах 1.2 с подряд, но не идеально
const ORDERS_PER_MIN = 2;
// Главное ограничение merge-игры: игрок физически успевает ~20 действий в минуту
// (перетаскивание, покупка, сдача заказа ≈ 3 с каждое). Без этого бюджета симуляция
// показывает недостижимый идеал: легендарку на первый день и монеты в миллионах.
const ACTIONS_PER_MIN = 20;
const CHAINS_OF_ZONE = ZONES[0].chains;
const MAX_LEVEL = 5;

interface Cell { chain: number; level: number }

class Sim {
  coins = 0;
  board: Cell[] = [];
  spawnBought = 0;
  merges = 0;
  orders = 0;
  rowUnlocked = false;
  taps = 0;

  get capacity() { return GRID.cols * (this.rowUnlocked ? GRID.rows : GRID.rows - 1); }
  get spawnCost() { return spawnCostOf(this.spawnBought); }
  /** Доход поля за один тик (5 с). */
  get income() { return this.board.reduce((s, c) => s + incomeOf(c.chain, c.level), 0); }
  /** Человеческий уровень лучшего существа (1..6); 0 — поле пустое. */
  get bestLevel() { return this.board.length ? this.board.reduce((m, c) => Math.max(m, c.level), 0) + 1 : 0; }

  /** Одна покупка; false — если нет места или монет. */
  buyOne(): boolean {
    if (this.board.length >= this.capacity || this.coins < this.spawnCost * 1.2) return false;
    this.coins -= this.spawnCost;
    this.spawnBought++;
    this.board.push({ chain: CHAINS_OF_ZONE[Math.floor(Math.random() * CHAINS_OF_ZONE.length)], level: 0 });
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
      const lonely = CHAINS_OF_ZONE.filter(ch =>
        this.board.filter(c => c.chain === ch && c.level === 0).length % 2 === 1);
      const ch = lonely.length && Math.random() < 0.7
        ? lonely[Math.floor(Math.random() * lonely.length)]
        : CHAINS_OF_ZONE[Math.floor(Math.random() * CHAINS_OF_ZONE.length)];
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

  /** Одна сдача заказа; false — если сдавать нечего. */
  deliverOne(): boolean {
    // Заказ на уровень 1..4. Разумный игрок отдаёт только «одиночку» — существо,
    // которому не хватает пары для слияния; иначе прогресс по уровням встал бы.
    const level = 1 + Math.floor(Math.random() * 4);
    const idx = this.board.findIndex((c, i) =>
      c.level === level && !this.board.some((o, j) => j !== i && o.chain === c.chain && o.level === c.level));
    if (idx < 0) return false;
    this.board.splice(idx, 1);
    this.coins += ORDER_REWARD_BY_LEVEL[level];
    this.orders++;
    return true;
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
    this.coins += this.income * (60_000 / INCOME.periodMs);
    this.tapMinute();
    this.collectFree(60);
    // Бюджет действий: сначала слияния (прогресс), потом заказы (монеты), потом покупки.
    let budget = ACTIONS_PER_MIN;
    let ordersLeft = ORDERS_PER_MIN;
    while (budget > 0) {
      if (this.mergeOne()) { budget--; continue; }
      if (ordersLeft > 0 && this.deliverOne()) { budget--; ordersLeft--; continue; }
      if (this.buyOne()) { budget--; continue; }
      break; // делать больше нечего — ждём генераторы/доход
    }
    if (!this.rowUnlocked && this.coins > PRICES.rowCoins * 3) { this.coins -= PRICES.rowCoins; this.rowUnlocked = true; }
  }

  offline(hours: number) {
    const capped = Math.min(hours, INCOME.offlineCapHours);
    this.coins += Math.floor(this.income * (capped * 3_600_000 / INCOME.periodMs));
  }
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

console.log('=== ЭКОНОМИКА: 14 дней ===');
console.log(`модель: ${SESSIONS_PER_DAY}×${MINUTES_PER_SESSION} мин/день, ${TAPS_PER_MIN} тапов/мин (комбо ${AVG_COMBO}), ${ORDERS_PER_MIN} заказа/мин\n`);
console.log('день | монеты | доход/тик | тапы/мин | цена | сек до покупки | ур | слияний | заказов');
const sim = new Sim();
// стартовые два существа как в FTUE
sim.board.push({ chain: 0, level: 0 }, { chain: 0, level: 0 });
const daily: { day: number; income: number; cost: number; tapShare: number }[] = [];
for (let day = 1; day <= DAYS; day++) {
  const beforeTaps = sim.taps;
  for (let s = 0; s < SESSIONS_PER_DAY; s++) {
    for (let m = 0; m < MINUTES_PER_SESSION; m++) sim.activeMinute();
    sim.offline(s < SESSIONS_PER_DAY - 1 ? 4 : 12); // между сессиями и ночь
  }
  const inc = sim.income;
  const perMin = inc * (60_000 / INCOME.periodMs);
  const tapPerMin = sim.board.length
    ? Math.ceil(Math.max(...sim.board.map(c => incomeOf(c.chain, c.level))) / 2) * AVG_COMBO * TAPS_PER_MIN
    : 0;
  const secToBuy = perMin > 0 ? (sim.spawnCost / (perMin / 60)).toFixed(1) : '∞';
  daily.push({ day, income: perMin, cost: sim.spawnCost, tapShare: tapPerMin / Math.max(1, perMin) });
  console.log([
    pad(day, 4), pad(fmt(sim.coins), 7), pad(fmt(inc), 10), pad(fmt(tapPerMin), 9),
    pad(fmt(sim.spawnCost), 5), pad(secToBuy, 15), pad(sim.bestLevel, 3), pad(sim.merges, 8), pad(sim.orders, 8),
  ].join(' |'));
  void beforeTaps;
}

const last = daily[daily.length - 1];
console.log('\nпроверки экономики:');
// Кнопка покупки жива, если существо стоит разумное время дохода ИЛИ если на руках
// накоплено достаточно монет (учитывать только доход в минуту — недостаточно).
const affordable = last.cost <= last.income * 10 || sim.coins > last.cost * 20;
console.log(`  • цена существа vs доход: ${affordable ? 'OK' : 'ПЛОХО'} ` +
  `(цена ${fmt(last.cost)}; доход ${fmt(last.income)}/мин; на руках ${fmt(sim.coins)})`);
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
const spread = archRates[0].wr - archRates[archRates.length - 1].wr;
console.log(`  разброс: ${spread.toFixed(1)} п.п. ${spread > 30 ? '— ПЛОХО: архетипы не сбалансированы' : '— OK'}`);
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
