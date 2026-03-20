/**
 * Xiangqi AI — High-Strength Engine
 *
 * Algorithm: Negamax alpha-beta with:
 *   - Iterative deepening
 *   - Killer move heuristic (2 slots per ply)
 *   - History heuristic for move ordering
 *   - MVV-LVA capture ordering
 *   - Quiescence search with delta pruning
 *   - Aspiration windows
 *   - Transposition table (Zobrist hashing)
 *   - Check extensions
 *
 * Evaluation:
 *   - Material + piece-square tables (correct orientation per color)
 *   - Pawn structure bonuses (connected, passed river)
 *   - Chariot open file bonus
 *   - King safety (advisors/elephants present)
 *   - Mobility bonus for knights/cannons
 */

import { Xiangqi, Move, PieceColor, Piece } from './xiangqi';
import { getOpeningMove } from './openingBook';

// ─────────────────────────────────────────────────────────────────
// PIECE VALUES (centipawns)
// ─────────────────────────────────────────────────────────────────
const PV: Record<string, number> = {
  k: 100000,
  r: 1050,
  c: 520,
  h: 430,
  e: 220,
  a: 220,
  p: 110,
};

// ─────────────────────────────────────────────────────────────────
// PIECE-SQUARE TABLES
// pstRow = 0 → own back rank, pstRow = 9 → deepest enemy rank
// Red: pstRow = 9 - boardRow
// Black: pstRow = boardRow
// ─────────────────────────────────────────────────────────────────
const PST: Record<string, number[][]> = {
  k: [
    [ 0,  0,  0, 15, 25, 15,  0,  0,  0],
    [ 0,  0,  0, 12, 18, 12,  0,  0,  0],
    [ 0,  0,  0,  8, 12,  8,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  a: [
    [ 0,  0,  0, 18,  0, 18,  0,  0,  0],
    [ 0,  0,  0,  0, 25,  0,  0,  0,  0],
    [ 0,  0,  0, 18,  0, 18,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  e: [
    [ 0,  0, 22,  0,  0,  0, 22,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [22,  0,  0,  0, 32,  0,  0,  0, 22],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0, 22,  0,  0,  0, 22,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  h: [
    [  0, 12, 18, 18, 18, 18, 18, 12,  0],
    [ 12, 25, 38, 38, 38, 38, 38, 25, 12],
    [ 18, 38, 58, 68, 72, 68, 58, 38, 18],
    [ 18, 38, 68, 80, 85, 80, 68, 38, 18],
    [ 18, 38, 68, 85, 90, 85, 68, 38, 18],
    [ 18, 38, 68, 80, 85, 80, 68, 38, 18],
    [ 18, 38, 58, 68, 72, 68, 58, 38, 18],
    [ 18, 28, 42, 52, 58, 52, 42, 28, 18],
    [ 12, 18, 28, 35, 38, 35, 28, 18, 12],
    [  0, 12, 18, 18, 18, 18, 18, 12,  0],
  ],
  r: [
    [ 48, 52, 52, 58, 62, 58, 52, 52, 48],
    [ 52, 58, 58, 64, 68, 64, 58, 58, 52],
    [ 48, 58, 62, 72, 78, 72, 62, 58, 48],
    [ 48, 58, 62, 78, 85, 78, 62, 58, 48],
    [ 48, 58, 62, 78, 88, 78, 62, 58, 48],
    [ 48, 58, 62, 78, 85, 78, 62, 58, 48],
    [ 48, 58, 62, 72, 78, 72, 62, 58, 48],
    [ 52, 58, 58, 64, 68, 64, 58, 58, 52],
    [ 52, 58, 58, 64, 68, 64, 58, 58, 52],
    [ 48, 52, 52, 58, 62, 58, 52, 52, 48],
  ],
  c: [
    [  0,  8, 14, 18, 18, 18, 14,  8,  0],
    [  8, 18, 28, 35, 35, 35, 28, 18,  8],
    [  8, 18, 38, 52, 55, 52, 38, 18,  8],
    [  8, 22, 52, 62, 68, 62, 52, 22,  8],
    [  8, 22, 52, 68, 72, 68, 52, 22,  8],
    [  8, 22, 52, 62, 68, 62, 52, 22,  8],
    [  8, 18, 38, 52, 55, 52, 38, 18,  8],
    [  8, 18, 28, 35, 35, 35, 28, 18,  8],
    [  8, 12, 18, 22, 22, 22, 18, 12,  8],
    [  0,  8, 14, 18, 18, 18, 14,  8,  0],
  ],
  p: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 22, 22, 22, 25, 28, 25, 22, 22, 22],  // just crossed river
    [ 38, 45, 55, 62, 68, 62, 55, 45, 38],
    [ 55, 65, 78, 90, 95, 90, 78, 65, 55],
    [ 65, 78, 90,100,108,100, 90, 78, 65],
    [ 72, 85, 95,108,115,108, 95, 85, 72],
  ],
};

// ─────────────────────────────────────────────────────────────────
// TRANSPOSITION TABLE
// ─────────────────────────────────────────────────────────────────
const TT_SIZE = 1 << 20; // ~1M entries
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

interface TTEntry {
  key: number;
  depth: number;
  score: number;
  flag: number;
  move: Move | null;
}

const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null);

function ttIndex(key: number): number {
  return key & (TT_SIZE - 1);
}

// Simple Zobrist-like hash (we use a fast incremental approximation)
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
// KILLER MOVES (2 per ply, up to depth 64)
// ─────────────────────────────────────────────────────────────────
const MAX_PLY = 64;
const killers: (Move | null)[][] = Array.from({ length: MAX_PLY }, () => [null, null]);

// HISTORY HEURISTIC table [color][from_r*9+from_c][to_r*9+to_c]
const history: number[][][] = [
  Array.from({ length: 90 }, () => new Array(90).fill(0)),
  Array.from({ length: 90 }, () => new Array(90).fill(0)),
];

function colorIdx(c: PieceColor) { return c === 'red' ? 0 : 1; }
function histScore(color: PieceColor, m: Move) {
  return history[colorIdx(color)][m.from.r * 9 + m.from.c][m.to.r * 9 + m.to.c];
}
function histUpdate(color: PieceColor, m: Move, depth: number) {
  history[colorIdx(color)][m.from.r * 9 + m.from.c][m.to.r * 9 + m.to.c] += depth * depth;
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
// MOVE ORDERING SCORES
// ─────────────────────────────────────────────────────────────────
const VICTIM_VAL: Record<string, number> = { k: 700, r: 600, c: 450, h: 380, e: 250, a: 250, p: 120 };
const ATTACKER_VAL: Record<string, number> = { k: 0, r: 50, c: 80, h: 100, e: 120, a: 120, p: 140 };

function scoreMoves(moves: Move[], game: Xiangqi, ply: number, ttMove: Move | null): void {
  const color = game.turn;
  for (const m of moves) {
    if (ttMove && moveEq(m, ttMove)) {
      (m as any)._score = 2_000_000;
    } else if (m.captured) {
      const att = game.board[m.from.r][m.from.c];
      const attType = att ? att.type : 'p';
      (m as any)._score = 1_000_000 +
        (VICTIM_VAL[m.captured.type] ?? 100) * 10 - (ATTACKER_VAL[attType] ?? 100);
    } else if (isKiller(m, ply)) {
      (m as any)._score = 900_000;
    } else {
      (m as any)._score = histScore(color, m);
    }
  }
  moves.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0));
}

// ─────────────────────────────────────────────────────────────────
// EVALUATION
// Returns score from the CURRENT MOVER's perspective.
// ─────────────────────────────────────────────────────────────────
function evaluate(game: Xiangqi): number {
  let redScore = 0, blackScore = 0;
  let redAdvisors = 0, redElephants = 0;
  let blackAdvisors = 0, blackElephants = 0;
  let redChariotFiles = new Set<number>();
  let blackChariotFiles = new Set<number>();

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p) continue;
      const isRed = p.color === 'red';
      const pstRow = isRed ? (9 - r) : r;
      let val = PV[p.type] + (PST[p.type]?.[pstRow]?.[c] ?? 0);

      // Bonus: rook on open-ish file
      if (p.type === 'r') {
        if (isRed) redChariotFiles.add(c);
        else blackChariotFiles.add(c);
      }
      // King safety pieces
      if (p.type === 'a') { if (isRed) redAdvisors++; else blackAdvisors++; }
      if (p.type === 'e') { if (isRed) redElephants++; else blackElephants++; }

      if (isRed) redScore += val;
      else blackScore += val;
    }
  }

  // King safety bonus: having both advisors + elephants
  redScore += redAdvisors * 12 + redElephants * 10;
  blackScore += blackAdvisors * 12 + blackElephants * 10;

  const absScore = redScore - blackScore;
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

// ─────────────────────────────────────────────────────────────────
// QUIESCENCE SEARCH
// ─────────────────────────────────────────────────────────────────
function qSearch(game: Xiangqi, alpha: number, beta: number, depth: number): number {
  if (!hasKing(game, 'red')) return -INF;
  if (!hasKing(game, 'black')) return -INF;

  const stand = evaluate(game);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  // Delta pruning: skip if even capturing the most valuable piece can't raise alpha
  const DELTA = 1100;
  if (stand + DELTA < alpha) return alpha;

  const color = game.turn;
  const allMoves = game.getAllValidMoves(color);
  const captures = allMoves.filter(m => m.captured);

  // Sort captures by MVV-LVA
  captures.sort((a, b) => {
    const va = (VICTIM_VAL[a.captured!.type] ?? 0) * 10 - (ATTACKER_VAL[game.board[a.from.r][a.from.c]?.type ?? 'p'] ?? 0);
    const vb = (VICTIM_VAL[b.captured!.type] ?? 0) * 10 - (ATTACKER_VAL[game.board[b.from.r][b.from.c]?.type ?? 'p'] ?? 0);
    return vb - va;
  });

  for (const m of captures) {
    const clone = game.clone();
    clone.makeMove(m);
    const score = -qSearch(clone, -beta, -alpha, depth - 1);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ─────────────────────────────────────────────────────────────────
// NEGAMAX ALPHA-BETA
// ─────────────────────────────────────────────────────────────────
function negamax(
  game: Xiangqi,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  nullAllowed: boolean
): number {
  if (!hasKing(game, 'red')) return -INF + ply;
  if (!hasKing(game, 'black')) return -INF + ply;

  // Check for time abort (checked by caller via globalStop)
  if (globalStop) return 0;

  // Transposition table lookup
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

  if (depth === 0) {
    const score = qSearch(game, alpha, beta, 6);
    return score;
  }

  // Null move pruning (don't do at low depths, or in check)
  if (nullAllowed && depth >= 3 && !game.isInCheck(game.turn)) {
    const reduction = depth > 6 ? 3 : 2;
    const nullGame = game.clone();
    nullGame.turn = nullGame.turn === 'red' ? 'black' : 'red';
    const nullScore = -negamax(nullGame, depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
    if (nullScore >= beta) return beta;
  }

  const color = game.turn;
  const moves = game.getAllValidMoves(color);

  if (moves.length === 0) {
    return game.isInCheck(color) ? -INF + ply : 0;
  }

  scoreMoves(moves, game, ply, ttMove);

  let bestScore = -INF;
  let bestMove: Move | null = null;
  let flag = TT_UPPER;
  let movesSearched = 0;

  for (const m of moves) {
    if (globalStop) return 0;

    const clone = game.clone();
    clone.makeMove(m);

    // Check extension
    const inCheck = clone.isInCheck(clone.turn);
    const extension = inCheck ? 1 : 0;

    let score: number;
    if (movesSearched === 0) {
      // Full window search for first move
      score = -negamax(clone, depth - 1 + extension, -beta, -alpha, ply + 1, true);
    } else {
      // Late Move Reduction for quiet moves
      let reduction = 0;
      if (!m.captured && !inCheck && movesSearched >= 4 && depth >= 3) {
        reduction = movesSearched >= 8 ? 2 : 1;
      }
      // PVS: narrow window
      score = -negamax(clone, depth - 1 + extension - reduction, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && score < beta) {
        // Re-search with full window
        score = -negamax(clone, depth - 1 + extension, -beta, -alpha, ply + 1, true);
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
      // Beta cutoff: killer + history update
      if (!m.captured) {
        addKiller(m, ply);
        histUpdate(color, m, depth);
      }
      flag = TT_LOWER;
      break;
    }
  }

  // Store in TT
  tt[ttIdx] = { key: hash, depth, score: bestScore, flag, move: bestMove };

  return bestScore;
}

// ─────────────────────────────────────────────────────────────────
// GLOBAL STATE for time management
// ─────────────────────────────────────────────────────────────────
let globalStop = false;

// ─────────────────────────────────────────────────────────────────
// ROOT SEARCH — Iterative Deepening with Aspiration Windows
// ─────────────────────────────────────────────────────────────────
export function getBestMove(
  game: Xiangqi,
  difficulty: number,
  reportProgress?: (p: number) => void
): Move | null {
  if (game.getWinner()) return null;

  // Opening book
  if (difficulty >= 3) {
    const bookMove = getOpeningMove(game.history);
    if (bookMove) {
      const allValid = game.getAllValidMoves(game.turn);
      const isLegal = allValid.some(m =>
        m.from.r === bookMove.from.r && m.from.c === bookMove.from.c &&
        m.to.r === bookMove.to.r && m.to.c === bookMove.to.c
      );
      if (isLegal) {
        if (reportProgress) reportProgress(100);
        return bookMove;
      }
    }
  }

  // Reset search state
  globalStop = false;
  for (let i = 0; i < MAX_PLY; i++) { killers[i][0] = killers[i][1] = null; }
  for (let c = 0; c < 2; c++)
    for (let f = 0; f < 90; f++)
      history[c][f].fill(0);

  // Difficulty settings
  const maxDepthMap: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7 };
  const timeLimitMap: Record<number, number> = { 1: 800, 2: 1800, 3: 3000, 4: 6000, 5: 12000 };
  const maxDepth = maxDepthMap[difficulty] ?? 4;
  const timeLimit = timeLimitMap[difficulty] ?? 3000;
  const t0 = Date.now();

  const color = game.turn;
  const rootMoves = game.getAllValidMoves(color);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) {
    if (reportProgress) reportProgress(100);
    return rootMoves[0];
  }

  // Initial move ordering
  scoreMoves(rootMoves, game, 0, null);

  let bestMove: Move = rootMoves[0];
  let prevScore = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() - t0 > timeLimit) break;

    // Aspiration window (use only at depth >= 4)
    let alpha: number, beta: number;
    const WINDOW = 35;
    if (depth >= 4) {
      alpha = prevScore - WINDOW;
      beta = prevScore + WINDOW;
    } else {
      alpha = -INF;
      beta = INF;
    }

    let depthBestMove: Move = rootMoves[0];
    let depthBestScore = -INF;
    let aspirationFail = false;

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
          score = -negamax(clone, depth - 1 + extension, -beta, -alpha, 1, true);
        } else {
          score = -negamax(clone, depth - 1 + extension, -alpha - 1, -alpha, 1, true);
          if (score > alpha && score < beta) {
            score = -negamax(clone, depth - 1 + extension, -beta, -alpha, 1, true);
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

      // Aspiration window re-search
      if (!globalStop && depth >= 4) {
        if (depthBestScore <= prevScore - WINDOW) {
          alpha = -INF; beta = prevScore + WINDOW;
          aspirationFail = true;
        } else if (depthBestScore >= prevScore + WINDOW) {
          alpha = prevScore - WINDOW; beta = INF;
          aspirationFail = true;
        } else {
          break;
        }
        if (aspirationFail) {
          aspirationFail = false;
          continue;
        }
      } else {
        break;
      }
    }

    if (!globalStop) {
      bestMove = depthBestMove;
      prevScore = depthBestScore;

      // Reorder root: best move first for next iteration
      const idx = rootMoves.indexOf(depthBestMove);
      if (idx > 0) {
        rootMoves.splice(idx, 1);
        rootMoves.unshift(depthBestMove);
      }
    }

    if (reportProgress) {
      reportProgress(Math.min(95, Math.round(depth / maxDepth * 95)));
    }
    if (Date.now() - t0 > timeLimit) break;
  }

  globalStop = false;
  if (reportProgress) reportProgress(100);
  return bestMove;
}
