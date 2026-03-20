/**
 * Xiangqi AI Engine — Debugged & Corrected
 *
 * Key fixes over previous version:
 *  1. sortMoves: pre-compute score map keyed by move identity, not broken indexOf
 *  2. PST orientation: rows oriented so that row 0 = Red's home back rank in PST space
 *     pstRow = isRed ? (9-r) : r   (Red home = row 9 on board → pstRow 0; enemy = pstRow 9)
 *  3. Evaluation: from current mover's perspective, consistent sign throughout
 *  4. Aspiration window: track original alpha/beta, not the mutated values
 *  5. Null-move: use original depth (before check extension) for the guard
 *  6. TT pvMove extraction: always read from raw table (not from ttResult which already returned)
 *  7. Cleaner iterative deepening root loop
 */

import { Xiangqi, Move, PieceColor } from './xiangqi';
import { getOpeningMove } from './openingBook';

// ─────────────────────────────────────────────────────────────────
// PIECE VALUES (centipawns)
// ─────────────────────────────────────────────────────────────────
const PV: Record<string, number> = {
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
// Convention (same for both colors):
//   pstRow 0 = own back rank  (king, advisors, elephants start here)
//   pstRow 9 = deepest enemy rank
//
// Red:   pstRow = 9 - r    (board row 9 → pstRow 0, row 0 → pstRow 9)
// Black: pstRow = r        (board row 0 → pstRow 0, row 9 → pstRow 9)
// ─────────────────────────────────────────────────────────────────
const PST: Record<string, number[][]> = {
  // Soldier/Pawn: 0 before crossing river, then increases strongly
  p: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row 0: own back rank — can't be here normally
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row 4: just before river (own side)
    [ 20, 20, 20, 20, 20, 20, 20, 20, 20], // row 5: just crossed river
    [ 40, 45, 50, 55, 60, 55, 50, 45, 40],
    [ 55, 65, 75, 85, 90, 85, 75, 65, 55],
    [ 65, 75, 85, 95,100, 95, 85, 75, 65],
    [ 70, 80, 90,100,105,100, 90, 80, 70], // row 9: enemy back rank
  ],

  // Knight: stronger in the middle, weaker at edges and home row
  h: [
    [  0, 10, 15, 15, 15, 15, 15, 10,  0],
    [ 10, 20, 35, 35, 35, 35, 35, 20, 10],
    [ 15, 35, 55, 65, 65, 65, 55, 35, 15],
    [ 15, 35, 65, 75, 80, 75, 65, 35, 15],
    [ 15, 35, 65, 80, 90, 80, 65, 35, 15],
    [ 15, 35, 65, 80, 80, 80, 65, 35, 15],
    [ 15, 35, 55, 65, 65, 65, 55, 35, 15],
    [ 15, 25, 35, 45, 50, 45, 35, 25, 15],
    [ 10, 15, 25, 30, 30, 30, 25, 15, 10],
    [  0, 10, 15, 15, 15, 15, 15, 10,  0],
  ],

  // Chariot: very strong, slight preference for central files and advanced ranks
  r: [
    [ 50, 55, 55, 60, 60, 60, 55, 55, 50],
    [ 55, 60, 60, 65, 70, 65, 60, 60, 55],
    [ 45, 55, 60, 70, 75, 70, 60, 55, 45],
    [ 45, 55, 60, 75, 80, 75, 60, 55, 45],
    [ 45, 55, 60, 75, 82, 75, 60, 55, 45],
    [ 45, 55, 60, 75, 80, 75, 60, 55, 45],
    [ 45, 55, 60, 70, 75, 70, 60, 55, 45],
    [ 55, 60, 60, 65, 70, 65, 60, 60, 55],
    [ 55, 60, 60, 65, 70, 65, 60, 60, 55],
    [ 50, 55, 55, 60, 60, 60, 55, 55, 50],
  ],

  // Cannon: stronger in center, needs to be active
  c: [
    [  0,  5, 10, 15, 15, 15, 10,  5,  0],
    [  5, 15, 25, 30, 30, 30, 25, 15,  5],
    [  5, 15, 35, 45, 45, 45, 35, 15,  5],
    [  5, 15, 45, 55, 60, 55, 45, 15,  5],
    [  5, 15, 45, 60, 65, 60, 45, 15,  5],
    [  5, 15, 45, 55, 60, 55, 45, 15,  5],
    [  5, 15, 35, 45, 45, 45, 35, 15,  5],
    [  5, 15, 25, 30, 30, 30, 25, 15,  5],
    [  5, 10, 15, 20, 20, 20, 15, 10,  5],
    [  0,  5, 10, 15, 15, 15, 10,  5,  0],
  ],

  // Elephant: stays on own half, guards central positions
  e: [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0, 30,  0,  0,  0, 30,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 25,  0,  0,  0, 35,  0,  0,  0, 25],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],

  // Advisor: stays in palace
  a: [
    [  0,  0,  0, 15,  0, 15,  0,  0,  0],
    [  0,  0,  0,  0, 25,  0,  0,  0,  0],
    [  0,  0,  0, 15,  0, 15,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],

  // King: stays deep in palace, slight bonus for center column
  k: [
    [  0,  0,  0, 40, 50, 40,  0,  0,  0],
    [  0,  0,  0, 35, 45, 35,  0,  0,  0],
    [  0,  0,  0, 30, 40, 30,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
};

// ─────────────────────────────────────────────────────────────────
// MVV-LVA (Most Valuable Victim – Least Valuable Attacker)
// ─────────────────────────────────────────────────────────────────
const VICTIM_VALUE:   Record<string, number> = { k:700, r:600, c:450, h:380, e:250, a:250, p:120 };
const ATTACKER_VALUE: Record<string, number> = { k:  0, r: 60, c: 80, h:100, e:120, a:120, p:140 };

function mvvLva(attacker: string, victim: string): number {
  return (VICTIM_VALUE[victim] ?? 100) * 10 - (ATTACKER_VALUE[attacker] ?? 100);
}

// ─────────────────────────────────────────────────────────────────
// TRANSPOSITION TABLE
// ─────────────────────────────────────────────────────────────────
const TT_SIZE = 1 << 20; // ~1M entries
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

interface TTEntry { hash: number; depth: number; score: number; flag: number; move: Move | null; }
const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null);

/** Encode board state to a 32-bit integer hash */
function boardHash(game: Xiangqi): number {
  let h = game.turn === 'red' ? 0x12345678 : 0x87654321;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p) {
        const t = 'kaehrcp'.indexOf(p.type) + 1;   // 1-7
        const col = p.color === 'red' ? 0 : 8;
        const pos = r * 9 + c;                      // 0-89
        // FNV-1a-like mix
        h ^= (pos * 97 + t * 13 + col * 7);
        h = Math.imul(h, 0x9e3779b9) | 0;
      }
    }
  }
  return h;
}

function ttProbe(hash: number, depth: number, alpha: number, beta: number): { hit: boolean; score: number; move: Move | null } {
  const e = tt[hash & (TT_SIZE - 1)];
  if (!e || e.hash !== hash) return { hit: false, score: 0, move: null };
  const move = e.move;
  if (e.depth >= depth) {
    if (e.flag === TT_EXACT)                   return { hit: true, score: e.score, move };
    if (e.flag === TT_LOWER && e.score >= beta) return { hit: true, score: e.score, move };
    if (e.flag === TT_UPPER && e.score <= alpha)return { hit: true, score: e.score, move };
  }
  // Depth insufficient for cutoff, but still return move for ordering
  return { hit: false, score: 0, move };
}

function ttStore(hash: number, depth: number, score: number, flag: number, move: Move | null) {
  const idx = hash & (TT_SIZE - 1);
  const e = tt[idx];
  if (!e || e.depth <= depth || e.hash !== hash) {
    tt[idx] = { hash, depth, score, flag, move };
  }
}

// ─────────────────────────────────────────────────────────────────
// KILLER MOVES & HISTORY HEURISTIC
// ─────────────────────────────────────────────────────────────────
const MAX_PLY = 64;
const killers: (Move | null)[][] = Array.from({ length: MAX_PLY }, () => [null, null]);

// history[color][fromR][fromC][toSquare]
const history: number[][][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 9 }, () => new Array(90).fill(0))
  )
);

function histGet(color: PieceColor, m: Move): number {
  return history[color === 'red' ? 0 : 1][m.from.r][m.from.c][m.to.r * 9 + m.to.c];
}
function histAdd(color: PieceColor, m: Move, depth: number) {
  history[color === 'red' ? 0 : 1][m.from.r][m.from.c][m.to.r * 9 + m.to.c] += depth * depth;
}

function isKiller(m: Move, ply: number): boolean {
  if (ply >= MAX_PLY) return false;
  const [k0, k1] = killers[ply];
  const eq = (k: Move | null) => k && k.from.r === m.from.r && k.from.c === m.from.c && k.to.r === m.to.r && k.to.c === m.to.c;
  return !!(eq(k0) || eq(k1));
}
function storeKiller(m: Move, ply: number) {
  if (ply >= MAX_PLY) return;
  if (!isKiller(m, ply)) { killers[ply][1] = killers[ply][0]; killers[ply][0] = m; }
}

// ─────────────────────────────────────────────────────────────────
// MOVE ORDERING
// Score each move; higher = try first.
// ─────────────────────────────────────────────────────────────────
function moveScore(
  m: Move,
  game: Xiangqi,
  ply: number,
  pvMove: Move | null,
  color: PieceColor
): number {
  // 1. PV / TT move
  if (pvMove && m.from.r === pvMove.from.r && m.from.c === pvMove.from.c &&
      m.to.r === pvMove.to.r && m.to.c === pvMove.to.c) return 10_000_000;

  // 2. Captures: MVV-LVA
  if (m.captured) {
    const attP = game.getPiece(m.from.r, m.from.c);
    const att = attP ? attP.type : 'p';
    return 2_000_000 + mvvLva(att, m.captured.type);
  }

  // 3. Killer moves
  if (isKiller(m, ply)) return 1_000_000;

  // 4. History heuristic
  return histGet(color, m);
}

/** Sort moves in-place by score descending */
function sortMoves(moves: Move[], game: Xiangqi, ply: number, pvMove: Move | null) {
  const color = game.turn;
  // Pre-compute all scores into a Map keyed by index, then sort by index
  const scores: number[] = moves.map(m => moveScore(m, game, ply, pvMove, color));
  // Zip sort: sort indices by score, then reorder moves
  const indices = moves.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const copy = moves.slice();
  for (let i = 0; i < moves.length; i++) moves[i] = copy[indices[i]];
}

// ─────────────────────────────────────────────────────────────────
// EVALUATION
// Returns score from the perspective of the CURRENT MOVER (positive = good).
// ─────────────────────────────────────────────────────────────────
function evaluate(game: Xiangqi): number {
  const mover = game.turn;
  let redScore = 0;
  let blackScore = 0;

  let redKingFile = -1, blackKingFile = -1;
  let redRookCount = 0, blackRookCount = 0;
  let redPassedPawns = 0, blackPassedPawns = 0;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (!p) continue;

      const isRed = p.color === 'red';
      // pstRow: 0 = own back rank, 9 = enemy back rank
      // Red: home is r=9 → pstRow = 9-r
      // Black: home is r=0 → pstRow = r
      const pstRow = isRed ? (9 - r) : r;
      const base = PV[p.type];
      const pos  = PST[p.type]?.[pstRow]?.[c] ?? 0;

      if (isRed) {
        redScore += base + pos;
        if (p.type === 'k') redKingFile = c;
        if (p.type === 'r') redRookCount++;
        if (p.type === 'p' && r <= 4) redPassedPawns++; // crossed river
      } else {
        blackScore += base + pos;
        if (p.type === 'k') blackKingFile = c;
        if (p.type === 'r') blackRookCount++;
        if (p.type === 'p' && r >= 5) blackPassedPawns++; // crossed river
      }
    }
  }

  // Bonus: connected rooks — hard to compute cheaply, skip
  // Bonus: crossed pawns (already in PST)

  // King safety: penalize exposed king (no advisors/elephants left)
  // Counted implicitly via advisor/elephant PST values

  // Endgame adjustment: rooks more valuable when ahead
  // (already captured via material score)

  let score = redScore - blackScore;
  return mover === 'red' ? score : -score;
}

// ─────────────────────────────────────────────────────────────────
// QUIESCENCE SEARCH
// ─────────────────────────────────────────────────────────────────
function hasKing(game: Xiangqi, color: PieceColor): boolean {
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const p = game.board[r][c];
      if (p && p.type === 'k' && p.color === color) return true;
    }
  return false;
}

const Q_DEPTH_LIMIT = 5;

function qSearch(game: Xiangqi, alpha: number, beta: number, qDepth: number): number {
  // King captured
  if (!hasKing(game, 'red'))   return game.turn === 'red'   ? -90000 : 90000;
  if (!hasKing(game, 'black')) return game.turn === 'black' ? -90000 : 90000;

  const standPat = evaluate(game);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (qDepth <= 0) return alpha;

  const color = game.turn;
  const allMoves = game.getAllValidMoves(color);
  const captures = allMoves.filter(m => m.captured);

  // Sort captures by MVV-LVA
  captures.sort((a, b) => {
    const attA = game.getPiece(a.from.r, a.from.c)?.type ?? 'p';
    const attB = game.getPiece(b.from.r, b.from.c)?.type ?? 'p';
    return mvvLva(attB, b.captured!.type) - mvvLva(attA, a.captured!.type);
  });

  for (const m of captures) {
    // Delta pruning: skip if even winning this piece can't raise alpha
    const gain = VICTIM_VALUE[m.captured!.type] ?? 0;
    if (standPat + gain + 150 < alpha) continue;

    const clone = game.clone();
    clone.makeMove(m);
    const score = -qSearch(clone, -beta, -alpha, qDepth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ─────────────────────────────────────────────────────────────────
// NEGAMAX WITH ALPHA-BETA
// ─────────────────────────────────────────────────────────────────
function negamax(
  game: Xiangqi,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  allowNull: boolean
): number {
  // Terminal: king captured
  if (!hasKing(game, 'red'))   return game.turn === 'red'   ? -90000 + ply : 90000 - ply;
  if (!hasKing(game, 'black')) return game.turn === 'black' ? -90000 + ply : 90000 - ply;

  // Leaf node
  if (depth <= 0) return qSearch(game, alpha, beta, Q_DEPTH_LIMIT);

  const hash = boardHash(game);
  const { hit, score: ttScore, move: ttMove } = ttProbe(hash, depth, alpha, beta);
  if (hit) return ttScore;

  const color = game.turn;
  const inCheck = game.isInCheck(color);

  // Check extension (add 1 ply when in check, before null-move check)
  const extDepth = inCheck ? depth + 1 : depth;

  // Null-move pruning: skip our turn and see if opponent is still bad
  if (allowNull && !inCheck && extDepth >= 3) {
    const R = extDepth >= 6 ? 3 : 2;
    const nullGame = game.clone();
    nullGame.turn = color === 'red' ? 'black' : 'red';
    const nullScore = -negamax(nullGame, extDepth - 1 - R, -beta, -beta + 1, ply + 1, false);
    if (nullScore >= beta) return beta; // null-move cutoff
  }

  const moves = game.getAllValidMoves(color);
  if (moves.length === 0) {
    // Stalemate or checkmate
    return inCheck ? -90000 + ply : 0;
  }

  sortMoves(moves, game, ply, ttMove);

  let bestScore = -Infinity;
  let bestMove: Move | null = null;
  let flag = TT_UPPER;
  let moveIdx = 0;

  for (const m of moves) {
    const clone = game.clone();
    clone.makeMove(m);
    moveIdx++;

    let score: number;

    if (moveIdx === 1) {
      // Full window for first move (PV move)
      score = -negamax(clone, extDepth - 1, -beta, -alpha, ply + 1, true);
    } else {
      // Late-move reductions for quiet, non-check moves
      let doLMR = !inCheck && !m.captured && moveIdx > 3 && extDepth >= 3;
      const reduction = doLMR ? (moveIdx > 6 ? 2 : 1) : 0;

      // Null-window search
      score = -negamax(clone, extDepth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);

      // Re-search if reduced search beats alpha
      if (score > alpha && (reduction > 0 || score < beta)) {
        score = -negamax(clone, extDepth - 1, -beta, -alpha, ply + 1, true);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
    if (score > alpha) {
      alpha = score;
      flag = TT_EXACT;
    }
    if (alpha >= beta) {
      // Beta cutoff
      if (!m.captured) {
        storeKiller(m, ply);
        histAdd(color, m, extDepth);
      }
      ttStore(hash, extDepth, beta, TT_LOWER, m);
      return beta;
    }
  }

  ttStore(hash, extDepth, bestScore, flag, bestMove);
  return bestScore;
}

// ─────────────────────────────────────────────────────────────────
// ROOT SEARCH with Iterative Deepening + Aspiration Windows
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
      const valid = game.getAllValidMoves(game.turn);
      const ok = valid.some(m =>
        m.from.r === bookMove.from.r && m.from.c === bookMove.from.c &&
        m.to.r === bookMove.to.r && m.to.c === bookMove.to.c
      );
      if (ok) { if (reportProgress) reportProgress(100); return bookMove; }
    }
  }

  // Difficulty settings
  //  1=普通  2=村冠  3=镇冠  4=县冠  5=大师
  const maxDepths  = [0, 2, 3,  4,  5,  7];
  const timeLimits = [0, 800, 1800, 3500, 6000, 12000];
  const maxDepth   = maxDepths[Math.max(1, Math.min(5, difficulty))];
  const timeLimit  = timeLimits[Math.max(1, Math.min(5, difficulty))];
  const t0 = Date.now();

  const color = game.turn;
  const rootMoves = game.getAllValidMoves(color);
  if (!rootMoves.length) return null;
  if (rootMoves.length === 1) { if (reportProgress) reportProgress(100); return rootMoves[0]; }

  // Reset per-search heuristics
  for (let i = 0; i < MAX_PLY; i++) killers[i] = [null, null];
  // Note: history table is kept across moves for warm-start ordering (intentional)

  let bestMove: Move = rootMoves[0];
  let prevScore = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    // Aspiration windows (only from depth 3+)
    let lo = depth >= 3 ? prevScore - 60 : -Infinity;
    let hi = depth >= 3 ? prevScore + 60 : Infinity;

    let depthBest: Move | null = null;
    let depthScore = -Infinity;

    // Aspiration loop
    while (true) {
      // Sort root moves: best move from previous depth first
      const sorted = [...rootMoves];
      sorted.sort((a, b) => {
        const aB = a.from.r===bestMove.from.r&&a.from.c===bestMove.from.c&&a.to.r===bestMove.to.r&&a.to.c===bestMove.to.c;
        const bB = b.from.r===bestMove.from.r&&b.from.c===bestMove.from.c&&b.to.r===bestMove.to.r&&b.to.c===bestMove.to.c;
        if (aB) return -1; if (bB) return 1;
        if (a.captured && !b.captured) return -1; if (!a.captured && b.captured) return 1;
        if (a.captured && b.captured) return mvvLva('p', b.captured.type) - mvvLva('p', a.captured.type);
        return 0;
      });

      let alpha = lo;
      let localBest: Move | null = null;
      let localScore = -Infinity;

      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        const clone = game.clone();
        clone.makeMove(m);

        let score: number;
        if (i === 0) {
          score = -negamax(clone, depth - 1, -hi, -alpha, 1, true);
        } else {
          score = -negamax(clone, depth - 1, -alpha - 1, -alpha, 1, true);
          if (score > alpha && score < hi) {
            score = -negamax(clone, depth - 1, -hi, -alpha, 1, true);
          }
        }

        if (score > localScore) {
          localScore = score;
          localBest = m;
        }
        if (score > alpha) alpha = score;

        // Report progress
        if (reportProgress) {
          const pct = Math.round(((depth - 1) / maxDepth * 100) + ((i + 1) / sorted.length) * (100 / maxDepth));
          reportProgress(Math.min(95, pct));
        }

        // Time limit
        if (Date.now() - t0 > timeLimit) {
          if (localBest) bestMove = localBest;
          if (reportProgress) reportProgress(100);
          return bestMove;
        }
      }

      // Check aspiration result
      if (localScore <= lo && lo > -Infinity) {
        lo = -Infinity; // widen lower bound
        continue;
      }
      if (localScore >= hi && hi < Infinity) {
        hi = Infinity; // widen upper bound
        continue;
      }

      depthBest = localBest;
      depthScore = localScore;
      break;
    } // end aspiration loop

    if (depthBest) { bestMove = depthBest; prevScore = depthScore; }
    if (reportProgress) reportProgress(Math.min(95, Math.round(depth / maxDepth * 95)));
    if (Date.now() - t0 > timeLimit) break;
  }

  if (reportProgress) reportProgress(100);
  return bestMove;
}
