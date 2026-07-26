// Арена: боевые характеристики, генерация противников под кубки игрока,
// милстоуны наград. Соперники — симуляция (правдоподобные ники, сила ±15%),
// поэтому «оффлайн противника» не существует как проблема.
import { CHAINS } from './config';
import { S } from './state';
import { nicks } from './i18n';

export type AttackType = 'melee' | 'sniper' | 'splash';

// Архетип цепочки: множители HP/урона, скорость атаки (мс), тип атаки.
/**
 * Архетипы цепочек: живучесть, ритм и тип атаки. Урон НЕ задаётся руками — он
 * вычисляется из условия равной силы (см. archDmg), поэтому цепочки различаются
 * характером (танк / стеклянная пушка / площадь, редкие тяжёлые удары против частых
 * слабых), но не силой. `flavor` — сознательное отклонение: секретная «67» на 15%
 * сильнее, она награда за 6,7% из сундука.
 */
// Диапазон скорости атаки сознательно узкий (1000–1400 мс вместо 900–1800): при
// двукратном разбросе залпы пятёрок расходились по фазе, и цепочки с одинаковой
// расчётной силой давали 100% и 1% побед. Ритм как флейвор сохранён — акула бьёт
// заметно чаще крокодила, — но исход боя определяется силой, а не совпадением фаз.
const ARCH: { hp: number; spd: number; type: AttackType; flavor?: number }[] = [
  { hp: 1.0, spd: 1250, type: 'sniper' },  // coffee — балерина бьёт точно
  { hp: 1.1, spd: 1400, type: 'splash' },  // croc — редкая тяжёлая бомбардировка
  { hp: 1.0, spd: 1000, type: 'melee' },   // shark — частые быстрые укусы
  { hp: 1.2, spd: 1300, type: 'splash' },  // drum — ударная волна
  { hp: 0.9, spd: 1050, type: 'sniper' },  // cat — скретч по больному
  { hp: 1.35, spd: 1250, type: 'melee' },  // robot — танк
  { hp: 0.95, spd: 1200, type: 'sniper' }, // fruit — меткий флирт
  { hp: 1.25, spd: 1350, type: 'melee' },  // stick — медленная, но БИТА
  { hp: 1.0, spd: 1150, type: 'splash', flavor: 1.15 }, // sixseven — мем-урон всем
  { hp: 1.45, spd: 1300, type: 'melee' },  // capy — жирный чилл-танк
  { hp: 0.85, spd: 1100, type: 'sniper' }, // ufo — луч по самому раненому
  { hp: 1.05, spd: 1200, type: 'splash' }, // noodle — паста во все стороны
];

/**
 * Живучесть входит в силу с убывающей отдачей (hp^0.8): запас прочности у бойца со
 * слабым уроном лишь продлевает его смерть, а бой решает то, кто убивает первым.
 * По измерениям линейный учёт HP переоценивал танков — они проигрывали 5–25%.
 */
const HP_EXP = 0.8;

/** Урон архетипа из условия hp^0.8 × (dmg/spd) × typeValue = const. */
const archDmg = (a: typeof ARCH[number]) =>
  (BALANCE.dmgConst * (a.spd / 1000) * (a.flavor ?? 1)) / (Math.pow(a.hp, HP_EXP) * BALANCE.typeValue[a.type]);

export interface UnitStats { hp: number; dmg: number; spd: number; type: AttackType }

/**
 * Балансовые коэффициенты боя. Меняются калибровкой `npm run sim`, которая
 * бисекцией ищет typeValue: подбирать эти числа вручную бесполезно — система резко
 * нелинейна (перевес в силе 15% превращается в 85% побед), и «на глаз» получались
 * перекосы от 1% до 100% побед у отдельных типов.
 *
 * splashMult — доля урона каждому из пяти при атаке по площади;
 * meleeMult  — надбавка melee за отсутствие выбора цели (бьёт первого по строю);
 * typeValue  — боевая ценность типа при равном DPS. Используется дважды: как вес в
 *   оценке силы (матчмейкинг) и как делитель при расчёте урона цепочки, поэтому
 *   цепочки автоматически выравниваются по силе, чем бы ни отличались HP и ритм.
 */
export const BALANCE = {
  splashMult: 0.45,
  meleeMult: 1.05,
  // Разброс урона удара: ±30%. Без него бой почти детерминирован — преимущество в
  // 7% DPS давало 93% побед, то есть исход был предрешён составом, а серия
  // поражений подряд выглядела бы для игрока нечестной. Разброс возвращает боям
  // возможность отыграться и заодно делает цепочки сопоставимыми.
  damageJitter: 0.3,
  // Общий масштаб урона относительно HP. При 1.15 пятеро убивали цель за один залп:
  // исход решали целочисленные пороги «хватило залпа или нет», из-за чего цепочки с
  // одинаковой расчётной силой давали 99% и 1% побед, а бой длился секунды. При 0.4
  // бой наоборот затягивался (сплэш почти не убивал). 0.7 — компромисс: убийство за
  // 2–3 залпа, бой ≈20–25 секунд, разница в силе влияет плавнее.
  dmgConst: 0.7,
  // Найдено бисекцией (npm run sim): при этих значениях моно-состав каждого типа
  // играет с эталонным снайперским вровень (50%).
  typeValue: { melee: 1.11, sniper: 1, splash: 1.48 } as Record<AttackType, number>,
};
export const TICK_MS = 100;
export const REMATCH_BUFF = 1.25;

/**
 * Множитель силы → множитель одной характеристики.
 * Боевая мощь растёт примерно как HP × урон, поэтому наивное «×1.2 на HP и урон»
 * давало ×1.44 реальной силы: матчмейкинг переусиливал врага (winrate игрока падал
 * до 22%), а рекламный реванш ×1.2 превращался в 99% побед. Корень возвращает
 * заявленному множителю честный смысл.
 */
export const statScale = (factor: number) => Math.sqrt(factor);

/** Характеристики бойца с учётом прокачки казармы (монетный синк). */
export function unitStats(chain: number, level: number, upgraded = true): UnitStats {
  const a = ARCH[chain % ARCH.length];
  const up = upgraded ? S.upgrades : { atk: 0, hp: 0 };
  return {
    hp: Math.round(48 * a.hp * Math.pow(1.85, level) * (1 + 0.05 * up.hp)),
    dmg: Math.round(9 * archDmg(a) * Math.pow(1.7, level) * (1 + 0.05 * up.atk)),
    spd: a.spd,
    type: a.type,
  };
}

/**
 * «Сила» юнита — ПРОИЗВЕДЕНИЕ живучести и урона в секунду, а не сумма.
 * Боец успевает нанести урон ≈ dps × время жизни, а время жизни ∝ HP, поэтому
 * реальная эффективность мультипликативна. Прежняя аддитивная формула недооценивала
 * уровень (один уровень даёт ×1.85 HP и ×1.7 урона, то есть ×3.1 эффективности, а
 * «сила» росла лишь в 1.8 раза), поэтому матчмейкинг подсовывал врага на уровень
 * выше при «равной» силе — игрок выигрывал 20% боёв (проверено scripts/sim.ts).
 * Делим на 100, чтобы «сила команды» в интерфейсе осталась читаемым числом.
 */
export const unitPower = (s: UnitStats) =>
  (Math.pow(s.hp, HP_EXP) * s.dmg * (1000 / s.spd) * BALANCE.typeValue[s.type]) / 10;

export const teamPower = (team: number[][], upgraded = true) =>
  team.reduce((sum, [ch, lv]) => sum + unitPower(unitStats(ch, lv, upgraded)), 0);

// Прокачка казармы: бесконечный монетный синк (+5% за уровень).
export const upgradeCost = (lvl: number) => Math.floor(500 * Math.pow(1.5, lvl));

export const ARENA_MILESTONES: { cups: number; coins?: number; gems?: number }[] = [
  { cups: 100, gems: 10 }, { cups: 300, coins: 5000 }, { cups: 600, gems: 25 },
  { cups: 1000, coins: 20000 }, { cups: 1500, gems: 60 }, { cups: 2500, gems: 150 },
];

export interface EnemyTeam { name: string; cups: number; team: number[][]; factor: number }

/**
 * Противник под силу игрока: ±15%, правдоподобный ник, кубки рядом.
 *
 * Считаем от БАЗОВОЙ силы команды (без казармы), иначе прокачка поднимала и врага,
 * и монеты уходили в пустоту (sim: 64% → 57% при 15 уровнях). Кубки работают как
 * рейтинг: чем выше забрался, тем сильнее соперники — так winrate сам собой
 * стабилизируется около 50% на любом плато, а казарма даёт забраться выше.
 */
export function makeEnemy(): EnemyTeam {
  const basePower = Math.max(100, teamPower(S.team, false));
  // Стартовая сложность и наклон подобраны прогонами sim: 0.85 даёт уверенные, но не
  // поголовные победы в первых боях, а плато без прокачки приходится на ~700🏆 (первый
  // милстоун — 100🏆); прокачанная казарма выводит за последний милстоун (2500🏆).
  // Система крайне чувствительна: 0.75 давало 100% побед на старте, 1.0 — уже 39%.
  const difficulty = 0.85 + Math.min(5, S.cups / 2500);
  const target = basePower * difficulty * (0.85 + Math.random() * 0.3);
  const perUnit = target / 5;
  const team: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const ch = Math.floor(Math.random() * CHAINS.length);
    let best = 0, bestDiff = Infinity;
    for (let lv = 0; lv < 6; lv++) {
      const diff = Math.abs(unitPower(unitStats(ch, lv, false)) - perUnit);
      if (diff < bestDiff) { bestDiff = diff; best = lv; }
    }
    team.push([ch, best]);
  }
  // добиваем разницу скрытым множителем, чтобы бой был честным «почти вровень»
  const factor = Math.min(1.8, Math.max(0.75, target / Math.max(1, teamPower(team, false))));
  const pool = nicks();
  return {
    name: pool[Math.floor(Math.random() * pool.length)],
    cups: Math.max(0, S.cups + Math.floor(Math.random() * 61) - 30),
    team,
    factor,
  };
}

// ---------- правила боя: общие для анимированного боя (battle.ts) и симуляции ----------
export interface CombatUnit { side: 0 | 1; alive: boolean; hp: number; dmg: number; type: AttackType }

/**
 * Кого бьёт юнит и каким уроном: melee — первого по строю, снайпер — самого
 * раненого, сплэш — всех сразу уменьшенным уроном. Единственный источник правды
 * для выбора цели: battle.ts рисует по этому плану, sim считает по нему же.
 */
export function attackPlan<T extends CombatUnit>(f: T, units: T[]): { targets: T[]; dmg: number } | null {
  const foes = units.filter(u => u.side !== f.side && u.alive);
  if (!foes.length) return null;
  if (f.type === 'splash') return { targets: foes, dmg: Math.max(1, Math.round(f.dmg * BALANCE.splashMult)) };
  if (f.type === 'sniper') return { targets: [foes.reduce((a, b) => (a.hp < b.hp ? a : b))], dmg: f.dmg };
  return { targets: [foes[0]], dmg: Math.round(f.dmg * BALANCE.meleeMult) };
}

/** Урон одного удара с разбросом — общий для боя и симуляции. */
export const rollDamage = (dmg: number) =>
  Math.max(1, Math.round(dmg * (1 - BALANCE.damageJitter / 2 + Math.random() * BALANCE.damageJitter)));

interface SimUnit extends CombatUnit { spd: number; next: number }

const simUnit = (chain: number, level: number, side: 0 | 1, factor: number): SimUnit => {
  const st = unitStats(chain, level, side === 0);
  const k = statScale(factor);
  return {
    side, alive: true, type: st.type, spd: st.spd,
    hp: Math.round(st.hp * k), dmg: Math.round(st.dmg * k),
    next: st.spd * (0.5 + Math.random() * 0.7), // как в battle.ts: разброс первой атаки
  };
};

/**
 * Быстрый расчёт исхода боя без анимации — для симуляции баланса (scripts/sim.ts).
 * Урон применяется в момент атаки, тогда как в бою он доезжает с анимацией
 * (130–220 мс) — при периодах атаки 900–2100 мс разница на исход почти не влияет.
 */
export function simulateBattle(playerTeam: number[][], enemyTeam: number[][], playerFactor = 1, enemyFactor = 1): boolean {
  return simulateBattleDetailed(playerTeam, enemyTeam, playerFactor, enemyFactor).win;
}

/** То же, но с диагностикой длительности — для калибровки в scripts/sim.ts. */
export function simulateBattleDetailed(playerTeam: number[][], enemyTeam: number[][], playerFactor = 1, enemyFactor = 1): { win: boolean; ms: number; timeout: boolean } {
  const units: SimUnit[] = [
    ...playerTeam.map(([ch, lv]) => simUnit(ch, lv, 0, playerFactor)),
    ...enemyTeam.map(([ch, lv]) => simUnit(ch, lv, 1, enemyFactor)),
  ];
  for (let time = 0; time < 180_000; time += TICK_MS) {
    for (const f of units) {
      if (!f.alive) continue;
      f.next -= TICK_MS;
      if (f.next > 0) continue;
      f.next = f.spd;
      const plan = attackPlan(f, units);
      if (!plan) break;
      for (const tg of plan.targets) { tg.hp -= rollDamage(plan.dmg); if (tg.hp <= 0) tg.alive = false; }
    }
    const alive0 = units.some(u => u.side === 0 && u.alive);
    const alive1 = units.some(u => u.side === 1 && u.alive);
    if (!alive0 || !alive1) return { win: alive0, ms: time, timeout: false };
  }
  // таймаут (взаимно неубиваемые составы): победа по числу выживших
  const win = units.filter(u => u.side === 0 && u.alive).length >= units.filter(u => u.side === 1 && u.alive).length;
  return { win, ms: 180_000, timeout: true };
}

/**
 * Кубки за результат: сильнее соперник — больше награда.
 * Прибавка и потеря близки по величине сознательно: при +20/−10 равновесие лиги
 * приходилось на 33% побед, то есть игрок на своём плато проигрывал два боя из
 * трёх. Теперь равновесие ≈ 47% — рост медленный, но бои не выглядят наказанием.
 */
export function cupsDelta(win: boolean, enemyPower: number): number {
  const ratio = enemyPower / Math.max(1, teamPower(S.team));
  if (win) return Math.max(8, Math.min(30, Math.round(18 + (ratio - 1) * 35)));
  return -Math.max(8, Math.min(26, Math.round(16 - (ratio - 1) * 25)));
}
