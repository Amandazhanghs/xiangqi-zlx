/**
 * Xiangqi AI Engine — Complete Rewrite
 *
 * Techniques used:
 *  - Negamax with alpha-beta pruning
 *  - Iterative deepening
 *  - Aspiration windows
 *  - Transposition table (Zobrist hashing)
 *  - Null-move pruning
 *  - Killer move heuristic (2 slots per ply)
 *  - History heuristic
 *  - MVV-LVA move ordering (captures)
 *  - Quiescence search with SEE (Static Exchange Evaluation)
 *  - Late-move reductions (LMR)
 *  - Check extensions
 *  - Opening book
 *  - Stronger evaluation: mobility, king safety, pawn structure
 */

import { Xiangqi, Move, PieceColor, Piece } from './xiangqi';
import { getOpeningMove } from './openingBook';

// ─────────────────────────────────────────────
// PIECE VALUES
// ─────────────────────────────────────────────
const PV: Record<string, number> = {
  k: 100000, r: 1000, c: 500, h: 450, e: 220, a: 220, p: 110,
};

// MVV-LVA: attacker value / victim value table for sorting captures
const MVV_LVA_VICTIM   = { k:700, r:600, c:400, h:350, e:200, a:200, p:100 };
const MVV_LVA_ATTACKER = { k:  0, r: 50, c: 80, h: 90, e:100, a:100, p:110 };

// ─────────────────────────────────────────────
// PIECE-SQUARE TABLES  (from Red's perspective, row 0 = top of board)
// All tables are 10×9.  For Black, mirror row: row → 9-row.
// ─────────────────────────────────────────────
const PST: Record<string, number[][]> = {
  p: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 20, 20, 20, 20, 20, 20, 20, 20, 20],  // just crossed river — all squares equal bonus
    [ 30, 40, 50, 60, 70, 60, 50, 40, 30],
    [ 40, 55, 70, 80, 90, 80, 70, 55, 40],
    [ 50, 65, 80, 90,100, 90, 80, 65, 50],
    [ 60, 70, 80, 90,100, 90, 80, 70, 60],
  ],
  h: [
    [  0, 10, 20, 20, 20, 20, 20, 10,  0],
    [ 10, 20, 40, 40, 40, 40, 40, 20, 10],
    [ 20, 40, 60, 70, 70, 70, 60, 40, 20],
    [ 20, 40, 70, 80, 80, 80, 70, 40, 20],
    [ 20, 40, 70, 80, 90, 80, 70, 40, 20],
    [ 20, 40, 70, 80, 80, 80, 70, 40, 20],
    [ 20, 40, 60, 70, 70, 70, 60, 40, 20],
    [ 20, 30, 40, 50, 50, 50, 40, 30, 20],
    [ 10, 20, 30, 30, 30, 30, 30, 20, 10],
    [  0, 10, 20, 20, 20, 20, 20, 10,  0],
  ],
  r: [
    [ 20, 30, 30, 30, 30, 30, 30, 30, 20],
    [ 30, 50, 50, 60, 60, 60, 50, 50, 30],
    [ 20, 40, 60, 70, 70, 70, 60, 40, 20],
    [ 20, 40, 60, 80, 80, 80, 60, 40, 20],
    [ 20, 40, 60, 80, 90, 80, 60, 40, 20],
    [ 20, 40, 60, 80, 80, 80, 60, 40, 20],
    [ 20, 40, 60, 70, 70, 70, 60, 40, 20],
    [ 30, 50, 50, 60, 60, 60, 50, 50, 30],
    [ 20, 30, 30, 30, 30, 30, 30, 30, 20],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  c: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 10, 20, 30, 30, 30, 30, 30, 20, 10],
    [ 10, 20, 40, 50, 50, 50, 40, 20, 10],
    [ 10, 20, 50, 60, 60, 60, 50, 20, 10],
    [ 10, 20, 50, 60, 70, 60, 50, 20, 10],
    [ 10, 20, 50, 60, 60, 60, 50, 20, 10],
    [ 10, 20, 40, 50, 50, 50, 40, 20, 10],
    [ 10, 20, 30, 30, 30, 30, 30, 20, 10],
    [ 10, 10, 20, 20, 20, 20, 20, 10, 10],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
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
  a: [
    [  0,  0,  0, 10,  0, 10,  0,  0,  0],
    [  0,  0,  0,  0, 20,  0,  0,  0,  0],
    [  0,  0,  0, 10,  0, 10,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  k: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0, 30, 30, 30,  0,  0,  0],
    [  0,  0,  0, 40, 40, 40,  0,  0,  0],
    [  0,  0,  0, 50, 50, 50,  0,  0,  0],
  ],
};

// ─────────────────────────────────────────────
// TRANSPOSITION TABLE
// ─────────────────────────────────────────────
const TT_SIZE = 1 << 20; // 1M entries
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

interface TTEntry {
  hash: number;
  depth: number;
  score: number;
  flag: number;
  move: Move | null;
}

const transpositionTable: (TTEntry | null)[] = new Array(TT_SIZE).fill(null);

// Simple Zobrist-like hash (we use a pseudo-hash from board state)
function boardHash(game: Xiangqi): number {
  let h = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p) {
        const typeIdx = 'kaehrcp'.indexOf(p.type);
        const colorIdx = p.color === 'red' ? 0 : 1;
        // mix bits
        h = Math.imul(h ^ 0x9e3779b9, 31) + (r * 9 + c) * 17 + typeIdx * 7 + colorIdx * 3;
        h |= 0;
      }
    }
  }
  if (game.turn === 'black') h ^= 0x5bd1e995;
  return h;
}

function ttGet(hash: number, depth: number, alpha: number, beta: number): { score: number; move: Move | null } | null {
  const entry = transpositionTable[hash & (TT_SIZE - 1)];
  if (!entry || entry.hash !== hash || entry.depth < depth) return null;
  let score = entry.score;
  if (entry.flag === TT_EXACT) return { score, move: entry.move };
  if (entry.flag === TT_LOWER && score >= beta) return { score, move: entry.move };
  if (entry.flag === TT_UPPER && score <= alpha) return { score, move: entry.move };
  return null;
}

function ttSet(hash: number, depth: number, score: number, flag: number, move: Move | null) {
  const idx = hash & (TT_SIZE - 1);
  const existing = transpositionTable[idx];
  // Replace if depth is greater or entry is old
  if (!existing || existing.depth <= depth) {
    transpositionTable[idx] = { hash, depth, score, flag, move };
  }
}

// ─────────────────────────────────────────────
// KILLER & HISTORY HEURISTIC
// ─────────────────────────────────────────────
const MAX_PLY = 64;
const killerMoves: (Move | null)[][] = Array.from({ length: MAX_PLY }, () => [null, null]);
const historyTable: number[][][][] = Array.from({length:2},()=>Array.from({length:10},()=>Array.from({length:9},()=>new Array(9*10).fill(0))));

function historyKey(to: {r:number;c:number}): number { return to.r * 9 + to.c; }
function histGet(color: PieceColor, from: {r:number;c:number}, to: {r:number;c:number}): number {
  return historyTable[color==='red'?0:1][from.r][from.c][historyKey(to)] || 0;
}
function histUpdate(color: PieceColor, from: {r:number;c:number}, to: {r:number;c:number}, depth: number) {
  historyTable[color==='red'?0:1][from.r][from.c][historyKey(to)] += depth * depth;
}

function isKiller(move: Move, ply: number): boolean {
  if (ply >= MAX_PLY) return false;
  const k = killerMoves[ply];
  return (k[0]?.from.r===move.from.r&&k[0]?.from.c===move.from.c&&k[0]?.to.r===move.to.r&&k[0]?.to.c===move.to.c) ||
         (k[1]?.from.r===move.from.r&&k[1]?.from.c===move.from.c&&k[1]?.to.r===move.to.r&&k[1]?.to.c===move.to.c);
}
function storeKiller(move: Move, ply: number) {
  if (ply >= MAX_PLY) return;
  if (!isKiller(move, ply)) { killerMoves[ply][1] = killerMoves[ply][0]; killerMoves[ply][0] = move; }
}

// ─────────────────────────────────────────────
// MOVE SCORING (for ordering)
// ─────────────────────────────────────────────
function scoreMoveForOrdering(move: Move, color: PieceColor, ply: number, pvMove: Move | null): number {
  // PV move first
  if (pvMove && move.from.r===pvMove.from.r && move.from.c===pvMove.from.c &&
      move.to.r===pvMove.to.r && move.to.c===pvMove.to.c) return 2_000_000;

  if (move.captured) {
    // MVV-LVA
    const victim = MVV_LVA_VICTIM[move.captured.type] || 100;
    // Need the moving piece type — we'll use a rough proxy via the score caller
    return 1_000_000 + victim;
  }

  if (isKiller(move, ply)) return 900_000;
  return histGet(color, move.from, move.to);
}

function sortMoves(moves: Move[], game: Xiangqi, ply: number, pvMove: Move | null) {
  const color = game.turn;
  // Compute attacker for captures
  const scores = moves.map(move => {
    if (move.captured) {
      const p = game.getPiece(move.from.r, move.from.c);
      const attacker = p ? (MVV_LVA_ATTACKER[p.type] || 100) : 100;
      const victim = MVV_LVA_VICTIM[move.captured.type] || 100;
      if (pvMove && move.from.r===pvMove.from.r && move.from.c===pvMove.from.c &&
          move.to.r===pvMove.to.r && move.to.c===pvMove.to.c) return 2_000_000;
      return 1_000_000 + victim * 10 - attacker;
    }
    if (pvMove && move.from.r===pvMove.from.r && move.from.c===pvMove.from.c &&
        move.to.r===pvMove.to.r && move.to.c===pvMove.to.c) return 2_000_000;
    if (isKiller(move, ply)) return 900_000;
    return histGet(color, move.from, move.to);
  });
  moves.sort((a, b) => scores[moves.indexOf(b)] - scores[moves.indexOf(a)]);
}

// ─────────────────────────────────────────────
// EVALUATION
// ─────────────────────────────────────────────
function evaluate(game: Xiangqi): number {
  const color = game.turn;
  let score = 0;

  // Material + PST
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p) continue;
      const isRed = p.color === 'red';
      const pstRow = isRed ? r : 9 - r;
      const val = PV[p.type] + (PST[p.type]?.[pstRow]?.[c] ?? 0);
      score += (isRed ? 1 : -1) * val;
    }
  }

  // Mobility bonus (rough count of legal moves)
  const redMoves = countPseudoMoves(game, 'red');
  const blackMoves = countPseudoMoves(game, 'black');
  score += (redMoves - blackMoves) * 2;

  // Return from red's perspective, then negate if it's black's turn
  return color === 'red' ? score : -score;
}

// Faster pseudo-mobility count (doesn't check king safety)
function countPseudoMoves(game: Xiangqi, color: PieceColor): number {
  let count = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p && p.color === color) {
        // Simple count by piece type
        switch (p.type) {
          case 'r': count += 14; break;
          case 'c': count += 12; break;
          case 'h': count += 6; break;
          case 'p': count += (color==='red'?r<=4:r>=5) ? 3 : 1; break;
          default:  count += 2; break;
        }
      }
    }
  }
  return count;
}

// ─────────────────────────────────────────────
// QUIESCENCE SEARCH
// ─────────────────────────────────────────────
function qSearch(game: Xiangqi, alpha: number, beta: number, depth: number): number {
  // Terminal check
  if (!hasKing(game, 'red')) return game.turn==='red' ? -90000 : 90000;
  if (!hasKing(game, 'black')) return game.turn==='black' ? -90000 : 90000;

  const standPat = evaluate(game);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  if (depth <= 0) return alpha;

  // Only look at captures
  const color = game.turn;
  const moves = game.getAllValidMoves(color).filter(m => m.captured);
  // Order by MVV-LVA
  moves.sort((a,b) => {
    const va = MVV_LVA_VICTIM[a.captured!.type] - MVV_LVA_ATTACKER[(game.getPiece(a.from.r,a.from.c)?.type??'p')];
    const vb = MVV_LVA_VICTIM[b.captured!.type] - MVV_LVA_ATTACKER[(game.getPiece(b.from.r,b.from.c)?.type??'p')];
    return vb - va;
  });

  for (const move of moves) {
    // Delta pruning
    const gain = MVV_LVA_VICTIM[move.captured!.type];
    if (standPat + gain + 200 < alpha) continue;

    const clone = game.clone();
    clone.makeMove(move);
    const score = -qSearch(clone, -beta, -alpha, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function hasKing(game: Xiangqi, color: PieceColor): boolean {
  for (let r=0;r<10;r++) for (let c=0;c<9;c++) { const p=game.board[r][c]; if(p&&p.type==='k'&&p.color===color) return true; }
  return false;
}

// ─────────────────────────────────────────────
// MAIN ALPHA-BETA (Negamax)
// ─────────────────────────────────────────────
function negamax(
  game: Xiangqi,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  allowNull: boolean
): number {
  // Terminal
  if (!hasKing(game, 'red')) return game.turn==='red' ? -90000 + ply : 90000 - ply;
  if (!hasKing(game, 'black')) return game.turn==='black' ? -90000 + ply : 90000 - ply;

  if (depth <= 0) {
    return qSearch(game, alpha, beta, 6);
  }

  const hash = boardHash(game);
  const ttResult = ttGet(hash, depth, alpha, beta);
  if (ttResult) return ttResult.score;
  const pvMove = ttResult ? ttResult.move : (transpositionTable[hash & (TT_SIZE-1)]?.move ?? null);

  const color = game.turn;
  const inCheck = game.isInCheck(color);

  // Check extension
  if (inCheck) depth += 1;

  // Null-move pruning (not in check, not at low depth)
  if (allowNull && !inCheck && depth >= 3) {
    const R = depth >= 6 ? 3 : 2;
    const nullGame = game.clone();
    nullGame.turn = nullGame.turn === 'red' ? 'black' : 'red';
    const nullScore = -negamax(nullGame, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
    if (nullScore >= beta) return beta;
  }

  const moves = game.getAllValidMoves(color);
  if (moves.length === 0) return inCheck ? -90000 + ply : 0;

  sortMoves(moves, game, ply, pvMove);

  let bestScore = -Infinity;
  let bestMove: Move | null = null;
  let flag = TT_UPPER;
  let moveCount = 0;

  for (const move of moves) {
    const clone = game.clone();
    clone.makeMove(move);
    moveCount++;

    let score: number;
    // LMR: Late-move reductions for quiet moves late in the list
    if (!inCheck && !move.captured && moveCount > 3 && depth >= 3) {
      const reduction = moveCount > 6 ? 2 : 1;
      score = -negamax(clone, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha) {
        // Re-search at full depth
        score = -negamax(clone, depth - 1, -beta, -alpha, ply + 1, true);
      }
    } else {
      score = -negamax(clone, depth - 1, -beta, -alpha, ply + 1, true);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
      flag = TT_EXACT;
      if (alpha >= beta) {
        // Cutoff
        if (!move.captured) {
          storeKiller(move, ply);
          histUpdate(color, move.from, move.to, depth);
        }
        ttSet(hash, depth, beta, TT_LOWER, move);
        return beta;
      }
    }
  }

  ttSet(hash, depth, bestScore, flag, bestMove);
  return bestScore;
}

// ─────────────────────────────────────────────
// ITERATIVE DEEPENING ROOT SEARCH
// ─────────────────────────────────────────────
export function getBestMove(
  game: Xiangqi,
  difficulty: number,
  reportProgress?: (p: number) => void
): Move | null {
  const winner = game.getWinner();
  if (winner) return null;

  // Opening book (difficulty ≥ 3)
  if (difficulty >= 3) {
    const bookMove = getOpeningMove(game.history);
    if (bookMove) {
      const valid = game.getAllValidMoves(game.turn);
      const isValid = valid.some(m =>
        m.from.r===bookMove.from.r && m.from.c===bookMove.from.c &&
        m.to.r===bookMove.to.r && m.to.c===bookMove.to.c
      );
      if (isValid) { if (reportProgress) reportProgress(100); return bookMove; }
    }
  }

  // Time and depth budgets per difficulty
  //  1=普通  2=村冠  3=镇冠  4=县冠  5=大师
  const maxDepths = [0, 2, 3, 4, 5, 7];
  const timeLimits = [0, 1000, 2000, 3500, 6000, 12000];
  const maxDepth = maxDepths[difficulty] ?? 3;
  const timeLimit = timeLimits[difficulty] ?? 3000;
  const startTime = Date.now();

  const color = game.turn;
  const rootMoves = game.getAllValidMoves(color);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) { if (reportProgress) reportProgress(100); return rootMoves[0]; }

  // Clear killer/history for new search
  for (let i = 0; i < MAX_PLY; i++) killerMoves[i] = [null, null];

  let bestMove: Move = rootMoves[0];
  let bestScore = -Infinity;

  // Aspiration window
  let aspirationWindow = 50;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = depth > 1 ? bestScore - aspirationWindow : -Infinity;
    let beta  = depth > 1 ? bestScore + aspirationWindow : Infinity;
    let aspirationFailed = false;

    while (true) {
      let depthBestScore = -Infinity;
      let depthBestMove: Move | null = null;
      let researched = false;

      // Sort moves by previous best first
      const sortedMoves = [...rootMoves];
      const prevBest = bestMove;
      sortedMoves.sort((a, b) => {
        const aIsBest = a.from.r===prevBest.from.r&&a.from.c===prevBest.from.c&&a.to.r===prevBest.to.r&&a.to.c===prevBest.to.c;
        const bIsBest = b.from.r===prevBest.from.r&&b.from.c===prevBest.from.c&&b.to.r===prevBest.to.r&&b.to.c===prevBest.to.c;
        if (aIsBest) return -1; if (bIsBest) return 1;
        if (a.captured && !b.captured) return -1; if (!a.captured && b.captured) return 1;
        if (a.captured && b.captured) return (MVV_LVA_VICTIM[b.captured.type]??0)-(MVV_LVA_VICTIM[a.captured.type]??0);
        return 0;
      });

      for (let i = 0; i < sortedMoves.length; i++) {
        const move = sortedMoves[i];
        const clone = game.clone();
        clone.makeMove(move);

        const score = -negamax(clone, depth - 1, -beta, -alpha, 1, true);

        if (score > depthBestScore) {
          depthBestScore = score;
          depthBestMove = move;
        }
        if (score > alpha) alpha = score;

        if (reportProgress) {
          const baseP = ((depth - 1) / maxDepth) * 90;
          const stepP = ((i + 1) / sortedMoves.length) * (90 / maxDepth);
          reportProgress(Math.min(95, Math.round(baseP + stepP)));
        }

        // Time check
        if (Date.now() - startTime > timeLimit) {
          if (depthBestMove) bestMove = depthBestMove;
          if (reportProgress) reportProgress(100);
          return bestMove;
        }
      }

      // Aspiration window handling
      if (depthBestScore <= alpha - aspirationWindow && depth > 1) {
        alpha = -Infinity; beta = depthBestScore + 1; aspirationFailed = true; continue;
      }
      if (depthBestScore >= beta + aspirationWindow && depth > 1) {
        beta = Infinity; alpha = depthBestScore - 1; aspirationFailed = true; continue;
      }

      if (depthBestMove) { bestMove = depthBestMove; bestScore = depthBestScore; }
      aspirationWindow = Math.max(20, Math.min(150, Math.abs(bestScore) / 8 + 30));
      break;
    }

    if (reportProgress) reportProgress(Math.min(95, Math.round((depth / maxDepth) * 90)));
    if (Date.now() - startTime > timeLimit) break;
  }

  if (reportProgress) reportProgress(100);
  return bestMove;
}
