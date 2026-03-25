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
export type DrawReason = 'repetition5' | 'moves120' | 'noOffensivePieces';

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
  getAttackedPieceIds(color: PieceColor): Set<string> {
    const oppColor = color === 'red' ? 'black' : 'red';
    const attacked = new Set<string>();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.getPiece(r, c);
        if (!p || p.color !== color) continue;
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

  // ── Draw Conditions ───────────────────────────────────────────────
  
  isDrawBy120(): boolean {
    return this.movesSinceCapture >= 120;
  }

  isDrawByRepetition5(): boolean {
    const key = boardKey(this.board, this.turn);
    return (this.positionHistory.get(key) ?? 0) >= 5;
  }

  /**
   * 双方均无进攻性棋子（车、马、炮、兵）时判和
   */
  isDrawByNoOffensivePieces(): boolean {
    return !this._hasOffensivePieces('red') && !this._hasOffensivePieces('black');
  }

  private _hasOffensivePieces(color: PieceColor): boolean {
    const offensiveTypes: PieceType[] = ['r', 'h', 'c', 'p'];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (p && p.color === color && offensiveTypes.includes(p.type)) {
          return true;
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────
  // PERPETUAL CHECK / CHASE DETECTION
  // ─────────────────────────────────────────────────────────────────
  getRepetitionViolation(): RepetitionViolation | null {
    const hLen = this.history.length;
    if (hLen < 6) return null;

    const currentKey = boardKey(this.board, this.turn);
    if ((this.positionHistory.get(currentKey) ?? 0) < 3) return null;

    for (const period of [2, 4]) {
      const result = this._checkPerpetualForPeriod(period);
      if (result) return result;
    }
    return null;
  }

  private _checkPerpetualForPeriod(period: number): RepetitionViolation | null {
    const hLen = this.history.length;
    if (hLen < period * 3) return null;

    const currentKey = boardKey(this.board, this.turn);
    if (hLen - period < 0 || hLen - 2 * period < 0) return null;

    const keyPeriodBack = this.boardKeyHistory[hLen - period];
    const key2PeriodBack = this.boardKeyHistory[hLen - 2 * period];

    if (!keyPeriodBack || !key2PeriodBack) return null;
    if (currentKey !== keyPeriodBack || currentKey !== key2PeriodBack) return null;

    const stateAt2PBack = this._reconstructStateAt(hLen - 2 * period);
    if (!stateAt2PBack) return null;

    type MoveAnalysis = {
      color: PieceColor;
      givesCheck: boolean;
      chasedPieceIds: Set<string>;
    };

    const analyses: MoveAnalysis[] = [];
    let state = stateAt2PBack;

    for (let i = hLen - 2 * period; i < hLen; i++) {
      const move = this.history[i];
      const movingColor = state.turn;
      const attackedBefore = state.getAttackedPieceIds(movingColor);
      const nextState = state.clone();
      nextState.makeMove(move, true);
      const oppColor: PieceColor = movingColor === 'red' ? 'black' : 'red';
      const givesCheck = nextState.isInCheck(oppColor);
      const attackedAfter = nextState.getAttackedPieceIds(movingColor);
      const chasedPieceIds = new Set<string>();
      for (const id of attackedAfter) {
        if (!attackedBefore.has(id)) {
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

    const firstMoveColor = analyses[0].color;
    const secondMoveColor = analyses[1]?.color;
    const movesOfFirst = analyses.filter(a => a.color === firstMoveColor);
    const movesOfSecond = secondMoveColor ? analyses.filter(a => a.color === secondMoveColor) : [];

    if (movesOfFirst.length >= 2 && movesOfFirst.every(a => a.givesCheck)) {
      const forbiddenMoves = this._getForbiddenMovesInLastPeriod(hLen, period, firstMoveColor, analyses);
      return { violator: firstMoveColor, reason: 'perpetualCheck', forbiddenMoves };
    }
    if (movesOfFirst.length >= 2) {
      const common = this._getCommonChased(movesOfFirst);
      if (common.size > 0) {
        const forbiddenMoves = this._getForbiddenMovesInLastPeriod(hLen, period, firstMoveColor, analyses);
        return { violator: firstMoveColor, reason: 'perpetualChase', forbiddenMoves };
      }
    }
    if (movesOfSecond.length >= 2 && movesOfSecond.every(a => a.givesCheck)) {
      const forbiddenMoves = this._getForbiddenMovesInLastPeriod(hLen, period, secondMoveColor!, analyses);
      return { violator: secondMoveColor!, reason: 'perpetualCheck', forbiddenMoves };
    }
    if (movesOfSecond.length >= 2) {
      const common = this._getCommonChased(movesOfSecond);
      if (common.size > 0) {
        const forbiddenMoves = this._getForbiddenMovesInLastPeriod(hLen, period, secondMoveColor!, analyses);
        return { violator: secondMoveColor!, reason: 'perpetualChase', forbiddenMoves };
      }
    }
    return null;
  }

  private _getCommonChased(analyses: any[]): Set<string> {
    let common: Set<string> | null = null;
    for (const a of analyses) {
      if (common === null) common = new Set(a.chasedPieceIds);
      else {
        for (const id of common) if (!a.chasedPieceIds.has(id)) common.delete(id);
      }
    }
    return common || new Set();
  }

  private _getForbiddenMovesInLastPeriod(hLen: number, period: number, color: PieceColor, analyses: any[]): Move[] {
    const forbidden: Move[] = [];
    const lastPeriodStart = hLen - period;
    const offset = hLen - 2 * period;
    for (let i = lastPeriodStart; i < hLen; i++) {
      if (analyses[i - offset].color === color) forbidden.push(this.history[i]);
    }
    return forbidden;
  }

  private _reconstructStateAt(targetIndex: number): Xiangqi | null {
    if (targetIndex < 0 || targetIndex > this.history.length) return null;
    const fresh = new Xiangqi();
    return fresh._replayMoves(this.history.slice(0, targetIndex));
  }

  private _replayMoves(moves: Move[]): Xiangqi {
    const g = new Xiangqi();
    for (const m of moves) g.makeMove(m);
    return g;
  }

  // ── Winner / Draw Detection ──────────────────────────────────────
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

    // ── Draw Conditions ──
    // 1. 双方均无进攻棋子
    if (this.isDrawByNoOffensivePieces()) return 'draw';
    // 2. 120步无吃子
    if (this.isDrawBy120()) return 'draw';
    // 3. 同一局面重复5次
    if (this.isDrawByRepetition5()) return 'draw';

    // Checkmate or Stalemate
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
      if (target) this.movesSinceCapture = 0;
      else this.movesSinceCapture++;
      this.turn = this.turn === 'red' ? 'black' : 'red';
      this._recordPosition();
    }
    return true;
  }

  undo(): boolean {
    const move = this.history.pop();
    if (!move) return false;
    this._removePosition();
    this.board[move.from.r][move.from.c] = this.board[move.to.r][move.to.c];
    this.board[move.to.r][move.to.c] = move.captured || null;
    if (move.captured) this.capturedPieces.pop();
    this.boardKeyHistory.pop();
    this.turn = this.turn === 'red' ? 'black' : 'red';
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