export type PieceColor = 'red' | 'black';
export type PieceType = 'k' | 'a' | 'e' | 'h' | 'r' | 'c' | 'p';

export interface Piece {
  id: string;
  color: PieceColor;
  type: PieceType;
  isArmored?: boolean; // 铁甲：兵可具有车马炮的功能
  isDrifting?: boolean; // 漂移：车可全图瞬移
}

export interface Move {
  from: { r: number; c: number };
  to: { r: number; c: number };
  captured?: Piece;
}

// ─── 违规/和棋结果 ────────────────────────────────────────
export type DrawReason = 'repetition5' | 'moves120' | 'noOffensivePieces';

export interface RepetitionViolation {
  violator: PieceColor;   // 违规方
  reason: 'perpetualCheck' | 'perpetualChase';
  forbiddenMoves: Move[]; // 导致重复的违规着法
}

// ─── 局面哈希函数 ─────────────────────────────────────────────
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
  boardKeyHistory: string[]; // 存储每次移动前的局面 Key

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

  // ─── 移动生成 (包含作弊逻辑) ───────────────────────────────────
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

    // 确定当前棋子可执行的所有逻辑类型
    const typesToEvaluate: PieceType[] = [piece.type];
    if (piece.isArmored && piece.type === 'p') {
      typesToEvaluate.push('r', 'h', 'c');
    }

    // 漂移车特殊逻辑
    if (piece.isDrifting && piece.type === 'r') {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 9; j++) {
          if (i === r && j === c) continue;
          addMove(i, j);
        }
      }
    } else {
      for (const t of typesToEvaluate) {
        switch (t) {
          case 'k':
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
              const tr = r + dr, tc = c + dc;
              if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) addMove(tr, tc);
            }
            // 将帅对脸
            let trk = r + dir;
            while (trk >= 0 && trk <= 9) {
              const p = this.getPiece(trk, c);
              if (p) { if (p.type === 'k' && p.color !== piece.color) addMove(trk, c); break; }
              trk += dir;
            }
            break;
          case 'a':
            for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
              const tr = r + dr, tc = c + dc;
              if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) addMove(tr, tc);
            }
            break;
          case 'e':
            for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
              const tr = r + dr, tc = c + dc;
              const eyeR = r + dr / 2, eyeC = c + dc / 2;
              if (tc >= 0 && tc <= 8 && !this.getPiece(eyeR, eyeC) && ((isRed && tr >= 5 && tr <= 9) || (!isRed && tr >= 0 && tr <= 4))) addMove(tr, tc);
            }
            break;
          case 'h':
            for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
              const tr = r + dr, tc = c + dc;
              const legR = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
              const legC = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
              if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8 && !this.getPiece(legR, legC)) addMove(tr, tc);
            }
            break;
          case 'r':
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
              let tr = r + dr, tc = c + dc;
              while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
                const p = this.getPiece(tr, tc);
                if (!p) addMove(tr, tc);
                else { if (p.color !== piece.color) addMove(tr, tc); break; }
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
                if (!p) { if (!jumped) addMove(tr, tc); }
                else { if (!jumped) jumped = true; else { if (p.color !== piece.color) addMove(tr, tc); break; } }
                tr += dr; tc += dc;
              }
            }
            break;
          case 'p':
            addMove(r + dir, c);
            const isOver = isRed ? r <= 4 : r >= 5;
            if (isOver) { addMove(r, c + 1); addMove(r, c - 1); }
            break;
        }
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
        if (p && p.color === color) moves.push(...this.getValidMoves(r, c));
      }
    }
    return moves;
  }

  // ─── 状态检测辅助 ───────────────────────────────────────────
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
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (p && p.color === oppColor) {
          const caps = this._getPseudoCaptures(r, c);
          if (caps.some(m => m.to.r === kr && m.to.c === kc)) return true;
        }
      }
    }
    return false;
  }

  // 生成攻击动作（用于长将、长捉检测，忽略国王安全）
  private _getPseudoCaptures(r: number, c: number): Move[] {
    const piece = this.getPiece(r, c);
    if (!piece) return [];
    const caps: Move[] = [];
    const addCap = (tr: number, tc: number) => {
      if (tr < 0 || tr > 9 || tc < 0 || tc > 8) return;
      const target = this.getPiece(tr, tc);
      if (target && target.color !== piece.color) caps.push({ from: { r, c }, to: { r: tr, c: tc }, captured: target });
    };

    const isRed = piece.color === 'red';
    const types = [piece.type];
    if (piece.isArmored && piece.type === 'p') types.push('r', 'h', 'c');

    for (const t of types) {
      if (piece.isDrifting && t === 'r') {
        for (let i = 0; i < 10; i++) for (let j = 0; j < 9; j++) addCap(i, j);
        continue;
      }
      switch (t) {
        case 'r':
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            let tr = r + dr, tc = c + dc;
            while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              const p = this.getPiece(tr, tc);
              if (p) { if (p.color !== piece.color) addCap(tr, tc); break; }
              tr += dr; tc += dc;
            }
          }
          break;
        case 'c':
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            let tr = r + dr, tc = c + dc, jumped = false;
            while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              const p = this.getPiece(tr, tc);
              if (p) { if (!jumped) jumped = true; else { if (p.color !== piece.color) addCap(tr, tc); break; } }
              tr += dr; tc += dc;
            }
          }
          break;
        case 'h':
          for (const [dr, dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
            const tr = r+dr, tc = c+dc, lr = r+(Math.abs(dr)===2?dr/2:0), lc = c+(Math.abs(dc)===2?dc/2:0);
            if (tr>=0 && tr<=9 && tc>=0 && tc<=8 && !this.getPiece(lr, lc)) addCap(tr, tc);
          }
          break;
        case 'p':
          const dir = isRed ? -1 : 1;
          addCap(r + dir, c);
          if (isRed ? r <= 4 : r >= 5) { addCap(r, c + 1); addCap(r, c - 1); }
          break;
        case 'k':
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) addCap(r+dr, c+dc);
          // 对脸将判定
          let trk = r + (isRed ? -1 : 1);
          while (trk >= 0 && trk <= 9) {
            const p = this.getPiece(trk, c);
            if (p) { if (p.type === 'k' && p.color !== piece.color) addCap(trk, c); break; }
            trk += (isRed ? -1 : 1);
          }
          break;
      }
    }
    return caps;
  }

  // ─── 长将/长捉逻辑 ──────────────────────────────────────────

  private _isValuableTarget(p: Piece, r: number): boolean {
    if (['r', 'h', 'c'].includes(p.type)) return true; // 车马炮计捉
    if (p.type === 'p') return p.color === 'red' ? r <= 4 : r >= 5; // 过河兵计捉
    return false; // 帅仕相不计捉
  }

  private _getChasedPieceIds(color: PieceColor): Set<string> {
    const chased = new Set<string>();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (!p || p.color !== color) continue;
        if (!['r', 'h', 'c', 'p'].includes(p.type)) continue;
        const caps = this._getPseudoCaptures(r, c);
        for (const m of caps) {
          const target = this.getPiece(m.to.r, m.to.c);
          if (target && target.color !== color && this._isValuableTarget(target, m.to.r)) {
            chased.add(target.id);
          }
        }
      }
    }
    return chased;
  }

  getRepetitionViolation(): RepetitionViolation | null {
    const hLen = this.history.length;
    const currentKey = boardKey(this.board, this.turn);
    if ((this.positionHistory.get(currentKey) ?? 0) < 3) return null;

    for (const period of [2, 4, 6]) {
      if (hLen < period * 2) continue;
      const key1 = this.boardKeyHistory[hLen - period];
      const key2 = this.boardKeyHistory[hLen - 2 * period];
      if (currentKey === key1 && currentKey === key2) return this._analyzeCycle(period);
    }
    return null;
  }

  private _analyzeCycle(period: number): RepetitionViolation | null {
    const hLen = this.history.length;
    const startIndex = hLen - 2 * period;
    let tempGame = this._reconstructStateAt(startIndex);

    const stats = {
      red: { allCheck: true, allChase: true, moveCount: 0 },
      black: { allCheck: true, allChase: true, moveCount: 0 }
    };

    for (let i = startIndex; i < hLen; i++) {
      const move = this.history[i];
      const actor = tempGame.turn;
      const opp = actor === 'red' ? 'black' : 'red';
      tempGame.makeMove(move, true);

      const isCheck = tempGame.isInCheck(opp);
      const isChase = tempGame._getChasedPieceIds(actor).size > 0;

      stats[actor].allCheck = stats[actor].allCheck && isCheck;
      stats[actor].allChase = stats[actor].allChase && isChase;
      stats[actor].moveCount++;
    }

    for (const color of ['red', 'black'] as PieceColor[]) {
      const s = stats[color];
      if (s.moveCount > 0) {
        if (s.allCheck) return { violator: color, reason: 'perpetualCheck', forbiddenMoves: this._getHistoryMoves(period, color) };
        if (s.allChase) return { violator: color, reason: 'perpetualChase', forbiddenMoves: this._getHistoryMoves(period, color) };
      }
    }
    return null;
  }

  private _getHistoryMoves(period: number, color: PieceColor): Move[] {
    const moves: Move[] = [];
    const hLen = this.history.length;
    for (let i = hLen - period; i < hLen; i++) {
      const moveColor = ((hLen - i) % 2 === 0) ? this.turn : (this.turn === 'red' ? 'black' : 'red');
      if (moveColor === color) moves.push(this.history[i]);
    }
    return moves;
  }

  private _reconstructStateAt(index: number): Xiangqi {
    const g = new Xiangqi(); // 会重新 initBoard
    for (let i = 0; i < index; i++) g.makeMove(this.history[i]);
    return g;
  }

  // ─── 游戏流程控制 ──────────────────────────────────────────

  private _recordPosition() {
    const key = boardKey(this.board, this.turn);
    this.positionHistory.set(key, (this.positionHistory.get(key) ?? 0) + 1);
  }

  private _removePosition() {
    const key = boardKey(this.board, this.turn);
    const cnt = this.positionHistory.get(key) ?? 1;
    if (cnt <= 1) this.positionHistory.delete(key);
    else this.positionHistory.set(key, cnt - 1);
  }

  makeMove(move: Move, ignoreTurn = false): boolean {
    const piece = this.getPiece(move.from.r, move.from.c);
    if (!piece) return false;
    if (!ignoreTurn && piece.color !== this.turn) return false;

    const keyBefore = boardKey(this.board, this.turn);
    const target = this.board[move.to.r][move.to.c];
    move.captured = target || undefined;

    if (target) this.capturedPieces.push(target);
    this.board[move.to.r][move.to.c] = piece;
    this.board[move.from.r][move.from.c] = null;

    if (!ignoreTurn) {
      this.history.push(move);
      this.boardKeyHistory.push(keyBefore);
      this.movesSinceCapture = target ? 0 : this.movesSinceCapture + 1;
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
    
    // 重新计算不食子步数
    this.movesSinceCapture = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i].captured) break;
        this.movesSinceCapture++;
    }
    return true;
  }

  getWinner(): PieceColor | 'draw' | null {
    // 1. 基本将军死棋/困毙检测
    if (this.getAllValidMoves(this.turn).length === 0) return this.turn === 'red' ? 'black' : 'red';
    // 2. 60回合(120步)不食子和棋
    if (this.movesSinceCapture >= 120) return 'draw';
    // 3. 5次重复局面强制和棋
    if ((this.positionHistory.get(boardKey(this.board, this.turn)) ?? 0) >= 5) return 'draw';
    
    // 特殊判定：长将/长捉违规（如果存在，上层 UI 应提示违规者变着，若执意走则此逻辑可辅助判定胜负）
    const violation = this.getRepetitionViolation();
    if (violation) return violation.violator === 'red' ? 'black' : 'red';

    return null;
  }

  isGameOver(): boolean {
    return this.getWinner() !== null;
  }

  // ─── Cheat Methods (保持原始逻辑) ──────────────────────────
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
      const idx = this.capturedPieces.findIndex(p => p.type === piece.type && p.color === piece.color);
      if (idx !== -1) this.capturedPieces.splice(idx, 1);
    }
  }

  applyCheatBetray(r: number, c: number) {
    const p = this.getPiece(r, c);
    if (p && ['r', 'c', 'h', 'p'].includes(p.type)) {
      p.color = p.color === 'red' ? 'black' : 'red';
    }
  }
}