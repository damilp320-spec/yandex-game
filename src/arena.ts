// Арена: боевые характеристики, генерация противников под кубки игрока,
// милстоуны наград. Соперники — симуляция (правдоподобные ники, сила ±15%),
// поэтому «оффлайн противника» не существует как проблема.
import { CHAINS } from './config';
import { S } from './state';
import { nicks } from './i18n';

export type AttackType = 'melee' | 'sniper' | 'splash';

// Архетип цепочки: множители HP/урона, скорость атаки (мс), тип атаки.
const ARCH: { hp: number; dmg: number; spd: number; type: AttackType }[] = [
  { hp: 1.0, dmg: 1.1, spd: 1500, type: 'sniper' },  // coffee — балерина бьёт точно
  { hp: 1.1, dmg: 1.3, spd: 2100, type: 'splash' },  // croc — бомбардировка по площади
  { hp: 1.0, dmg: 1.0, spd: 900, type: 'melee' },    // shark — быстрые укусы
  { hp: 1.2, dmg: 1.15, spd: 1700, type: 'splash' }, // drum — ударная волна
  { hp: 0.9, dmg: 1.2, spd: 1000, type: 'sniper' },  // cat — скретч по больному
  { hp: 1.35, dmg: 0.9, spd: 1300, type: 'melee' },  // robot — танк
  { hp: 0.95, dmg: 1.05, spd: 1200, type: 'sniper' },// fruit — меткий флирт
  { hp: 1.25, dmg: 1.25, spd: 1900, type: 'melee' }, // stick — медленная, но БИТА
  { hp: 1.0, dmg: 1.35, spd: 1100, type: 'splash' }, // sixseven — мем-урон всем
  { hp: 1.6, dmg: 0.8, spd: 1600, type: 'melee' },   // capy — жирный чилл-танк
  { hp: 0.85, dmg: 1.25, spd: 1150, type: 'sniper' },// ufo — луч
  { hp: 1.05, dmg: 1.1, spd: 1400, type: 'splash' }, // noodle — паста во все стороны
];

export interface UnitStats { hp: number; dmg: number; spd: number; type: AttackType }

/** Характеристики бойца с учётом прокачки казармы (монетный синк). */
export function unitStats(chain: number, level: number, upgraded = true): UnitStats {
  const a = ARCH[chain % ARCH.length];
  const up = upgraded ? S.upgrades : { atk: 0, hp: 0 };
  return {
    hp: Math.round(48 * a.hp * Math.pow(1.85, level) * (1 + 0.05 * up.hp)),
    dmg: Math.round(9 * a.dmg * Math.pow(1.7, level) * (1 + 0.05 * up.atk)),
    spd: a.spd,
    type: a.type,
  };
}

/** «Сила» юнита — для матчмейкинга и расчёта кубков. */
export const unitPower = (s: UnitStats) => s.hp * 0.5 + s.dmg * (1000 / s.spd) * 6;

export const teamPower = (team: number[][], upgraded = true) =>
  team.reduce((sum, [ch, lv]) => sum + unitPower(unitStats(ch, lv, upgraded)), 0);

// Прокачка казармы: бесконечный монетный синк (+5% за уровень).
export const upgradeCost = (lvl: number) => Math.floor(500 * Math.pow(1.5, lvl));

export const ARENA_MILESTONES: { cups: number; coins?: number; gems?: number }[] = [
  { cups: 100, gems: 10 }, { cups: 300, coins: 5000 }, { cups: 600, gems: 25 },
  { cups: 1000, coins: 20000 }, { cups: 1500, gems: 60 }, { cups: 2500, gems: 150 },
];

export interface EnemyTeam { name: string; cups: number; team: number[][]; factor: number }

/** Противник под силу игрока: ±15% силы, правдоподобный ник, кубки рядом. */
export function makeEnemy(): EnemyTeam {
  const myPower = Math.max(100, teamPower(S.team));
  const target = myPower * (0.85 + Math.random() * 0.3);
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
  const factor = Math.min(1.3, Math.max(0.75, target / Math.max(1, teamPower(team, false))));
  const pool = nicks();
  return {
    name: pool[Math.floor(Math.random() * pool.length)],
    cups: Math.max(0, S.cups + Math.floor(Math.random() * 61) - 30),
    team,
    factor,
  };
}

/** Кубки за результат: сильнее соперник — больше награда. */
export function cupsDelta(win: boolean, enemyPower: number): number {
  const ratio = enemyPower / Math.max(1, teamPower(S.team));
  if (win) return Math.max(10, Math.min(35, Math.round(20 + (ratio - 1) * 40)));
  return -Math.max(5, Math.min(15, Math.round(10 - (ratio - 1) * 20)));
}
