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

export type DrawReason = 'repetition5' | 'moves120' | 'noOffensivePieces';

export interface RepetitionViolation {
  violator: PieceColor;
  reason: 'perpetualCheck' | 'perpetualChase';
  forbiddenMoves: Move[];
}

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
  positionHistory: Map<string, number>;
  movesSinceCapture: number;
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
    this._recordPosition();
  }

  private _hasOffensivePieces(color: PieceColor): boolean {
    const offensiveTypes: PieceType[] = ['r', 'h', 'c', 'p'];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (p && p.color === color && offensiveTypes.includes(p.type)) return true;
      }
    }
    return false;
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

  // Returns set of opponent piece IDs that `color` is currently attacking
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

  isDrawByNoOffensivePieces(): boolean {
    return !this._hasOffensivePieces('red') && !this._hasOffensivePieces('black');
  }

  isDrawBy120(): boolean {
    return this.movesSinceCapture >= 120;
  }

  isDrawByRepetition5(): boolean {
    const key = boardKey(this.board, this.turn);
    return (this.positionHistory.get(key) ?? 0) >= 5;
  }

  // ─────────────────────────────────────────────────────────────────
  // PERPETUAL CHECK / CHASE DETECTION
  //
  // Completely rewritten for correctness:
  // - Detects when the same position has occurred 3+ times
  // - Replays the last repeating cycle to classify each move
  // - Returns forbidden moves for the violating side
  // ─────────────────────────────────────────────────────────────────
  getRepetitionViolation(): RepetitionViolation | null {
    const hLen = this.history.length;
    // Need at least 4 moves for one cycle (2 per side)
    if (hLen < 4) return null;

    // Check for cycles of period 2 (most common: A-B-A-B pattern)
    // and period 4 (A-B-C-D-A-B-C-D pattern)
    for (const period of [2, 4]) {
      const result = this._checkPerpetualForPeriod(period);
      if (result) return result;
    }
    return null;
  }

  private _checkPerpetualForPeriod(period: number): RepetitionViolation | null {
    const hLen = this.history.length;
    // Need at least 2 full cycles
    if (hLen < period * 2) return null;

    // Verify the last `period` moves are identical to the `period` moves before that
    // by comparing board positions at matching points
    // Position at index i in boardKeyHistory = board state BEFORE history[i]
    // Current board state = after history[hLen-1]

    // We need: current pos == pos at hLen-period (i.e., boardKeyHistory[hLen-period] wait...)
    // boardKeyHistory[i] = key BEFORE history[i] was made
    // So after history[hLen-1]: current position
    // After history[hLen-1-period]: boardKeyHistory[hLen-period] (key before move hLen-period)
    //   = position after move hLen-period-1

    // Let's denote positions as P[i] = position AFTER history[i-1] (P[0] = initial)
    // P[hLen] = current position
    // boardKeyHistory[i] = P[i] (key before move i = position after move i-1)
    // So P[hLen] = current position
    //    P[hLen - period] = boardKeyHistory[hLen - period]

    // For a cycle of period `period`, we need:
    // P[hLen] == P[hLen - period] == P[hLen - 2*period]

    // P[hLen] (current) - we compute directly
    const currentKey = boardKey(this.board, this.turn);
    
    // P[hLen - period]: this is the position after move (hLen-period-1)
    // = boardKeyHistory[hLen - period] (key BEFORE move hLen-period = position AFTER move hLen-period-1)
    if (hLen - period < 0 || hLen - 2 * period < 0) return null;
    
    const keyAtPeriod = this.boardKeyHistory[hLen - period];
    const keyAt2Period = this.boardKeyHistory[hLen - 2 * period];

    if (!keyAtPeriod || !keyAt2Period) return null;
    if (currentKey !== keyAtPeriod || currentKey !== keyAt2Period) return null;

    // We have confirmed a repeating cycle of length `period`.
    // Now replay the last 2*period moves to classify each move.
    // Start from position at hLen - 2*period
    const startIdx = hLen - 2 * period;
    const startState = this._reconstructStateAt(startIdx);
    if (!startState) return null;

    type MoveAnalysis = {
      color: PieceColor;
      givesCheck: boolean;
      chasedPieceIds: Set<string>; // newly threatened opp pieces (non-king)
    };

    const analyses: MoveAnalysis[] = [];
    let state = startState;

    for (let i = startIdx; i < hLen; i++) {
      const move = this.history[i];
      const movingColor = state.turn;

      // Pieces attacked by movingColor BEFORE the move
      const attackedBefore = state.getAttackedPieceIds(movingColor);

      // Make the move on a clone
      const nextState = state.clone();
      nextState.makeMove(move, true);

      const oppColor: PieceColor = movingColor === 'red' ? 'black' : 'red';
      const givesCheck = nextState.isInCheck(oppColor);

      // Pieces attacked by movingColor AFTER the move
      const attackedAfter = nextState.getAttackedPieceIds(movingColor);

      // Newly chased = attacked after but not before, excluding kings
      const chasedPieceIds = new Set<string>();
      for (const id of attackedAfter) {
        if (!attackedBefore.has(id)) {
          // Verify it's not a king
          outer: for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
              const p = nextState.getPiece(r, c);
              if (p && p.id === id) {
                if (p.type !== 'k') chasedPieceIds.add(id);
                break outer;
              }
            }
          }
        }
      }

      analyses.push({ color: movingColor, givesCheck, chasedPieceIds });
      state = nextState;
    }

    // analyses[0..period-1] = first cycle
    // analyses[period..2*period-1] = second cycle (repeat)
    // The two alternating players in a cycle of period `period`:
    const colors = new Set(analyses.map(a => a.color));
    
    // Helper to get all analyses for a given color across both cycles
    const getAnalysesFor = (color: PieceColor) => analyses.filter(a => a.color === color);
    
    // Helper to build forbidden moves = moves made by `color` in the LAST cycle
    const buildForbidden = (color: PieceColor): Move[] => {
      const forbidden: Move[] = [];
      for (let i = hLen - period; i < hLen; i++) {
        if (this.history[i] !== undefined) {
          const analysisIdx = i - startIdx;
          if (analyses[analysisIdx] && analyses[analysisIdx].color === color) {
            forbidden.push(this.history[i]);
          }
        }
      }
      return forbidden;
    };

    // Check each player for perpetual check or perpetual chase
    for (const color of colors) {
      const colorAnalyses = getAnalysesFor(color);
      if (colorAnalyses.length < 2) continue;

      // Perpetual check: ALL moves by this color give check
      if (colorAnalyses.every(a => a.givesCheck)) {
        const forbidden = buildForbidden(color);
        if (forbidden.length > 0) {
          return { violator: color, reason: 'perpetualCheck', forbiddenMoves: forbidden };
        }
      }

      // Perpetual chase: there exists at least one piece that is chased
      // by ALL moves of this color in the cycle
      // Intersect all chasedPieceIds sets
      let commonChased: Set<string> | null = null;
      for (const a of colorAnalyses) {
        if (commonChased === null) {
          commonChased = new Set(a.chasedPieceIds);
        } else {
          for (const id of Array.from(commonChased)) {
            if (!a.chasedPieceIds.has(id)) commonChased.delete(id);
          }
        }
      }
      if (commonChased && commonChased.size > 0) {
        const forbidden = buildForbidden(color);
        if (forbidden.length > 0) {
          return { violator: color, reason: 'perpetualChase', forbiddenMoves: forbidden };
        }
      }
    }

    return null;
  }

  // Reconstruct game state after `targetIndex` moves from start
 // 在 Xiangqi 类中修改以下私有方法：

  // 优化：通过克隆当前游戏并回溯 undo 来获取历史状态，
  // 这样可以完美支持“打谱”后的自定义棋盘。
  private _reconstructStateAt(targetIndex: number): Xiangqi | null {
    if (targetIndex < 0 || targetIndex > this.history.length) return null;
    
    const g = this.clone();
    // 不断撤销直到达到目标步数
    while (g.history.length > targetIndex) {
      if (!g.undo()) break;
    }
    return g;
  }

  // 优化：确保判定逻辑能正确识别循环
  private _checkPerpetualForPeriod(period: number): RepetitionViolation | null {
    const hLen = this.history.length;
    // 需要至少 2 个完整的循环周期（例如周期2需要4步，周期4需要8步）
    if (hLen < period * 2) return null;

    const currentKey = boardKey(this.board, this.turn);
    const keyAtPeriod = this.boardKeyHistory[hLen - period];
    const keyAt2Period = this.boardKeyHistory[hLen - 2 * period];

    if (!keyAtPeriod || !keyAt2Period) return null;
    
    // 只有当当前局面、一个周期前的局面、两个周期前的局面完全一致时，触发检测
    if (currentKey !== keyAtPeriod || currentKey !== keyAt2Period) return null;

    // 从两个周期前的位置开始分析
    const startIdx = hLen - 2 * period;
    let state = this._reconstructStateAt(startIdx);
    if (!state) return null;

    type MoveAnalysis = {
      color: PieceColor;
      givesCheck: boolean;
      chasedPieceIds: Set<string>;
    };

    const analyses: MoveAnalysis[] = [];

    // 重演最近两个周期的所有着法
    for (let i = startIdx; i < hLen; i++) {
      const move = this.history[i];
      const movingColor = state.turn;

      // 记录动子前被攻击的棋子
      const attackedBefore = state.getAttackedPieceIds(movingColor);

      const nextState = state.clone();
      if (!nextState.makeMove(move)) break;

      const oppColor: PieceColor = movingColor === 'red' ? 'black' : 'red';
      const givesCheck = nextState.isInCheck(oppColor);

      // 记录动子后新增加的攻击目标（排除将帅）
      const attackedAfter = nextState.getAttackedPieceIds(movingColor);
      const chasedPieceIds = new Set<string>();
      for (const id of attackedAfter) {
        if (!attackedBefore.has(id)) {
          // 检查是否为非王棋子
          let isKing = false;
          outer: for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
              const p = nextState.getPiece(r, c);
              if (p && p.id === id && p.type === 'k') { isKing = true; break outer; }
            }
          }
          if (!isKing) chasedPieceIds.add(id);
        }
      }

      analyses.push({ color: movingColor, givesCheck, chasedPieceIds });
      state = nextState;
    }

    const colors: PieceColor[] = ['red', 'black'];
    
    for (const color of colors) {
      const colorAnalyses = analyses.filter(a => a.color === color);
      if (colorAnalyses.length < 2) continue;

      // 判定 1: 长将 (该玩家在循环中所有着法均为将军)
      if (colorAnalyses.every(a => a.givesCheck)) {
        return { 
          violator: color, 
          reason: 'perpetualCheck', 
          forbiddenMoves: this.history.slice(hLen - period).filter((_, i) => {
             const idx = (hLen - period + i) - startIdx;
             return analyses[idx].color === color;
          })
        };
      }

      // 判定 2: 长捉 (该玩家在循环中所有着法都在持续威胁同一个或多个棋子)
      let commonChased: Set<string> | null = null;
      for (const a of colorAnalyses) {
        if (commonChased === null) commonChased = new Set(a.chasedPieceIds);
        else {
          for (const id of Array.from(commonChased)) {
            if (!a.chasedPieceIds.has(id)) commonChased.delete(id);
          }
        }
      }

      if (commonChased && commonChased.size > 0) {
        return { 
          violator: color, 
          reason: 'perpetualChase', 
          forbiddenMoves: this.history.slice(hLen - period).filter((_, i) => {
             const idx = (hLen - period + i) - startIdx;
             return analyses[idx].color === color;
          })
        };
      }
    }
    return null;
  }

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

    if (!this._hasOffensivePieces('red') && !this._hasOffensivePieces('black')) return 'draw';
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

      if (target) {
        this.movesSinceCapture = 0;
      } else {
        this.movesSinceCapture++;
      }

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
    if (move.captured) {
      this.capturedPieces.pop();
    }

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
