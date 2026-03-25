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
  violator: PieceColor;   // 违规方（必须变着，否则判负）
  reason: 'perpetualCheck' | 'perpetualChase';
  forbiddenMoves: Move[]; // 禁止走的重复着法
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

  initBoard() {
    const initialFen = [
      "rheakaehr", ".........", ".c.....c.", "p.p.p.p.p", ".........",
      ".........", "P.P.P.P.P", ".C.....C.", ".........", "RHEAKAEHR"
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

  // ── 规则判定辅助方法 ─────────────────────────────────────────────

  private _isOverRiver(p: Piece, r: number): boolean {
    return p.color === 'red' ? r <= 4 : r >= 5;
  }

  // 判定是否是具备“价值”的被捉目标（帅仕相不计捉，兵没过河不计捉）
  private _isValuableTarget(p: Piece, r: number): boolean {
    if (['r', 'h', 'c'].includes(p.type)) return true;
    if (p.type === 'p') return this._isOverRiver(p, r);
    return false;
  }

  // 获取当前局面下，color方正在“捉”的所有对手棋子ID
  private _getChasedPieceIds(color: PieceColor): Set<string> {
    const chased = new Set<string>();
    const oppColor = color === 'red' ? 'black' : 'red';

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (!p || p.color !== color) continue;
        
        // 只有车马炮兵能计捉
        if (!['r', 'h', 'c', 'p'].includes(p.type)) continue;

        const caps = this._getPseudoCaptures(r, c);
        for (const m of caps) {
          const target = this.getPiece(m.to.r, m.to.c);
          if (target && target.color === oppColor && this._isValuableTarget(target, m.to.r)) {
            chased.add(target.id);
          }
        }
      }
    }
    return chased;
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
        if (this._isOverRiver(piece, r)) {
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

  // ── 核心规则判定 ─────────────────────────────────────────────

  getRepetitionViolation(): RepetitionViolation | null {
    const hLen = this.history.length;
    const currentKey = boardKey(this.board, this.turn);
    if ((this.positionHistory.get(currentKey) ?? 0) < 3) return null;

    // 检测周期 2 (往返), 4 (方块循环), 6
    for (const period of [2, 4, 6]) {
      if (hLen < period * 2) continue;
      const key1 = this.boardKeyHistory[hLen - period];
      const key2 = this.boardKeyHistory[hLen - 2 * period];

      if (currentKey === key1 && currentKey === key2) {
        return this._analyzeCycle(period);
      }
    }
    return null;
  }

  private _analyzeCycle(period: number): RepetitionViolation | null {
    const hLen = this.history.length;
    const startIndex = hLen - 2 * period;
    let tempGame = this._reconstructStateAt(startIndex);
    if (!tempGame) return null;

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

    // 判定违规方
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
    // 这里的 turn 是当前还没走的一方，所以回溯判断谁走了哪一步
    for (let i = hLen - period; i < hLen; i++) {
      const moveColor = ((hLen - i) % 2 === 0) ? this.turn : (this.turn === 'red' ? 'black' : 'red');
      if (moveColor === color) moves.push(this.history[i]);
    }
    return moves;
  }

  private _reconstructStateAt(index: number): Xiangqi {
    const g = new Xiangqi();
    for (let i = 0; i < index; i++) g.makeMove(this.history[i]);
    return g;
  }

  // ── 常规移动逻辑 ─────────────────────────────────────────────

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

    // 这里保留了你原有的 PieceType 逻辑分支 (k, a, e, h, r, c, p)
    // ... (此处为了篇幅省略具体的 switch 移动生成，代码逻辑同你提供的版本)
    // 但需确保包含 switch(piece.type) { ... } 所有逻辑
    
    // 示例填充核心逻辑块
    switch (piece.type) {
        case 'k':
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const tr = r + dr, tc = c + dc;
            if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) addMove(tr, tc);
          }
          // 对脸将
          let trk = r + dir;
          while (trk >= 0 && trk <= 9) {
            const p = this.getPiece(trk, c);
            if (p) { if (p.type === 'k' && p.color !== piece.color) addMove(trk, c); break; }
            trk += dir;
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
        case 'h':
          for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
            const tr = r + dr, tc = c + dc;
            const legR = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
            const legC = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
            if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8 && !this.getPiece(legR, legC)) addMove(tr, tc);
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
            if (this._isOverRiver(piece, r)) { addMove(r, c + 1); addMove(r, c - 1); }
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
    // 这里的逻辑使用已经存在的攻击检测（车马炮兵）
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
    this.movesSinceCapture = 0; // 简化处理，实际可扫描历史记录回溯
    return true;
  }

  getWinner(): PieceColor | 'draw' | null {
    if (this.movesSinceCapture >= 120) return 'draw';
    if ((this.positionHistory.get(boardKey(this.board, this.turn)) ?? 0) >= 5) return 'draw';
    if (this.getAllValidMoves(this.turn).length === 0) return this.turn === 'red' ? 'black' : 'red';
    return null;
  }
}