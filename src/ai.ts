/**
 * Xiangqi AI — Enhanced Engine (No Opening Book)
 *
 * Key improvements:
 * 1. No opening book — AI thinks for itself from move 1
 * 2. Opening phase heuristics with strategic variety (randomized weights)
 * 3. Stronger evaluation: mobility, king safety, pawn structure, piece coordination
 * 4. Better search: deeper iterative deepening, improved LMR, SEE pruning
 * 5. forbiddenMoves parameter: enforces perpetual check/chase rules
 */

import { Xiangqi, Move, PieceColor } from './xiangqi';

// ─────────────────────────────────────────────────────────────────
// PIECE VALUES
// ─────────────────────────────────────────────────────────────────
const PV: Record<string, number> = {
  k: 100000,
  r: 1050,
  c: 525,
  h: 445,
  e: 225,
  a: 225,
  p: 115,
};

// ─────────────────────────────────────────────────────────────────
// PIECE-SQUARE TABLES
// ─────────────────────────────────────────────────────────────────
const PST: Record<string, number[][]> = {
  k: [
    [ 0,  0,  0, 12, 20, 12,  0,  0,  0],
    [ 0,  0,  0, 10, 15, 10,  0,  0,  0],
    [ 0,  0,  0,  6, 10,  6,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  a: [
    [ 0,  0,  0, 20,  0, 20,  0,  0,  0],
    [ 0,  0,  0,  0, 28,  0,  0,  0,  0],
    [ 0,  0,  0, 20,  0, 20,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  e: [
    [ 0,  0, 24,  0,  0,  0, 24,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [24,  0,  0,  0, 34,  0,  0,  0, 24],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0, 24,  0,  0,  0, 24,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  h: [
    [  0, 14, 20, 20, 20, 20, 20, 14,  0],
    [ 14, 28, 42, 42, 42, 42, 42, 28, 14],
    [ 20, 42, 62, 72, 76, 72, 62, 42, 20],
    [ 20, 42, 72, 84, 90, 84, 72, 42, 20],
    [ 20, 42, 72, 90, 96, 90, 72, 42, 20],
    [ 20, 42, 72, 84, 90, 84, 72, 42, 20],
    [ 20, 42, 62, 72, 76, 72, 62, 42, 20],
    [ 20, 30, 45, 55, 60, 55, 45, 30, 20],
    [ 14, 20, 30, 38, 42, 38, 30, 20, 14],
    [  0, 14, 20, 20, 20, 20, 20, 14,  0],
  ],
  r: [
    [ 50, 54, 54, 60, 64, 60, 54, 54, 50],
    [ 54, 60, 60, 66, 70, 66, 60, 60, 54],
    [ 50, 60, 64, 74, 80, 74, 64, 60, 50],
    [ 50, 60, 64, 80, 88, 80, 64, 60, 50],
    [ 50, 60, 64, 80, 92, 80, 64, 60, 50],
    [ 50, 60, 64, 80, 88, 80, 64, 60, 50],
    [ 50, 60, 64, 74, 80, 74, 64, 60, 50],
    [ 54, 60, 60, 66, 70, 66, 60, 60, 54],
    [ 54, 60, 60, 66, 70, 66, 60, 60, 54],
    [ 50, 54, 54, 60, 64, 60, 54, 54, 50],
  ],
  c: [
    [  0, 10, 16, 20, 20, 20, 16, 10,  0],
    [ 10, 20, 30, 38, 38, 38, 30, 20, 10],
    [ 10, 20, 40, 54, 58, 54, 40, 20, 10],
    [ 10, 24, 54, 65, 72, 65, 54, 24, 10],
    [ 10, 24, 54, 72, 76, 72, 54, 24, 10],
    [ 10, 24, 54, 65, 72, 65, 54, 24, 10],
    [ 10, 20, 40, 54, 58, 54, 40, 20, 10],
    [ 10, 20, 30, 38, 38, 38, 30, 20, 10],
    [ 10, 14, 20, 24, 24, 24, 20, 14, 10],
    [  0, 10, 16, 20, 20, 20, 16, 10,  0],
  ],
  p: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 25, 25, 25, 28, 32, 28, 25, 25, 25],
    [ 40, 48, 58, 65, 72, 65, 58, 48, 40],
    [ 58, 68, 80, 92, 98, 92, 80, 68, 58],
    [ 68, 80, 92,104,112,104, 92, 80, 68],
    [ 75, 88, 98,112,118,112, 98, 88, 75],
  ],
};

// ─────────────────────────────────────────────────────────────────
// STRATEGIC VARIETY SYSTEM — 动态流派感知
// ─────────────────────────────────────────────────────────────────
interface StyleWeights {
  cannonCenterBonus: number;
  knightMobilityBonus: number;
  chariotRushBonus: number;
  elephantDefenseBonus: number;
  pawnAggression: number;
  styleTag: string;
}

/** 所有预设流派 */
const STYLES: Record<string, StyleWeights> = {
  '中炮流':   { cannonCenterBonus: 38, knightMobilityBonus: 10, chariotRushBonus: 14, elephantDefenseBonus: 4,  pawnAggression: 8,  styleTag: '中炮流'   },
  '起马流':   { cannonCenterBonus: 5,  knightMobilityBonus: 26, chariotRushBonus: 10, elephantDefenseBonus: 8,  pawnAggression: 6,  styleTag: '起马流'   },
  // 飞相流：飞中象（田心象位 row7/col4 红，row2/col4 黑），稳固防守后再出子
  '飞相流':   { cannonCenterBonus: 10, knightMobilityBonus: 12, chariotRushBonus: 8,  elephantDefenseBonus: 36, pawnAggression: 6,  styleTag: '飞相流'   },
  // 进兵流：进三路兵（col2）或七路兵（col6），牵制对马腿
  '进兵流':   { cannonCenterBonus: 8,  knightMobilityBonus: 10, chariotRushBonus: 8,  elephantDefenseBonus: 8,  pawnAggression: 30, styleTag: '进兵流'   },
  '车马炮':   { cannonCenterBonus: 16, knightMobilityBonus: 16, chariotRushBonus: 22, elephantDefenseBonus: 5,  pawnAggression: 10, styleTag: '车马炮'   },
  '仙人指路': { cannonCenterBonus: 10, knightMobilityBonus: 14, chariotRushBonus: 10, elephantDefenseBonus: 10, pawnAggression: 22, styleTag: '仙人指路' },
};

/**
 * 感知对手前几步，动态选择克制/配合的流派
 */
function detectOpponentStyle(game: Xiangqi, myColor: PieceColor): string {
  const oppColor: PieceColor = myColor === 'red' ? 'black' : 'red';
  const oppMoves = (game.history as any[]).filter(h => {
    const piece = h.piece ?? h.movedPiece;
    return piece && piece.color === oppColor;
  });

  let oppCannonCenter = false;
  let oppKnightOut = 0;
  let oppPawnAdvance = false;
  let oppElephantCenter = false;

  for (const h of oppMoves) {
    const piece = h.piece ?? h.movedPiece;
    const to = h.to;
    if (!piece || !to) continue;
    if (piece.type === 'c' && to.c === 4) oppCannonCenter = true;
    if (piece.type === 'h') {
      const startR = oppColor === 'red' ? 9 : 0;
      if (to.r !== startR) oppKnightOut++;
    }
    if (piece.type === 'p') {
      const startR = oppColor === 'red' ? 6 : 3;
      const adv = oppColor === 'red' ? startR - to.r : to.r - startR;
      if (adv > 0) oppPawnAdvance = true;
    }
    if (piece.type === 'e') {
      // 中象：红方 row7 col4，黑方 row2 col4
      if (to.c === 4 && (to.r === 7 || to.r === 2)) oppElephantCenter = true;
    }
  }

  // 克制逻辑
  if (oppCannonCenter) {
    // 对手中炮 → 飞相流（飞中象防守）或起马流（马制炮）
    return Math.random() < 0.55 ? '飞相流' : '起马流';
  }
  if (oppKnightOut >= 2) {
    // 对手双马 → 进兵流（挺兵牵马腿）或中炮流
    return Math.random() < 0.5 ? '进兵流' : '中炮流';
  }
  if (oppPawnAdvance && !oppCannonCenter) {
    // 对手挺兵 → 中炮或起马快速反制
    return Math.random() < 0.5 ? '中炮流' : '起马流';
  }
  if (oppElephantCenter) {
    // 对手飞中象守势 → 积极进攻
    return Math.random() < 0.5 ? '车马炮' : '中炮流';
  }

  // 默认随机加权
  const roll = Math.random();
  if (roll < 0.20) return '中炮流';
  if (roll < 0.38) return '起马流';
  if (roll < 0.54) return '飞相流';
  if (roll < 0.68) return '进兵流';
  if (roll < 0.84) return '车马炮';
  return '仙人指路';
}

let currentStyle: StyleWeights = STYLES['中炮流'];

// ─────────────────────────────────────────────────────────────────
// TRANSPOSITION TABLE
// ─────────────────────────────────────────────────────────────────
const TT_SIZE = 1 << 21;
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

interface TTEntry {
  key: number;
  depth: number;
  score: number;
  flag: number;
  move: Move | null;
  age: number;
}

const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null);
let ttAge = 0;

function ttIndex(key: number): number { return key & (TT_SIZE - 1); }

function boardHash(game: Xiangqi): number {
  let h = 0x9e3779b9;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p) {
        const typeCode = 'kaehrcp'.indexOf(p.type);
        const colorCode = p.color === 'red' ? 0 : 1;
        h ^= ((r * 9 + c) * 13 + typeCode * 7 + colorCode) * 0x9e3779b9;
        h = (h >>> 0);
      }
    }
  }
  h ^= game.turn === 'red' ? 0 : 0xdeadbeef;
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────────
// KILLER & HISTORY
// ─────────────────────────────────────────────────────────────────
const MAX_PLY = 64;
const killers: (Move | null)[][] = Array.from({ length: MAX_PLY }, () => [null, null]);
const history: number[][][] = [
  Array.from({ length: 90 }, () => new Array(90).fill(0)),
  Array.from({ length: 90 }, () => new Array(90).fill(0)),
];

function colorIdx(c: PieceColor) { return c === 'red' ? 0 : 1; }
function histScore(color: PieceColor, m: Move) {
  return history[colorIdx(color)][m.from.r * 9 + m.from.c][m.to.r * 9 + m.to.c];
}
function histUpdate(color: PieceColor, m: Move, depth: number) {
  const val = depth * depth;
  const idx = colorIdx(color);
  const from = m.from.r * 9 + m.from.c;
  const to = m.to.r * 9 + m.to.c;
  history[idx][from][to] += val;
  if (history[idx][from][to] > 1_000_000) {
    for (let f = 0; f < 90; f++)
      for (let t = 0; t < 90; t++)
        history[idx][f][t] >>= 1;
  }
}

function isKiller(m: Move, ply: number): boolean {
  const k = killers[ply];
  return (k[0] !== null && moveEq(m, k[0])) || (k[1] !== null && moveEq(m, k[1]));
}
function addKiller(m: Move, ply: number) {
  if (!killers[ply][0] || !moveEq(m, killers[ply][0]!)) {
    killers[ply][1] = killers[ply][0];
    killers[ply][0] = m;
  }
}
function moveEq(a: Move, b: Move): boolean {
  return a.from.r === b.from.r && a.from.c === b.from.c &&
    a.to.r === b.to.r && a.to.c === b.to.c;
}

// ─────────────────────────────────────────────────────────────────
// MOVE ORDERING
// ─────────────────────────────────────────────────────────────────
const VICTIM_VAL: Record<string, number> = { k: 700, r: 600, c: 450, h: 380, e: 250, a: 250, p: 120 };
const ATTACKER_VAL: Record<string, number> = { k: 0, r: 50, c: 80, h: 100, e: 120, a: 120, p: 140 };

function scoreMoves(moves: Move[], game: Xiangqi, ply: number, ttMove: Move | null): void {
  const color = game.turn;
  for (const m of moves) {
    if (ttMove && moveEq(m, ttMove)) {
      (m as any)._score = 3_000_000;
    } else if (m.captured) {
      const att = game.board[m.from.r][m.from.c];
      const attType = att ? att.type : 'p';
      const mvvlva = (VICTIM_VAL[m.captured.type] ?? 100) * 10 - (ATTACKER_VAL[attType] ?? 100);
      (m as any)._score = 1_000_000 + mvvlva;
    } else if (isKiller(m, ply)) {
      (m as any)._score = 900_000;
    } else {
      (m as any)._score = histScore(color, m);
    }
  }
  moves.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0));
}

// ─────────────────────────────────────────────────────────────────
// OPENING PHASE HEURISTIC
// ─────────────────────────────────────────────────────────────────
function openingBonus(game: Xiangqi, moveNum: number, style: StyleWeights): number {
  if (moveNum > 18) return 0;
  const decay = Math.max(0, 1 - moveNum / 19);
  const redBonus = computeSideOpeningBonus(game, 'red', style);
  const blackBonus = computeSideOpeningBonus(game, 'black', style);
  const score = redBonus - blackBonus;
  return Math.round(score * decay * (game.turn === 'red' ? 1 : -1));
}

function computeSideOpeningBonus(game: Xiangqi, color: PieceColor, style: StyleWeights): number {
  let bonus = 0;
  const isRed = color === 'red';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p || p.color !== color) continue;

      // ── 炮 ──────────────────────────────────────────────────────
      if (p.type === 'c') {
        if (c === 4) bonus += style.cannonCenterBonus;
        const backRank = isRed ? 7 : 2;
        if (r !== backRank) bonus += 10;
        // 炮二路/八路护马也有价值（中炮流以外）
        if ((c === 1 || c === 7) && style.styleTag !== '中炮流') bonus += 6;
      }

      // ── 马 ──────────────────────────────────────────────────────
      if (p.type === 'h') {
        const startR = isRed ? 9 : 0;
        if (r !== startR) bonus += style.knightMobilityBonus;
        // 马跳至正兵位（e2/d2 红方 = row8 col2/6，起马流额外奖励）
        if (style.styleTag === '起马流') {
          const idealRows = isRed ? [7, 8] : [1, 2];
          if (idealRows.includes(r) && (c === 2 || c === 6)) bonus += 14;
        }
      }

      // ── 车 ──────────────────────────────────────────────────────
      if (p.type === 'r') {
        const startR = isRed ? 9 : 0;
        const advancement = isRed ? (startR - r) : (r - startR);
        if (advancement > 0) bonus += style.chariotRushBonus * Math.min(advancement, 4);
      }

      // ── 象（相） ─────────────────────────────────────────────────
      if (p.type === 'e') {
        const validPositions = isRed
          ? [[9,2],[9,6],[7,0],[7,4],[7,8],[5,2],[5,6]]
          : [[0,2],[0,6],[2,0],[2,4],[2,8],[4,2],[4,6]];
        const inPlace = validPositions.some(([er, ec]) => er === r && ec === c);
        if (inPlace) bonus += style.elephantDefenseBonus;

        // 飞相流专项：奖励飞至中象位（田心，红方 row7 col4，黑方 row2 col4）
        // 中象位是象的最强位置，控制四方
        if (style.styleTag === '飞相流') {
          const isCenterElephant =
            (isRed && r === 7 && c === 4) ||
            (!isRed && r === 2 && c === 4);
          if (isCenterElephant) bonus += 30;
          // 次优位：两侧中象辅助（row7 col0/8 红，row2 col0/8 黑）
          const isFlankSupport =
            (isRed && r === 7 && (c === 0 || c === 8)) ||
            (!isRed && r === 2 && (c === 0 || c === 8));
          if (isFlankSupport) bonus += 10;
        }
      }

      // ── 兵（卒） ─────────────────────────────────────────────────
      if (p.type === 'p') {
        const startR = isRed ? 6 : 3;
        const advancement = isRed ? (startR - r) : (r - startR);
        if (advancement > 0) bonus += style.pawnAggression * advancement;

        // 进兵流专项：优先奖励三路兵和七路兵前进（列索引 2 和 6）
        if (style.styleTag === '进兵流' || style.styleTag === '仙人指路') {
          if ((c === 2 || c === 6) && advancement > 0) {
            bonus += 18 * advancement; // 进三/七路兵额外奖励
          }
          // 仙人指路：中兵也有奖励（c===4 第一步）
          if (style.styleTag === '仙人指路' && c === 4 && advancement > 0) {
            bonus += 12 * advancement;
          }
        }
      }
    }
  }
  return bonus;
}

// ─────────────────────────────────────────────────────────────────
// EVALUATION
// ─────────────────────────────────────────────────────────────────

/** 判断是否进入残局：总子力分低于阈值 */
function getGamePhase(game: Xiangqi): 'opening' | 'midgame' | 'endgame' {
  let materialRed = 0, materialBlack = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p || p.type === 'k') continue;
      const v = PV[p.type] ?? 0;
      if (p.color === 'red') materialRed += v;
      else materialBlack += v;
    }
  }
  const total = materialRed + materialBlack;
  if (total > 6000) return 'opening';
  if (total > 3000) return 'midgame';
  return 'endgame';
}

/** 计算将/帅到棋盘中心的距离（残局将帅活跃度） */
function kingActivity(game: Xiangqi, color: PieceColor): number {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p && p.type === 'k' && p.color === color) {
        // 距九宫中心的曼哈顿距离
        const centerR = color === 'red' ? 8 : 1;
        const centerC = 4;
        return Math.abs(r - centerR) + Math.abs(c - centerC);
      }
    }
  }
  return 0;
}

/** 计算马到某目标格的最短步数（BFS近似，用于马兵胜法） */
function knightDistanceToTarget(game: Xiangqi, color: PieceColor, targetR: number, targetC: number): number {
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p && p.type === 'h' && p.color === color) {
        const dr = Math.abs(r - targetR);
        const dc = Math.abs(c - targetC);
        // 粗略估算步数
        return Math.max(Math.ceil((dr + dc) / 2), Math.ceil(dr / 2), Math.ceil(dc / 2));
      }
    }
  }
  return 10;
}

/** 残局评估增益 */
function endgameBonus(game: Xiangqi, myColor: PieceColor): number {
  const oppColor: PieceColor = myColor === 'red' ? 'black' : 'red';
  let bonus = 0;

  // 统计双方子力
  let myRooks = 0, myKnights = 0, myCannons = 0, myPawns = 0;
  let oppRooks = 0, oppKnights = 0, oppCannons = 0, oppAdvisors = 0, oppElephants = 0;
  let myAdvancedPawns: Array<{r:number,c:number}> = [];
  let oppKingR = 0, oppKingC = 0;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p) continue;
      if (p.color === myColor) {
        if (p.type === 'r') myRooks++;
        if (p.type === 'h') myKnights++;
        if (p.type === 'c') myCannons++;
        if (p.type === 'p') {
          // 记录过河兵
          const isOver = myColor === 'red' ? r < 5 : r > 4;
          if (isOver) myAdvancedPawns.push({r, c});
          myPawns++;
        }
      } else {
        if (p.type === 'r') oppRooks++;
        if (p.type === 'h') oppKnights++;
        if (p.type === 'c') oppCannons++;
        if (p.type === 'a') oppAdvisors++;
        if (p.type === 'e') oppElephants++;
        if (p.type === 'k') { oppKingR = r; oppKingC = c; }
      }
    }
  }

  const myMaterial = myRooks * 2 + myKnights + myCannons + myPawns * 0.3;
  const oppDefense = oppAdvisors + oppElephants;

  // ── 1. 车胜法：车逼将，奖励车接近对王 ────────────────────────
  if (myRooks > 0 && oppRooks === 0) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = game.board[r][c];
        if (p && p.type === 'r' && p.color === myColor) {
          const dist = Math.abs(r - oppKingR) + Math.abs(c - oppKingC);
          bonus += Math.max(0, 8 - dist) * 12; // 越近越好
          // 同行或同列更强（车直接威胁）
          if (r === oppKingR || c === oppKingC) bonus += 25;
        }
      }
    }
  }

  // ── 2. 兵升变意识：过河兵接近底线奖励 ────────────────────────
  for (const pw of myAdvancedPawns) {
    const distToEnd = myColor === 'red' ? pw.r : (9 - pw.r);
    bonus += Math.max(0, 5 - distToEnd) * 15;
    // 过河兵接近对王列有额外威胁
    const colDist = Math.abs(pw.c - oppKingC);
    if (colDist <= 1) bonus += 20;
  }

  // ── 3. 马兵胜法：无车时马接近对王 ────────────────────────────
  if (myRooks === 0 && myKnights > 0) {
    const kDist = knightDistanceToTarget(game, myColor, oppKingR, oppKingC);
    bonus += Math.max(0, 6 - kDist) * 10;
  }

  // ── 4. 双炮优势：对方无仕象时炮更强 ──────────────────────────
  if (myCannons >= 2 && oppDefense <= 1) {
    bonus += 40;
  }

  // ── 5. 残局将帅活跃度（残局将要出来参战） ─────────────────────
  const myKingDist = kingActivity(game, myColor);
  if (myMaterial > 1 && myMaterial < 4) {
    // 将/帅走到中心更好（残局激活）
    bonus += (4 - myKingDist) * 8;
  }

  // ── 6. 对方无仕无象：残局更容易胜 ────────────────────────────
  if (oppAdvisors === 0 && oppElephants === 0) bonus += 60;
  else if (oppAdvisors + oppElephants <= 1) bonus += 25;

  // ── 7. 困毙预防（我方子少时避免困境） ────────────────────────
  if (myMaterial <= 1 && myRooks === 0 && myPawns <= 1) {
    bonus -= 30; // 子力不足，轻微扣分防止误判优势
  }

  return bonus;
}

function evaluate(game: Xiangqi, moveNum: number, style: StyleWeights): number {
  let redScore = 0, blackScore = 0;
  let redAdvisors = 0, redElephants = 0;
  let blackAdvisors = 0, blackElephants = 0;
  let redMobility = 0, blackMobility = 0;
  let redCannons = 0, blackCannons = 0;
  let redRooks = 0, blackRooks = 0;
  let redPawnsAdvanced = 0, blackPawnsAdvanced = 0;
  let redCannonCenterControl = 0, blackCannonCenterControl = 0;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p) continue;
      const isRed = p.color === 'red';
      const pstRow = isRed ? (9 - r) : r;
      const baseVal = PV[p.type] + (PST[p.type]?.[pstRow]?.[c] ?? 0);

      if (isRed) {
        redScore += baseVal;
        if (p.type === 'a') redAdvisors++;
        if (p.type === 'e') redElephants++;
        if (p.type === 'r') { redMobility += 14; redRooks++; }
        else if (p.type === 'c') {
          redMobility += 10; redCannons++;
          if (c === 4) redCannonCenterControl += 15;
          if (r <= 4) redCannonCenterControl += 8;
        }
        else if (p.type === 'h') redMobility += 6;
        else if (p.type === 'p') {
          const adv = 6 - r;
          if (adv > 0) redPawnsAdvanced += adv;
        }
      } else {
        blackScore += baseVal;
        if (p.type === 'a') blackAdvisors++;
        if (p.type === 'e') blackElephants++;
        if (p.type === 'r') { blackMobility += 14; blackRooks++; }
        else if (p.type === 'c') {
          blackMobility += 10; blackCannons++;
          if (c === 4) blackCannonCenterControl += 15;
          if (r >= 5) blackCannonCenterControl += 8;
        }
        else if (p.type === 'h') blackMobility += 6;
        else if (p.type === 'p') {
          const adv = r - 3;
          if (adv > 0) blackPawnsAdvanced += adv;
        }
      }
    }
  }

  // 仕象防守协调
  redScore += redAdvisors * 14 + redElephants * 12;
  blackScore += blackAdvisors * 14 + blackElephants * 12;

  // 机动性
  redScore += redMobility * 2;
  blackScore += blackMobility * 2;

  // 炮中路控制
  redScore += redCannonCenterControl;
  blackScore += blackCannonCenterControl;

  // 双车协调奖励
  if (redRooks === 2) redScore += 18;
  if (blackRooks === 2) blackScore += 18;

  // 过河兵结构奖励
  redScore += redPawnsAdvanced * 4;
  blackScore += blackPawnsAdvanced * 4;

  let absScore = redScore - blackScore;

  // 开局奖励（≤18步有效）
  if (moveNum <= 18) absScore += openingBonus(game, moveNum, style);

  // 残局专项评估
  const phase = getGamePhase(game);
  if (phase === 'endgame') {
    const redEndBonus = endgameBonus(game, 'red');
    const blackEndBonus = endgameBonus(game, 'black');
    absScore += redEndBonus - blackEndBonus;
  } else if (phase === 'midgame') {
    // 中局：仕象不足时轻微扣分
    if (redAdvisors < 2) redScore -= (2 - redAdvisors) * 15;
    if (redElephants < 2) redScore -= (2 - redElephants) * 10;
    if (blackAdvisors < 2) blackScore -= (2 - blackAdvisors) * 15;
    if (blackElephants < 2) blackScore -= (2 - blackElephants) * 10;
    absScore = redScore - blackScore + (moveNum <= 18 ? openingBonus(game, moveNum, style) : 0);
  }

  return game.turn === 'red' ? absScore : -absScore;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function hasKing(game: Xiangqi, color: PieceColor): boolean {
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p && p.type === 'k' && p.color === color) return true;
    }
  return false;
}

const INF = 90000;
let globalStop = false;

// ─────────────────────────────────────────────────────────────────
// QUIESCENCE SEARCH
// ─────────────────────────────────────────────────────────────────
function qSearch(game: Xiangqi, alpha: number, beta: number, depth: number, moveNum: number, style: StyleWeights): number {
  if (!hasKing(game, 'red')) return -INF;
  if (!hasKing(game, 'black')) return -INF;

  const stand = evaluate(game, moveNum, style);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  const DELTA = 1150;
  if (stand + DELTA < alpha) return alpha;

  const color = game.turn;
  const allMoves = game.getAllValidMoves(color);
  const captures = allMoves.filter(m => m.captured);

  captures.sort((a, b) => {
    const va = (VICTIM_VAL[a.captured!.type] ?? 0) * 10 - (ATTACKER_VAL[game.board[a.from.r][a.from.c]?.type ?? 'p'] ?? 0);
    const vb = (VICTIM_VAL[b.captured!.type] ?? 0) * 10 - (ATTACKER_VAL[game.board[b.from.r][b.from.c]?.type ?? 'p'] ?? 0);
    return vb - va;
  });

  for (const m of captures) {
    const clone = game.clone();
    clone.makeMove(m);
    const score = -qSearch(clone, -beta, -alpha, depth - 1, moveNum + 1, style);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ─────────────────────────────────────────────────────────────────
// NEGAMAX ALPHA-BETA with PVS
// ─────────────────────────────────────────────────────────────────
function negamax(
  game: Xiangqi,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  nullAllowed: boolean,
  moveNum: number,
  style: StyleWeights
): number {
  if (!hasKing(game, 'red')) return -INF + ply;
  if (!hasKing(game, 'black')) return -INF + ply;
  if (globalStop) return 0;

  const hash = boardHash(game);
  const ttIdx = ttIndex(hash);
  const ttEntry = tt[ttIdx];
  let ttMove: Move | null = null;

  if (ttEntry && ttEntry.key === hash && ttEntry.depth >= depth) {
    ttMove = ttEntry.move;
    if (ttEntry.flag === TT_EXACT) return ttEntry.score;
    if (ttEntry.flag === TT_LOWER && ttEntry.score > alpha) alpha = ttEntry.score;
    if (ttEntry.flag === TT_UPPER && ttEntry.score < beta) beta = ttEntry.score;
    if (alpha >= beta) return ttEntry.score;
  } else if (ttEntry && ttEntry.key === hash) {
    ttMove = ttEntry.move;
  }

  if (depth === 0) return qSearch(game, alpha, beta, 7, moveNum, style);

  const color = game.turn;
  const inCheck = game.isInCheck(color);

  if (nullAllowed && !inCheck && depth >= 3 && ply > 0) {
    const reduction = depth >= 8 ? 4 : depth >= 5 ? 3 : 2;
    const nullGame = game.clone();
    nullGame.turn = nullGame.turn === 'red' ? 'black' : 'red';
    const nullScore = -negamax(nullGame, depth - 1 - reduction, -beta, -beta + 1, ply + 1, false, moveNum + 1, style);
    if (nullScore >= beta) return beta;
  }

  const moves = game.getAllValidMoves(color);
  if (moves.length === 0) return inCheck ? -INF + ply : 0;

  scoreMoves(moves, game, ply, ttMove);

  let bestScore = -INF;
  let bestMove: Move | null = null;
  let flag = TT_UPPER;
  let movesSearched = 0;

  for (const m of moves) {
    if (globalStop) return 0;

    const clone = game.clone();
    clone.makeMove(m);
    const inCheckAfter = clone.isInCheck(clone.turn);
    const extension = inCheckAfter ? 1 : 0;

    let score: number;
    if (movesSearched === 0) {
      score = -negamax(clone, depth - 1 + extension, -beta, -alpha, ply + 1, true, moveNum + 1, style);
    } else {
      let reduction = 0;
      if (!m.captured && !inCheckAfter && !inCheck && movesSearched >= 3 && depth >= 3) {
        reduction = movesSearched >= 8 ? 3 : movesSearched >= 4 ? 2 : 1;
        if (isKiller(m, ply)) reduction = Math.max(0, reduction - 1);
        // 历史分高的走法少减
        if (histScore(color, m) > 5000) reduction = Math.max(0, reduction - 1);
      }
      score = -negamax(clone, depth - 1 + extension - reduction, -alpha - 1, -alpha, ply + 1, true, moveNum + 1, style);
      if (score > alpha && (reduction > 0 || score < beta)) {
        score = -negamax(clone, depth - 1 + extension, -beta, -alpha, ply + 1, true, moveNum + 1, style);
      }
    }

    movesSearched++;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
    if (score > alpha) {
      alpha = score;
      flag = TT_EXACT;
    }
    if (alpha >= beta) {
      if (!m.captured) {
        addKiller(m, ply);
        histUpdate(color, m, depth);
      }
      flag = TT_LOWER;
      break;
    }
  }

  tt[ttIdx] = { key: hash, depth, score: bestScore, flag, move: bestMove, age: ttAge };
  return bestScore;
}

// ─────────────────────────────────────────────────────────────────
// ROOT SEARCH — Iterative Deepening + Aspiration Windows
// forbiddenMoves: moves the AI is NOT allowed to play (perpetual enforcement)
// ─────────────────────────────────────────────────────────────────
export function getBestMove(
  game: Xiangqi,
  difficulty: number,
  reportProgress?: (p: number) => void,
  forbiddenMoves: Move[] = []
): Move | null {
  if (game.getWinner()) return null;

  const color = game.turn;
  const moveNum = game.history.length;

  // 动态感知对手流派：前8步每步都重新评估，之后每4步更新一次
  const shouldUpdateStyle = moveNum <= 8 || moveNum % 4 === 0;
  if (moveNum === 0 || shouldUpdateStyle) {
    const styleTag = detectOpponentStyle(game, color);
    currentStyle = STYLES[styleTag] ?? STYLES['中炮流'];
  }

  globalStop = false;
  ttAge++;
  for (let i = 0; i < MAX_PLY; i++) { killers[i][0] = killers[i][1] = null; }
  for (let c2 = 0; c2 < 2; c2++)
    for (let f = 0; f < 90; f++)
      history[c2][f].fill(0);

  const maxDepthMap: Record<number, number> = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };
  const timeLimitMap: Record<number, number> = { 1: 800, 2: 2000, 3: 4000, 4: 8000, 5: 16000 };
  const maxDepth = maxDepthMap[difficulty] ?? 5;
  const timeLimit = timeLimitMap[difficulty] ?? 4000;
  const t0 = Date.now();

  const allRootMoves = game.getAllValidMoves(color);
  if (allRootMoves.length === 0) return null;

  // Filter out forbidden moves (perpetual check/chase enforcement)
  const isForbidden = (m: Move) =>
    forbiddenMoves.some(f =>
      f.from.r === m.from.r && f.from.c === m.from.c &&
      f.to.r === m.to.r && f.to.c === m.to.c
    );
  const allowedRootMoves = allRootMoves.filter(m => !isForbidden(m));
  // Fall back to all moves if filtering leaves nothing (safety)
  const rootMoves = allowedRootMoves.length > 0 ? allowedRootMoves : allRootMoves;

  if (rootMoves.length === 1) {
    if (reportProgress) reportProgress(100);
    return rootMoves[0];
  }

  scoreMoves(rootMoves, game, 0, null);

  if (moveNum <= 6) {
    for (const m of rootMoves) {
      (m as any)._score = ((m as any)._score || 0) + Math.floor(Math.random() * 8);
    }
    rootMoves.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0));
  }

  let bestMove: Move = rootMoves[0];
  let prevScore = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() - t0 > timeLimit) break;

    let alpha: number, beta: number;
    const WINDOW = 30;
    if (depth >= 4) {
      alpha = prevScore - WINDOW;
      beta = prevScore + WINDOW;
    } else {
      alpha = -INF;
      beta = INF;
    }

    let depthBestMove: Move = rootMoves[0];
    let depthBestScore = -INF;

    outer:
    while (true) {
      depthBestScore = -INF;
      depthBestMove = rootMoves[0];

      for (let i = 0; i < rootMoves.length; i++) {
        if (globalStop || Date.now() - t0 > timeLimit) {
          globalStop = true;
          break outer;
        }

        const m = rootMoves[i];
        const clone = game.clone();
        clone.makeMove(m);
        const inCheck = clone.isInCheck(clone.turn);
        const extension = inCheck ? 1 : 0;

        let score: number;
        if (i === 0) {
          score = -negamax(clone, depth - 1 + extension, -beta, -alpha, 1, true, moveNum + 1, currentStyle);
        } else {
          score = -negamax(clone, depth - 1 + extension, -alpha - 1, -alpha, 1, true, moveNum + 1, currentStyle);
          if (score > alpha && score < beta) {
            score = -negamax(clone, depth - 1 + extension, -beta, -alpha, 1, true, moveNum + 1, currentStyle);
          }
        }

        if (globalStop) break outer;

        if (score > depthBestScore) {
          depthBestScore = score;
          depthBestMove = m;
        }
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }

      if (!globalStop && depth >= 4) {
        if (depthBestScore <= prevScore - WINDOW) {
          alpha = -INF; beta = prevScore + WINDOW;
          continue;
        } else if (depthBestScore >= prevScore + WINDOW) {
          alpha = prevScore - WINDOW; beta = INF;
          continue;
        }
      }
      break;
    }

    if (!globalStop) {
      bestMove = depthBestMove;
      prevScore = depthBestScore;
      const idx = rootMoves.indexOf(depthBestMove);
      if (idx > 0) {
        rootMoves.splice(idx, 1);
        rootMoves.unshift(depthBestMove);
      }
    }

    if (reportProgress) reportProgress(Math.min(95, Math.round(depth / maxDepth * 95)));
    if (Date.now() - t0 > timeLimit) break;
  }

  globalStop = false;
  if (reportProgress) reportProgress(100);
  return bestMove;
}
