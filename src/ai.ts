import { Xiangqi, Move, PieceColor } from './xiangqi';
import { getOpeningMove } from './openingBook';

const PIECE_VALUES = {
  k: 10000,
  r: 900,
  c: 450,
  h: 400,
  e: 200,
  a: 200,
  p: 100
};

const PST = {
  p: [
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [90, 90,110,120,120,120,110, 90, 90],
    [90, 90,110,120,120,120,110, 90, 90],
    [70, 90,110,110,110,110,110, 90, 70],
    [70, 70, 70, 70, 70, 70, 70, 70, 70],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  h: [
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0, 20, 20, 20, 20, 20, 20, 20,  0],
    [ 0, 20, 40, 40, 40, 40, 40, 20,  0],
    [ 0, 20, 40, 60, 60, 60, 40, 20,  0],
    [ 0, 20, 40, 60, 60, 60, 40, 20,  0],
    [ 0, 20, 40, 60, 60, 60, 40, 20,  0],
    [ 0, 20, 40, 40, 40, 40, 40, 20,  0],
    [ 0, 20, 20, 20, 20, 20, 20, 20,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  c: [
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0, 20, 20, 20, 20, 20, 20, 20,  0],
    [ 0, 20, 40, 40, 40, 40, 40, 20,  0],
    [ 0, 20, 40, 60, 60, 60, 40, 20,  0],
    [ 0, 20, 40, 60, 60, 60, 40, 20,  0],
    [ 0, 20, 40, 60, 60, 60, 40, 20,  0],
    [ 0, 20, 40, 40, 40, 40, 40, 20,  0],
    [ 0, 20, 20, 20, 20, 20, 20, 20,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  r: [
    [ 0, 20, 20, 20, 20, 20, 20, 20,  0],
    [ 0, 40, 40, 40, 40, 40, 40, 40,  0],
    [ 0, 40, 60, 60, 60, 60, 60, 40,  0],
    [ 0, 40, 60, 80, 80, 80, 60, 40,  0],
    [ 0, 40, 60, 80, 80, 80, 60, 40,  0],
    [ 0, 40, 60, 80, 80, 80, 60, 40,  0],
    [ 0, 40, 60, 60, 60, 60, 60, 40,  0],
    [ 0, 40, 40, 40, 40, 40, 40, 40,  0],
    [ 0, 20, 20, 20, 20, 20, 20, 20,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  k: [
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0, 10, 10, 10,  0,  0,  0],
    [ 0,  0,  0, 20, 20, 20,  0,  0,  0],
    [ 0,  0,  0, 30, 30, 30,  0,  0,  0],
  ],
  a: [
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0, 10,  0, 10,  0,  0,  0],
    [ 0,  0,  0,  0, 20,  0,  0,  0,  0],
    [ 0,  0,  0, 10,  0, 10,  0,  0,  0],
  ],
  e: [
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0, 10,  0,  0,  0, 10,  0,  0],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 10, 0,  0,  0, 20,  0,  0,  0, 10],
    [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    [ 0,  0, 10,  0,  0,  0, 10,  0,  0],
  ]
};

function evaluate(game: Xiangqi, color: PieceColor): number {
  let score = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.getPiece(r, c);
      if (p) {
        let val = PIECE_VALUES[p.type];
        
        // Add positional value
        if (PST[p.type]) {
          const pstRow = p.color === 'red' ? r : 9 - r;
          val += PST[p.type][pstRow][c];
        }

        if (p.color === color) {
          score += val;
        } else {
          score -= val;
        }
      }
    }
  }
  return score;
}

function quiescenceSearch(game: Xiangqi, alpha: number, beta: number, color: PieceColor, depth: number = 0): number {
  let redKing = false;
  let blackKing = false;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.getPiece(r, c);
      if (p && p.type === 'k') {
        if (p.color === 'red') redKing = true;
        else blackKing = true;
      }
    }
  }
  if (!redKing && !blackKing) return 0; // draw
  if (!redKing) return color === 'black' ? 10000 - depth : -10000 + depth;
  if (!blackKing) return color === 'red' ? 10000 - depth : -10000 + depth;

  const standPat = evaluate(game, color);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  
  if (depth > 4) return standPat;

  const moves = game.getAllValidMoves(color).filter(m => m.captured);
  moves.sort((a, b) => PIECE_VALUES[b.captured!.type] - PIECE_VALUES[a.captured!.type]);

  for (const move of moves) {
    const clone = game.clone();
    clone.makeMove(move);
    const score = -quiescenceSearch(clone, -beta, -alpha, color === 'red' ? 'black' : 'red', depth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

export function getBestMove(
  game: Xiangqi, 
  difficulty: number, 
  reportProgress?: (p: number) => void
): Move | null {
  const winner = game.getWinner();
  if (winner) return null;

  // Use opening book for difficulty 3 (镇冠) and above
  if (difficulty >= 3) {
    const openingMove = getOpeningMove(game.history);
    if (openingMove) {
      // Verify the move is actually valid in the current game state
      const validMoves = game.getAllValidMoves(game.turn);
      const isValid = validMoves.some(m => 
        m.from.r === openingMove.from.r && 
        m.from.c === openingMove.from.c && 
        m.to.r === openingMove.to.r && 
        m.to.c === openingMove.to.c
      );
      if (isValid) {
        if (reportProgress) reportProgress(100);
        return openingMove;
      }
    }
  }

  // Map difficulty to search depth and time limits
  const maxDepth = difficulty === 5 ? 5 : difficulty === 4 ? 4 : difficulty;
  const maxTime = difficulty === 5 ? 8000 : difficulty === 4 ? 4000 : difficulty * 1000;
  const startTime = Date.now();

  const color = game.turn;
  const moves = game.getAllValidMoves(color);
  if (moves.length === 0) return null;

  // Move ordering: captures first (by value), then by PST improvement
  moves.sort((a, b) => {
    if (a.captured && !b.captured) return -1;
    if (!a.captured && b.captured) return 1;
    if (a.captured && b.captured) {
      return PIECE_VALUES[b.captured.type] - PIECE_VALUES[a.captured.type];
    }
    return 0;
  });

  let globalBestMove: Move | null = moves[0];

  for (let d = 1; d <= maxDepth; d++) {
    let depthBestMove: Move | null = null;
    let depthBestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const clone = game.clone();
      clone.makeMove(move);
      
      // Pure optimal score — no random jitter
      const score = -alphaBeta(clone, d - 1, -beta, -alpha, color === 'red' ? 'black' : 'red');
      
      if (score > depthBestScore) {
        depthBestScore = score;
        depthBestMove = move;
      }
      if (depthBestScore > alpha) {
        alpha = depthBestScore;
      }

      if (reportProgress) {
        const baseProgress = ((d - 1) / maxDepth) * 100;
        const depthProgress = ((i + 1) / moves.length) * (100 / maxDepth);
        reportProgress(Math.min(99, Math.round(baseProgress + depthProgress)));
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > maxTime && globalBestMove) {
        if (reportProgress) reportProgress(100);
        return depthBestMove || globalBestMove;
      }
    }
    
    if (depthBestMove) {
      globalBestMove = depthBestMove;
      // Principal Variation move ordering for next depth
      const bestIdx = moves.indexOf(depthBestMove);
      if (bestIdx > 0) {
        moves.splice(bestIdx, 1);
        moves.unshift(depthBestMove);
      }
    }
  }

  if (reportProgress) reportProgress(100);
  return globalBestMove;
}

function alphaBeta(game: Xiangqi, depth: number, alpha: number, beta: number, color: PieceColor): number {
  // Fast king check instead of full getWinner()
  let redKing = false;
  let blackKing = false;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = game.getPiece(r, c);
      if (p && p.type === 'k') {
        if (p.color === 'red') redKing = true;
        else blackKing = true;
      }
    }
  }
  if (!redKing && !blackKing) return 0; // draw
  if (!redKing) return color === 'black' ? 10000 + depth : -10000 - depth;
  if (!blackKing) return color === 'red' ? 10000 + depth : -10000 - depth;

  if (depth === 0) {
    return quiescenceSearch(game, alpha, beta, color);
  }

  const moves = game.getAllValidMoves(color);
  if (moves.length === 0) {
    return -10000 + depth;
  }

  moves.sort((a, b) => {
    if (a.captured && !b.captured) return -1;
    if (!a.captured && b.captured) return 1;
    if (a.captured && b.captured) {
      return PIECE_VALUES[b.captured.type] - PIECE_VALUES[a.captured.type];
    }
    return 0;
  });

  let maxScore = -Infinity;
  for (const move of moves) {
    const clone = game.clone();
    clone.makeMove(move);
    const score = -alphaBeta(clone, depth - 1, -beta, -alpha, color === 'red' ? 'black' : 'red');
    if (score > maxScore) {
      maxScore = score;
    }
    if (maxScore > alpha) {
      alpha = maxScore;
    }
    if (alpha >= beta) {
      break;
    }
  }
  return maxScore;
}
