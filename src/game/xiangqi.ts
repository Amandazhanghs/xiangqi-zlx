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

export class Xiangqi {
  board: (Piece | null)[][];
  turn: PieceColor;
  history: Move[];
  capturedPieces: Piece[];

  constructor() {
    this.board = Array(10).fill(null).map(() => Array(9).fill(null));
    this.turn = 'red';
    this.history = [];
    this.capturedPieces = [];
    this.initBoard();
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
      // Filter out moves that leave the king in check
      return moves.filter(move => {
        const clone = this.clone();
        clone.makeMove(move, true);
        return !clone.isInCheck(piece.color);
      });
    }

    for (const t of typesToEvaluate) {
      switch (t) {
        case 'k': // King
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const tr = r + dr, tc = c + dc;
            if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) {
              addMove(tr, tc);
            }
          }
          // Flying general
          let tr = r + dir;
          while (tr >= 0 && tr <= 9) {
            const p = this.getPiece(tr, c);
            if (p) {
              if (p.type === 'k' && p.color !== piece.color) {
                addMove(tr, c);
              }
              break;
            }
            tr += dir;
          }
          break;
        case 'a': // Advisor
          for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const tr = r + dr, tc = c + dc;
            if (tc >= 3 && tc <= 5 && ((isRed && tr >= 7 && tr <= 9) || (!isRed && tr >= 0 && tr <= 2))) {
              addMove(tr, tc);
            }
          }
          break;
        case 'e': // Elephant
          for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
            const tr = r + dr, tc = c + dc;
            const eyeR = r + dr / 2, eyeC = c + dc / 2;
            if (tc >= 0 && tc <= 8 && ((isRed && tr >= 5 && tr <= 9) || (!isRed && tr >= 0 && tr <= 4))) {
              if (!this.getPiece(eyeR, eyeC)) {
                addMove(tr, tc);
              }
            }
          }
          break;
        case 'h': // Horse
          for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
            const tr = r + dr, tc = c + dc;
            const legR = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
            const legC = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
            if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              if (!this.getPiece(legR, legC)) {
                addMove(tr, tc);
              }
            }
          }
          break;
        case 'r': // Chariot
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
              tr += dr;
              tc += dc;
            }
          }
          break;
        case 'c': // Cannon
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            let tr = r + dr, tc = c + dc;
            let jumped = false;
            while (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
              const p = this.getPiece(tr, tc);
              if (!p) {
                if (!jumped) addMove(tr, tc);
              } else {
                if (!jumped) {
                  jumped = true;
                } else {
                  if (p.color !== piece.color) addMove(tr, tc);
                  break;
                }
              }
              tr += dr;
              tc += dc;
            }
          }
          break;
        case 'p': // Soldier
          addMove(r + dir, c);
          if ((isRed && r <= 4) || (!isRed && r >= 5)) {
            addMove(r, c + 1);
            addMove(r, c - 1);
          }
          break;
      }
    }

    // Filter out moves that leave the king in check
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
        if (p && p.type === 'k' && p.color === color) {
          kr = r; kc = c; break;
        }
      }
    }
    if (kr === -1) return true;

    const oppColor = color === 'red' ? 'black' : 'red';

    // 1. Check Chariot/Cannon/King/Soldier (and Armored)
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

    // 2. Check Horse (and Armored)
    for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      const tr = kr + dr, tc = kc + dc;
      const legR = kr + dr / 2;
      const legC = kc + dc / 2;
      if (tr >= 0 && tr <= 9 && tc >= 0 && tc <= 8) {
        const p = this.getPiece(tr, tc);
        if (p && p.color === oppColor && (p.type === 'h' || p.isArmored)) {
          const hLegR = Math.abs(dr) === 2 ? kr + dr / 2 : tr;
          const hLegC = Math.abs(dc) === 2 ? kc + dc / 2 : tc;
          if (!this.getPiece(hLegR, hLegC)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  getWinner(): PieceColor | 'draw' | null {
    // 1. 一方的将/帅被吃
    let redKing = false;
    let blackKing = false;
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

    // 2. 一方无子可走（所有棋子都无合规走法）
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

    const target = this.board[move.to.r][move.to.c];
    move.captured = target || undefined;
    if (target) {
      this.capturedPieces.push(target);
    }

    this.board[move.to.r][move.to.c] = piece;
    this.board[move.from.r][move.from.c] = null;
    
    if (!ignoreTurn) {
      this.history.push(move);
      this.turn = this.turn === 'red' ? 'black' : 'red';
    }
    return true;
  }

  undo(): boolean {
    const move = this.history.pop();
    if (!move) return false;
    this.board[move.from.r][move.from.c] = this.board[move.to.r][move.to.c];
    this.board[move.to.r][move.to.c] = move.captured || null;
    if (move.captured) {
      this.capturedPieces.pop();
    }
    this.turn = this.turn === 'red' ? 'black' : 'red';
    return true;
  }

  clearBoard() {
    this.board = Array(10).fill(null).map(() => Array(9).fill(null));
    this.history = [];
    this.capturedPieces = [];
    this.turn = 'red';
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
      if (index !== -1) {
        this.capturedPieces.splice(index, 1);
      }
    }
  }

  applyCheatBetray(r: number, c: number) {
    const p = this.getPiece(r, c);
    if (p && ['r', 'c', 'h', 'p'].includes(p.type)) {
      p.color = p.color === 'red' ? 'black' : 'red';
    }
  }
}
