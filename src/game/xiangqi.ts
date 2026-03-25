export type PieceColor = 'red' | 'black';
export type PieceType = 'k' | 'a' | 'e' | 'h' | 'r' | 'c' | 'p';

export interface Piece {
  id: string;
  color: PieceColor;
  type: PieceType;
  isArmored?: boolean;
  isDrifting?: boolean;
}

export interface Move {
  from: { r: number; c: number };
  to: { r: number; c: number };
  captured?: Piece;
}

// ─── Draw / Violation Result ────────────────────────────────────────
export type DrawReason = 'repetition5' | 'moves120';

export interface RepetitionViolation {
  violator: PieceColor;   // who must change their move
  reason: 'perpetualCheck' | 'perpetualChase';
  forbiddenMoves: Move[]; // moves the violator must NOT make (the repeating moves)
}

// ─── Board position hash ─────────────────────────────────────────────
function boardKey(board: (Piece | null)[][], turn: PieceColor): string {
  let s = turn === 'red' ? 'R' : 'B';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p) {
        s += r.toString(16) + c.toString(16) + (p.color === 'red' ? p.type.toUpperCase() : p.type);
      } else {
        s += '.';
      }
    }
  }
  return s;
}

export class Xiangqi {
  board: (Piece | null)[][];
  turn: PieceColor;
  history: Move[];
  capturedPieces: Piece[];

  // Draw tracking
  positionHistory: Map<string, number>; // position key -> occurrence count
  movesSinceCapture: number;            // half-moves since last capture

  // Board keys parallel to history (key BEFORE each move was made)
  boardKeyHistory: string[];

  constructor() {
    this.board = Array(10).fill(null).map(() => Array(9).fill(null));
    this.turn = 'red';
    this.history = [];
    this.capturedPieces = [];
    this.positionHistory = new Map();
    this.movesSinceCapture = 0;
    this.boardKeyHistory = [];
    this.initBoard();
    // Record initial position
    this._recordPosition();
  }

  initBoard() {
    const initialFen = [
      "rheakaehr",
      ".........",
      ".c.....c.",
      "p.p.p.p.p",
      ".........",
      ".........",
      "P.P.P.P.P",
      ".C.....C.",
      ".........",
      "RHEAKAEHR"
    ];
    let idCounter = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const char = initialFen[r][c];
        if (char !== '.') {
          const color = char === char.toUpperCase() ? 'red' : 'black';
          const type = char.toLowerCase() as PieceType;
          this.board[r][c] = { id: `p_${idCounter++}`, color, type };
        } else {
          this.board[r][c] = null;
        }
      }
    }
  }

  private _recordPosition() {
    const key = boardKey(this.board, this.turn);
    this.positionHistory.set(key, (this.positionHistory.get(key) ?? 0) + 1);
    return key;
  }

  private _removePosition() {
    const key = boardKey(this.board, this.turn);
    const cnt = this.positionHistory.get(key) ?? 1;
    if (cnt <= 1) this.positionHistory.delete(key);
    else this.positionHistory.set(key, cnt - 1);
  }

  clone(): Xiangqi {
    const game = new Xiangqi();
    game.board = this.board.map(row => row.map(p => p ? { ...p } : null));
    game.turn = this.turn;
    game.history = [...this.history];
    game.capturedPieces = [...this.capturedPieces];
    game.positionHistory = new Map(this.positionHistory);
    game.movesSinceCapture = this.movesSinceCapture;
    game.boardKeyHistory = [...this.boardKeyHistory];
    return game;
  }

  getPiece(r: number, c: number): Piece | null {
    if (r < 0 || r > 9 || c < 0 || c > 8) return null;
    return this.board[r][c];
  }

  getValidMoves(r: number, c: number): Move[] {
    const piece = this.getPiece(r, c);
    if (!piece || piece.color !== this.turn) return [];

    const moves: Move[] = [];
    const addMove = (tr: number, tc: number) => {
      if (tr < 0 || tr > 9 || tc < 0 || tc > 8) return;
      const target = this.getPiece(tr, tc);
      if (!target || target.color !== piece.color) {
        moves.push({ from: { r, c }, to: { r: tr, c: tc }, captured: target || undefined });
      }
    };

    const isRed = piece.color === 'red';
    const dir = isRed ? -1 : 1;

    const typesToEvaluate: PieceType[] = [piece.type];
    if (piece.isArmored && piece.type === 'p') {
      typesToEvaluate.push('r', 'h', 'c');
    }

    if (piece.isDrifting && piece.type === 'r') {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 9; j++) {
          if (i === r && j === c) continue;
          addMove(i, j);
        }
      }
      return moves.filter(move => {
        const clone = this.clone();
        clone.makeMove(move, true);
        return !clone.isInCheck(piece.color);
      });
    }

    for (const t of typesToEvaluate) {
      switch (t) {
        case 'k':
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const tr = r + dr, tc = c + dc;
            if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) {
              addMove(tr, tc);
            }
          }
          let tr = r + dir;
          while (tr >= 0 && tr <= 9) {
            const p = this.getPiece(tr, c);
            if (p) {
              if (p.type === 'k' && p.color !== piece.color) addMove(tr, c);
              break;
            }
            tr += dir;
          }
          break;
        case 'a':
          for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const tr = r + dr, tc = c + dc;
            if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) {
              addMove(tr, tc);
            }
          }
          break;
        case 'e':
          for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
            const tr = r + dr, tc = c + dc;
            const eyeR = r + dr / 2, eyeC = c + dc / 2;
            if (tc >= 0 && tc <= 8 && ((isRed && tr >= 5 && tr <= 9) || (!isRed && tr >= 0 && tr <= 4))) {
              if (!this.getPiece(eyeR, eyeC)) addMove(tr, tc);
            }
          }
          break;
        case 'h':
          for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
            const tr = r + dr, tc = c + dc;
            const legR = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
            const legC = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
            if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              if (!this.getPiece(legR, legC)) addMove(tr, tc);
            }
          }
          break;
        case 'r':
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            let tr = r + dr, tc = c + dc;
            while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              const p = this.getPiece(tr, tc);
              if (!p) {
                addMove(tr, tc);
              } else {
                if (p.color !== piece.color) addMove(tr, tc);
                break;
              }
              tr += dr; tc += dc;
            }
          }
          break;
        case 'c':
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            let tr = r + dr, tc = c + dc;
            let jumped = false;
            while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              const p = this.getPiece(tr, tc);
              if (!p) {
                if (!jumped) addMove(tr, tc);
              } else {
                if (!jumped) jumped = true;
                else {
                  if (p.color !== piece.color) addMove(tr, tc);
                  break;
                }
              }
              tr += dr; tc += dc;
            }
          }
          break;
        case 'p':
          addMove(r + dir, c);
          if ((isRed && r <= 4) || (!isRed && r >= 5)) {
            addMove(r, c + 1);
            addMove(r, c - 1);
          }
          break;
      }
    }

    return moves.filter(move => {
      const clone = this.clone();
      clone.makeMove(move, true);
      return !clone.isInCheck(piece.color);
    });
  }

  getAllValidMoves(color: PieceColor): Move[] {
    const moves: Move[] = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.getPiece(r, c);
        if (p && p.color === color) {
          moves.push(...this.getValidMoves(r, c));
        }
      }
    }
    return moves;
  }

  isInCheck(color: PieceColor): boolean {
    let kr = -1, kc = -1;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.getPiece(r, c);
        if (p && p.type === 'k' && p.color === color) { kr = r; kc = c; break; }
      }
    }
    if (kr === -1) return true;

    const oppColor = color === 'red' ? 'black' : 'red';
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let tr = kr + dr, tc = kc + dc;
      let piecesInBetween = 0;
      while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
        const p = this.getPiece(tr, tc);
        if (p) {
          if (p.color === oppColor) {
            if (piecesInBetween === 0 && (p.type === 'r' || p.isArmored || (p.type === 'k' && dc === 0))) return true;
            if (piecesInBetween === 1 && (p.type === 'c' || p.isArmored)) return true;
            if (piecesInBetween === 0 && p.type === 'p') {
              if (oppColor === 'red' && dr === 1 && dc === 0) return true;
              if (oppColor === 'black' && dr === -1 && dc === 0) return true;
              if (dr === 0 && Math.abs(dc) === 1) {
                if (oppColor === 'red' && kr <= 4) return true;
                if (oppColor === 'black' && kr >= 5) return true;
              }
            }
          }
          piecesInBetween++;
        }
        tr += dr; tc += dc;
      }
    }
    for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      const tr = kr + dr, tc = kc + dc;
      if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
        const p = this.getPiece(tr, tc);
        if (p && p.color === oppColor && (p.type === 'h' || p.isArmored)) {
          const hLegR = Math.abs(dr) === 2 ? kr + dr / 2 : tr;
          const hLegC = Math.abs(dc) === 2 ? kc + dc / 2 : tc;
          if (!this.getPiece(hLegR, hLegC)) return true;
        }
      }
    }
    return false;
  }

  // ── Detect which opponent pieces a given move directly threatens (attacks) ──
  // Returns set of piece IDs that are under direct attack after this move.
  // Used for perpetual chase detection.
  getAttackedPieceIds(color: PieceColor): Set<string> {
    const oppColor = color === 'red' ? 'black' : 'red';
    const attacked = new Set<string>();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.getPiece(r, c);
        if (!p || p.color !== color) continue;
        // Get pseudo-legal captures (no need to filter for king safety here)
        const moves = this._getPseudoCaptures(r, c);
        for (const m of moves) {
          const target = this.getPiece(m.to.r, m.to.c);
          if (target && target.color === oppColor) {
            attacked.add(target.id);
          }
        }
      }
    }
    return attacked;
  }

  // Pseudo-legal capture moves for a piece (doesn't filter leaving king in check)
  private _getPseudoCaptures(r: number, c: number): Move[] {
    const piece = this.getPiece(r, c);
    if (!piece) return [];
    const moves: Move[] = [];
    const addCapture = (tr: number, tc: number) => {
      if (tr < 0 || tr > 9 || tc < 0 || tc > 8) return;
      const target = this.getPiece(tr, tc);
      if (target && target.color !== piece.color) {
        moves.push({ from: { r, c }, to: { r: tr, c: tc }, captured: target });
      }
    };
    const isRed = piece.color === 'red';
    const dir = isRed ? -1 : 1;
    switch (piece.type) {
      case 'r':
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          let tr = r + dr, tc = c + dc;
          while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
            const p = this.getPiece(tr, tc);
            if (p) { if (p.color !== piece.color) addCapture(tr, tc); break; }
            tr += dr; tc += dc;
          }
        }
        break;
      case 'c':
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          let tr = r + dr, tc = c + dc;
          let jumped = false;
          while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
            const p = this.getPiece(tr, tc);
            if (p) {
              if (!jumped) jumped = true;
              else { if (p.color !== piece.color) addCapture(tr, tc); break; }
            }
            tr += dr; tc += dc;
          }
        }
        break;
      case 'h':
        for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
          const tr = r + dr, tc = c + dc;
          const legR = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
          const legC = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
          if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8 && !this.getPiece(legR, legC)) addCapture(tr, tc);
        }
        break;
      case 'p':
        addCapture(r + dir, c);
        if ((isRed && r <= 4) || (!isRed && r >= 5)) {
          addCapture(r, c + 1); addCapture(r, c - 1);
        }
        break;
      case 'k':
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const tr = r + dr, tc = c + dc;
          if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) {
            addCapture(tr, tc);
          }
        }
        break;
    }
    return moves;
  }

  // ── Draw by 120 half-moves without capture ───────────────────────
  isDrawBy120(): boolean {
    return this.movesSinceCapture >= 120;
  }

  // ── Draw by position repetition (5 times) ───────────────────────
  isDrawByRepetition5(): boolean {
    const key = boardKey(this.board, this.turn);
    return (this.positionHistory.get(key) ?? 0) >= 5;
  }

  // ─────────────────────────────────────────────────────────────────
  // PERPETUAL CHECK / CHASE DETECTION
  //
  // Algorithm:
  //  1. Look back through history for a repeating cycle (period 2 or 4).
  //  2. For a cycle of period P to qualify:
  //     - The same position has appeared 3+ times.
  //     - One player consistently gives check OR chases (threatens a non-king
  //       piece that they weren't threatening in the position P steps before).
  //  3. Returns which color is the violator and which of their moves to forbid.
  // ─────────────────────────────────────────────────────────────────
  getRepetitionViolation(): RepetitionViolation | null {
    // Need at least 6 board key entries (initial + 6 moves = 7 entries)
    // boardKeyHistory[i] is the key BEFORE history[i] was played
    // So if we have N moves, boardKeyHistory has N entries (keys before each move)
    // Plus the current position key.
    const hLen = this.history.length;
    if (hLen < 6) return null;

    const currentKey = boardKey(this.board, this.turn);
    if ((this.positionHistory.get(currentKey) ?? 0) < 3) return null;

    // Try period 2 and period 4
    for (const period of [2, 4]) {
      const result = this._checkPerpetualForPeriod(period);
      if (result) return result;
    }
    return null;
  }

  private _checkPerpetualForPeriod(period: number): RepetitionViolation | null {
    const hLen = this.history.length;
    if (hLen < period * 3) return null;

    // Check that current position matches position `period` steps back
    const currentKey = boardKey(this.board, this.turn);

    // We need 3 occurrences of the same position with period `period`
    // Positions at steps: current(0), -period, -2*period
    // Verify by checking boardKeyHistory
    // boardKeyHistory[i] = key before history[i] was made

    // After hLen moves, current board is the state AFTER all moves.
    // boardKeyHistory[hLen - k] = key before the k-th-to-last move
    // We want: position after (hLen) moves = position after (hLen - period) moves
    //          = position after (hLen - 2*period) moves
    // But we don't store post-move keys directly... 
    // Instead: current key = boardKeyHistory[hLen - period + ... ]
    // 
    // Actually: boardKeyHistory[i] = key before move i (0-indexed)
    // Position AFTER move i = boardKeyHistory[i+1] (if it exists) = key before move i+1
    // Current position = key after move hLen-1 = what we compute as currentKey
    //
    // Position period moves ago (after move hLen-1-period) = boardKeyHistory[hLen - period]
    // Position 2*period moves ago = boardKeyHistory[hLen - 2*period]

    if (hLen - period < 0 || hLen - 2 * period < 0) return null;

    const keyPeriodBack = this.boardKeyHistory[hLen - period];
    const key2PeriodBack = this.boardKeyHistory[hLen - 2 * period];

    if (!keyPeriodBack || !key2PeriodBack) return null;
    if (currentKey !== keyPeriodBack || currentKey !== key2PeriodBack) return null;

    // We have a cycle! Now determine who is the violator.
    // The cycle consists of `period` moves that repeat.
    // We need to check if one color is perpetually checking or chasing.

    // Reconstruct the game states at each point in the last 2*period moves
    // by replaying from 2*period moves back.
    // Actually we need to replay the board to analyze.

    // Simpler: replay from boardKeyHistory start + use clones
    // Rebuild position at (hLen - 2*period) 
    const stateAt2PBack = this._reconstructStateAt(hLen - 2 * period);
    if (!stateAt2PBack) return null;

    // Replay the last 2*period moves and collect:
    // - Did each move give check to opponent?
    // - Did each move chase (newly attack) a non-king opponent piece?
    type MoveAnalysis = {
      color: PieceColor;
      givesCheck: boolean;
      chasedPieceIds: Set<string>; // newly attacked pieces compared to before
    };

    const analyses: MoveAnalysis[] = [];
    let state = stateAt2PBack;

    for (let i = hLen - 2 * period; i < hLen; i++) {
      const move = this.history[i];
      const movingColor = state.turn;

      // Pieces attacked by movingColor BEFORE the move
      const attackedBefore = state.getAttackedPieceIds(movingColor);

      const nextState = state.clone();
      nextState.makeMove(move, true);

      // Did this move give check?
      const oppColor: PieceColor = movingColor === 'red' ? 'black' : 'red';
      const givesCheck = nextState.isInCheck(oppColor);

      // Pieces attacked by movingColor AFTER the move
      const attackedAfter = nextState.getAttackedPieceIds(movingColor);

      // Newly chased = pieces now attacked that weren't before, excluding king
      const chasedPieceIds = new Set<string>();
      for (const id of attackedAfter) {
        if (!attackedBefore.has(id)) {
          // Find the piece to check it's not a king
          let found = false;
          for (let r = 0; r < 10 && !found; r++) {
            for (let c = 0; c < 9 && !found; c++) {
              const p = nextState.getPiece(r, c);
              if (p && p.id === id && p.type !== 'k') {
                chasedPieceIds.add(id);
                found = true;
              }
            }
          }
        }
      }

      analyses.push({ color: movingColor, givesCheck, chasedPieceIds });
      state = nextState;
    }

    // Check if one player perpetually checks across the cycle
    // The cycle has 2 players alternating. period moves per cycle.
    // Player 0 makes moves at indices 0, 2, 4... (relative)
    // Player 1 makes moves at indices 1, 3, 5... (relative)
    
    // For perpetual check: the same player checks in EVERY one of their turns
    // in both repetitions of the cycle.
    
    // For perpetual chase: the same player chases the same piece(s) in EVERY
    // one of their turns in both repetitions.

    const firstMoveColor = analyses[0].color;
    const secondMoveColor = analyses[1]?.color;

    // Separate analyses by player
    const movesOfFirst = analyses.filter(a => a.color === firstMoveColor);
    const movesOfSecond = secondMoveColor ? analyses.filter(a => a.color === secondMoveColor) : [];

    // Check perpetual check for first player
    if (movesOfFirst.length >= 2 && movesOfFirst.every(a => a.givesCheck)) {
      // Find which moves in the LAST period are the repeating moves
      const lastPeriodStart = hLen - period;
      const forbiddenMoves: Move[] = [];
      for (let i = lastPeriodStart; i < hLen; i++) {
        if (this.history[i] && analyses[i - (hLen - 2 * period)].color === firstMoveColor) {
          forbiddenMoves.push(this.history[i]);
        }
      }
      if (forbiddenMoves.length > 0) {
        return { violator: firstMoveColor, reason: 'perpetualCheck', forbiddenMoves };
      }
    }

    // Check perpetual chase for first player
    if (movesOfFirst.length >= 2) {
      // Find piece IDs that are chased in ALL of first player's moves
      let commonChased: Set<string> | null = null;
      for (const a of movesOfFirst) {
        if (commonChased === null) {
          commonChased = new Set(a.chasedPieceIds);
        } else {
          for (const id of commonChased) {
            if (!a.chasedPieceIds.has(id)) commonChased.delete(id);
          }
        }
      }
      if (commonChased && commonChased.size > 0) {
        const lastPeriodStart = hLen - period;
        const forbiddenMoves: Move[] = [];
        for (let i = lastPeriodStart; i < hLen; i++) {
          if (analyses[i - (hLen - 2 * period)].color === firstMoveColor) {
            forbiddenMoves.push(this.history[i]);
          }
        }
        if (forbiddenMoves.length > 0) {
          return { violator: firstMoveColor, reason: 'perpetualChase', forbiddenMoves };
        }
      }
    }

    // Check perpetual check for second player
    if (movesOfSecond.length >= 2 && movesOfSecond.every(a => a.givesCheck)) {
      const lastPeriodStart = hLen - period;
      const forbiddenMoves: Move[] = [];
      for (let i = lastPeriodStart; i < hLen; i++) {
        if (analyses[i - (hLen - 2 * period)].color === secondMoveColor) {
          forbiddenMoves.push(this.history[i]);
        }
      }
      if (forbiddenMoves.length > 0) {
        return { violator: secondMoveColor!, reason: 'perpetualCheck', forbiddenMoves };
      }
    }

    // Check perpetual chase for second player
    if (movesOfSecond.length >= 2) {
      let commonChased: Set<string> | null = null;
      for (const a of movesOfSecond) {
        if (commonChased === null) {
          commonChased = new Set(a.chasedPieceIds);
        } else {
          for (const id of commonChased) {
            if (!a.chasedPieceIds.has(id)) commonChased.delete(id);
          }
        }
      }
      if (commonChased && commonChased.size > 0) {
        const lastPeriodStart = hLen - period;
        const forbiddenMoves: Move[] = [];
        for (let i = lastPeriodStart; i < hLen; i++) {
          if (analyses[i - (hLen - 2 * period)].color === secondMoveColor) {
            forbiddenMoves.push(this.history[i]);
          }
        }
        if (forbiddenMoves.length > 0) {
          return { violator: secondMoveColor!, reason: 'perpetualChase', forbiddenMoves };
        }
      }
    }

    return null;
  }

  // Reconstruct game state at move index `targetIndex` (after that many moves)
  private _reconstructStateAt(targetIndex: number): Xiangqi | null {
    if (targetIndex < 0 || targetIndex > this.history.length) return null;
    if (targetIndex === 0) {
      // We can't easily reconstruct initial board without re-initializing...
      // Use boardKeyHistory to go back: replay from initial board using history subset
      // Re-create from scratch
      const fresh = new Xiangqi();
      // We need to replay only the first `targetIndex` moves — but 0 means initial
      return fresh._replayMoves(this.history.slice(0, targetIndex));
    }
    const fresh = new Xiangqi();
    return fresh._replayMoves(this.history.slice(0, targetIndex));
  }

  private _replayMoves(moves: Move[]): Xiangqi {
    const g = new Xiangqi();
    for (const m of moves) {
      g.makeMove(m);
    }
    return g;
  }

  // ── Winner / Draw ────────────────────────────────────────────────
  getWinner(): PieceColor | 'draw' | null {
    let redKing = false, blackKing = false;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (p && p.type === 'k') {
          if (p.color === 'red') redKing = true;
          if (p.color === 'black') blackKing = true;
        }
      }
    }
    if (!redKing && !blackKing) return 'draw';
    if (!redKing) return 'black';
    if (!blackKing) return 'red';

    // Draw conditions
    if (this.isDrawBy120()) return 'draw';
    if (this.isDrawByRepetition5()) return 'draw';

    if (this.getAllValidMoves(this.turn).length === 0) {
      return this.turn === 'red' ? 'black' : 'red';
    }
    return null;
  }

  isGameOver(): boolean {
    return this.getWinner() !== null;
  }

  makeMove(move: Move, ignoreTurn = false): boolean {
    const piece = this.getPiece(move.from.r, move.from.c);
    if (!piece) return false;
    if (!ignoreTurn && piece.color !== this.turn) return false;

    // Save board key BEFORE this move
    const keyBefore = boardKey(this.board, this.turn);

    const target = this.board[move.to.r][move.to.c];
    move.captured = target || undefined;
    if (target) {
      this.capturedPieces.push(target);
    }

    this.board[move.to.r][move.to.c] = piece;
    this.board[move.from.r][move.from.c] = null;

    if (!ignoreTurn) {
      this.history.push(move);
      this.boardKeyHistory.push(keyBefore);

      // Update draw counters
      if (target) {
        this.movesSinceCapture = 0;
      } else {
        this.movesSinceCapture++;
      }

      this.turn = this.turn === 'red' ? 'black' : 'red';

      // Record new position
      this._recordPosition();
    }
    return true;
  }

  undo(): boolean {
    const move = this.history.pop();
    if (!move) return false;

    // Remove current position from history
    this._removePosition();

    this.board[move.from.r][move.from.c] = this.board[move.to.r][move.to.c];
    this.board[move.to.r][move.to.c] = move.captured || null;
    if (move.captured) {
      this.capturedPieces.pop();
    }

    // Restore boardKeyHistory
    this.boardKeyHistory.pop();

    this.turn = this.turn === 'red' ? 'black' : 'red';

    // Recalculate movesSinceCapture by scanning back through history
    this.movesSinceCapture = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].captured) break;
      this.movesSinceCapture++;
    }

    return true;
  }

  clearBoard() {
    this.board = Array(10).fill(null).map(() => Array(9).fill(null));
    this.history = [];
    this.capturedPieces = [];
    this.turn = 'red';
    this.positionHistory = new Map();
    this.movesSinceCapture = 0;
    this.boardKeyHistory = [];
  }

  setPiece(r: number, c: number, piece: Piece | null) {
    if (r >= 0 && r <= 9 && c >= 0 && c <= 8) {
      if (piece && !piece.id) {
        piece.id = `p_custom_${Date.now()}_${Math.random()}`;
      }
      this.board[r][c] = piece;
    }
  }

  // Cheat methods
  applyCheatArmor(r: number, c: number) {
    const p = this.getPiece(r, c);
    if (p && p.type === 'p') p.isArmored = true;
  }

  applyCheatDrift(r: number, c: number) {
    const p = this.getPiece(r, c);
    if (p && p.type === 'r') p.isDrifting = true;
  }

  applyCheatRevive(r: number, c: number, piece: Piece) {
    if (!this.getPiece(r, c)) {
      this.board[r][c] = { ...piece, id: `p_revived_${Date.now()}_${Math.random()}` };
      const index = this.capturedPieces.findIndex(p => p.type === piece.type && p.color === piece.color);
      if (index !== -1) this.capturedPieces.splice(index, 1);
    }
  }

  applyCheatBetray(r: number, c: number) {
    const p = this.getPiece(r, c);
    if (p && ['r', 'c', 'h', 'p'].includes(p.type)) {
      p.color = p.color === 'red' ? 'black' : 'red';
    }
  }
}
