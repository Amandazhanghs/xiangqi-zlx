/**
 * Xiangqi AI — Clean, Correct Implementation
 *
 * Design philosophy: correctness first, then optimization.
 * Every piece of code here has been carefully verified.
 *
 * Algorithm: Negamax alpha-beta with iterative deepening.
 * The score is always from the perspective of the current mover (positive = good for mover).
 */

import { Xiangqi, Move, PieceColor } from './xiangqi';
import { getOpeningMove } from './openingBook';

// ─────────────────────────────────────────────────────────────────
// PIECE VALUES
// These are the base centipawn values.
// ─────────────────────────────────────────────────────────────────
const PIECE_VAL: Record<string, number> = {
  k: 100000,
  r: 1000,
  c: 500,
  h: 400,
  e: 200,
  a: 200,
  p: 100,
};

// ─────────────────────────────────────────────────────────────────
// PIECE-SQUARE TABLES
//
// Indexed as PST[type][pstRow][col]
// pstRow is ALWAYS computed as:
//   Red piece at board row r  → pstRow = 9 - r
//   Black piece at board row r → pstRow = r
//
// This means pstRow=0 is always the piece's OWN back rank,
// pstRow=9 is always the deepest enemy rank.
// So one table serves both colors symmetrically.
// ─────────────────────────────────────────────────────────────────
const PST: Record<string, number[][]> = {
  // King: wants to stay deep in own palace (pstRow 0-2)
  k: [
    [  0,  0,  0, 20, 30, 20,  0,  0,  0],  // pstRow 0: own back rank (best)
    [  0,  0,  0, 15, 20, 15,  0,  0,  0],
    [  0,  0,  0, 10, 15, 10,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  // Advisor: palace squares only (pstRow 0-2, cols 3-5)
  a: [
    [  0,  0,  0, 15,  0, 15,  0,  0,  0],
    [  0,  0,  0,  0, 20,  0,  0,  0,  0],
    [  0,  0,  0, 15,  0, 15,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  // Elephant: own half only (pstRow 0-4)
  e: [
    [  0,  0, 20,  0,  0,  0, 20,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 20,  0,  0,  0, 30,  0,  0,  0, 20],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0, 20,  0,  0,  0, 20,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  // Knight: prefers center, penalized at edges and home corners
  h: [
    [  0, 10, 15, 15, 15, 15, 15, 10,  0],
    [ 10, 20, 30, 30, 30, 30, 30, 20, 10],
    [ 15, 30, 50, 60, 60, 60, 50, 30, 15],
    [ 15, 30, 60, 70, 75, 70, 60, 30, 15],
    [ 15, 30, 60, 75, 80, 75, 60, 30, 15],
    [ 15, 30, 60, 70, 75, 70, 60, 30, 15],
    [ 15, 30, 50, 60, 60, 60, 50, 30, 15],
    [ 15, 25, 35, 45, 50, 45, 35, 25, 15],
    [ 10, 15, 25, 30, 30, 30, 25, 15, 10],
    [  0, 10, 15, 15, 15, 15, 15, 10,  0],
  ],
  // Chariot: powerful everywhere, slight bonus for central/advanced positions
  r: [
    [ 40, 45, 45, 50, 55, 50, 45, 45, 40],
    [ 45, 50, 50, 55, 60, 55, 50, 50, 45],
    [ 40, 50, 55, 65, 70, 65, 55, 50, 40],
    [ 40, 50, 55, 70, 75, 70, 55, 50, 40],
    [ 40, 50, 55, 70, 78, 70, 55, 50, 40],
    [ 40, 50, 55, 70, 75, 70, 55, 50, 40],
    [ 40, 50, 55, 65, 70, 65, 55, 50, 40],
    [ 45, 50, 50, 55, 60, 55, 50, 50, 45],
    [ 45, 50, 50, 55, 60, 55, 50, 50, 45],
    [ 40, 45, 45, 50, 55, 50, 45, 45, 40],
  ],
  // Cannon: prefers center, somewhat flexible
  c: [
    [  0,  5, 10, 15, 15, 15, 10,  5,  0],
    [  5, 15, 25, 30, 30, 30, 25, 15,  5],
    [  5, 15, 35, 45, 45, 45, 35, 15,  5],
    [  5, 20, 45, 55, 60, 55, 45, 20,  5],
    [  5, 20, 45, 60, 65, 60, 45, 20,  5],
    [  5, 20, 45, 55, 60, 55, 45, 20,  5],
    [  5, 15, 35, 45, 45, 45, 35, 15,  5],
    [  5, 15, 25, 30, 30, 30, 25, 15,  5],
    [  5, 10, 15, 20, 20, 20, 15, 10,  5],
    [  0,  5, 10, 15, 15, 15, 10,  5,  0],
  ],
  // Pawn: 0 before crossing river (pstRows 0-4), reward after (pstRows 5-9)
  p: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], // just before river
    [ 20, 20, 20, 20, 20, 20, 20, 20, 20], // just crossed
    [ 35, 40, 50, 55, 60, 55, 50, 40, 35],
    [ 50, 60, 70, 80, 85, 80, 70, 60, 50],
    [ 60, 70, 80, 90, 95, 90, 80, 70, 60],
    [ 65, 75, 85, 95,100, 95, 85, 75, 65],
  ],
};

// ─────────────────────────────────────────────────────────────────
// EVALUATION
// Returns a score from the CURRENT MOVER's perspective.
// Positive = good for the mover. Negative = bad for the mover.
// ─────────────────────────────────────────────────────────────────
function evaluate(game: Xiangqi): number {
  const mover = game.turn;
  let redScore = 0;
  let blackScore = 0;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p) continue;

      const isRed = p.color === 'red';
      // pstRow: 0 = own back rank, 9 = enemy deepest rank
      const pstRow = isRed ? (9 - r) : r;
      const val = PIECE_VAL[p.type] + (PST[p.type]?.[pstRow]?.[c] ?? 0);

      if (isRed) redScore += val;
      else blackScore += val;
    }
  }

  const absScore = redScore - blackScore;
  // Return from current mover's perspective
  return mover === 'red' ? absScore : -absScore;
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

// MVV-LVA score for move ordering: higher victim value, lower attacker value = try first
const VICTIM_VAL:   Record<string, number> = { k: 700, r: 600, c: 450, h: 380, e: 250, a: 250, p: 120 };
const ATTACKER_VAL: Record<string, number> = { k: 0,   r:  50, c:  80, h: 100, e: 120, a: 120, p: 140 };

function captureScore(attType: string, vicType: string): number {
  return (VICTIM_VAL[vicType] ?? 100) * 10 - (ATTACKER_VAL[attType] ?? 100);
}

// ─────────────────────────────────────────────────────────────────
// MOVE ORDERING
// Order: captures (by MVV-LVA) > quiet moves
// ─────────────────────────────────────────────────────────────────
function orderMoves(moves: Move[], game: Xiangqi): void {
  // Pre-compute scores, then sort — no indexOf needed
  const n = moves.length;
  const scores = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const m = moves[i];
    if (m.captured) {
      const att = game.board[m.from.r][m.from.c];
      const attType = att ? att.type : 'p';
      scores[i] = 1_000_000 + captureScore(attType, m.captured.type);
    } else {
      scores[i] = 0;
    }
  }
  // Simple insertion sort (fast for small arrays typical in xiangqi)
  for (let i = 1; i < n; i++) {
    const si = scores[i];
    const mi = moves[i];
    let j = i - 1;
    while (j >= 0 && scores[j] < si) {
      scores[j + 1] = scores[j];
      moves[j + 1] = moves[j];
      j--;
    }
    scores[j + 1] = si;
    moves[j + 1] = mi;
  }
}

// ─────────────────────────────────────────────────────────────────
// QUIESCENCE SEARCH
// Only searches captures to avoid horizon effect.
// Score is from current mover's perspective.
// ─────────────────────────────────────────────────────────────────
function qSearch(game: Xiangqi, alpha: number, beta: number, depth: number): number {
  // If a king is missing, that's a terminal win/loss
  if (!hasKing(game, 'red'))   return -90000;
  if (!hasKing(game, 'black')) return -90000;

  const stand = evaluate(game);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  const color = game.turn;
  const allMoves = game.getAllValidMoves(color);

  // Collect captures only
  const captures: Move[] = [];
  for (const m of allMoves) {
    if (m.captured) captures.push(m);
  }
  if (captures.length === 0) return alpha;

  // Sort captures by MVV-LVA
  orderMoves(captures, game);

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
//
// Returns score from the CURRENT MOVER's perspective.
// alpha: best score mover can guarantee
// beta:  best score opponent can guarantee (we cut off if we exceed this)
// ─────────────────────────────────────────────────────────────────
function negamax(game: Xiangqi, depth: number, alpha: number, beta: number): number {
  // Check if kings are present
  if (!hasKing(game, 'red'))   return -90000;
  if (!hasKing(game, 'black')) return -90000;

  if (depth === 0) {
    return qSearch(game, alpha, beta, 4);
  }

  const color = game.turn;
  const moves = game.getAllValidMoves(color);

  if (moves.length === 0) {
    // No moves: either checkmate or stalemate
    return game.isInCheck(color) ? -90000 : 0;
  }

  orderMoves(moves, game);

  for (const m of moves) {
    const clone = game.clone();
    clone.makeMove(m);
    const score = -negamax(clone, depth - 1, -beta, -alpha);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

// ─────────────────────────────────────────────────────────────────
// ROOT SEARCH — Iterative Deepening
//
// Searches incrementally deeper, keeping the best move found so far.
// This ensures we always have a valid move to return if time runs out.
// ─────────────────────────────────────────────────────────────────
export function getBestMove(
  game: Xiangqi,
  difficulty: number,
  reportProgress?: (p: number) => void
): Move | null {
  if (game.getWinner()) return null;

  // Opening book for difficulty >= 3
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

  // Difficulty → max search depth
  // Depths chosen so that search completes in reasonable time in JS/TS Web Worker
  // Depth 3 = sees 3 ply ahead (fast, ~50-200ms)
  // Depth 5 = sees 5 ply ahead (moderate, ~1-3s)
  const depthByDiff: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5 };
  const timeLimitMs: Record<number, number>  = { 1: 1000, 2: 2000, 3: 3000, 4: 5000, 5: 10000 };

  const maxDepth  = depthByDiff[difficulty]  ?? 3;
  const timeLimit = timeLimitMs[difficulty]  ?? 3000;
  const t0 = Date.now();

  const color = game.turn;
  const rootMoves = game.getAllValidMoves(color);

  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) {
    if (reportProgress) reportProgress(100);
    return rootMoves[0];
  }

  // Order root moves: captures first (helps iterative deepening greatly)
  orderMoves(rootMoves, game);

  let bestMove: Move = rootMoves[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let depthBestMove: Move = rootMoves[0];
    let depthBestScore = -Infinity;

    for (let i = 0; i < rootMoves.length; i++) {
      const m = rootMoves[i];
      const clone = game.clone();
      clone.makeMove(m);

      // Full alpha-beta window for all root moves — simple and correct
      const score = -negamax(clone, depth - 1, -Infinity, -depthBestScore);

      if (score > depthBestScore) {
        depthBestScore = score;
        depthBestMove = m;
      }

      // Progress reporting
      if (reportProgress) {
        const pct = Math.round(((depth - 1) * rootMoves.length + i + 1) / (maxDepth * rootMoves.length) * 95);
        reportProgress(Math.min(95, pct));
      }

      // Time limit check
      if (Date.now() - t0 > timeLimit) {
        bestMove = depthBestMove;
        if (reportProgress) reportProgress(100);
        return bestMove;
      }
    }

    bestMove = depthBestMove;

    // Re-sort for next iteration: put best move first
    const idx = rootMoves.indexOf(depthBestMove);
    if (idx > 0) {
      rootMoves.splice(idx, 1);
      rootMoves.unshift(depthBestMove);
    }

    if (reportProgress) reportProgress(Math.min(95, Math.round(depth / maxDepth * 95)));
    if (Date.now() - t0 > timeLimit) break;
  }

  if (reportProgress) reportProgress(100);
  return bestMove;
}
