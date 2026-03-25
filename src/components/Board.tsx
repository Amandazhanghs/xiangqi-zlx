import React from 'react';
import { Xiangqi, Piece, Move } from '../game/xiangqi';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export const PIECE_CHARS: Record<string, string> = {
  'red-k': '帅', 'red-a': '仕', 'red-e': '相', 'red-h': '㐷', 'red-r': '俥', 'red-c': '炮', 'red-p': '兵',
  'black-k': '将', 'black-a': '士', 'black-e': '象', 'black-h': '马', 'black-r': '车', 'black-c': '砲', 'black-p': '卒'
};

export type BoardTheme = 'classic' | 'wood' | 'paper';
export type PieceTheme = 'classic' | 'wood' | 'flat';

interface BoardProps {
  game: Xiangqi;
  playerColor: 'red' | 'black' | 'both';
  onMove?: (move: Move) => void;
  boardTheme?: BoardTheme;
  pieceTheme?: PieceTheme;
  isEditMode?: boolean;
  onEditClick?: (r: number, c: number) => void;
  onSquareClickOverride?: (r: number, c: number) => void;
  hintMove?: Move | null;
  forbiddenMoves?: Move[]; // moves the current player is NOT allowed to make
}

export function Board({
  game, playerColor, onMove,
  boardTheme = 'classic', pieceTheme = 'classic',
  isEditMode = false, onEditClick, onSquareClickOverride,
  hintMove = null,
  forbiddenMoves = [],
}: BoardProps) {
  const [selected, setSelected] = React.useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = React.useState<Move[]>([]);
  const [cellSize, setCellSize] = React.useState(44);

  React.useEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const boardPad = 24;
      const maxByWidth = Math.floor((vw - boardPad - 8) / 8);
      const reservedV = 44 + 28 + 28 + 60 + boardPad;
      const maxByHeight = Math.floor((vh - reservedV) / 9);
      const size = Math.max(28, Math.min(54, maxByWidth, maxByHeight));
      setCellSize(size);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  React.useEffect(() => {
    setSelected(null);
    setValidMoves([]);
  }, [game.turn, game.history.length]);

  const handleSquareClick = (r: number, c: number) => {
    if (onSquareClickOverride) { onSquareClickOverride(r, c); return; }
    if (isEditMode && onEditClick) { onEditClick(r, c); return; }
    if (playerColor !== 'both' && game.turn !== playerColor) return;

    const piece = game.getPiece(r, c);
    if (selected) {
      const move = validMoves.find(m => m.to.r === r && m.to.c === c);
      if (move && onMove) { onMove(move); setSelected(null); setValidMoves([]); return; }
    }
    if (piece && piece.color === game.turn) {
      if (playerColor !== 'both' && piece.color !== playerColor) return;
      setSelected({ r, c });
      // Filter out forbidden moves so they won't show as valid
      const allValid = game.getValidMoves(r, c);
      const filtered = allValid.filter(m =>
        !forbiddenMoves.some(f =>
          f.from.r === m.from.r && f.from.c === m.from.c &&
          f.to.r === m.to.r && f.to.c === m.to.c
        )
      );
      setValidMoves(filtered);
    } else {
      setSelected(null); setValidMoves([]);
    }
  };

  const isFlipped = playerColor === 'black';
  const CS = cellSize;
  const BOARD_W = CS * 8;
  const BOARD_H = CS * 9;
  const PAD = 12;

  const boardBg: Record<BoardTheme, string> = {
    classic: '#f5deb3',
    wood: '#c8924a',
    paper: '#f0ede4',
  };
  const lineColor: Record<BoardTheme, string> = {
    classic: '#78350f',
    wood: '#3d1f08',
    paper: '#5c5c5c',
  };
  const pieceBg: Record<PieceTheme, string> = {
    classic: '#ffe4b5',
    wood: '#d4a055',
    flat: '#ffffff',
  };
  const pieceStyleClass: Record<PieceTheme, string> = {
    classic: 'shadow-md border-2',
    wood: 'shadow-[inset_0_-2px_4px_rgba(0,0,0,0.45),0_2px_5px_rgba(0,0,0,0.55)] border',
    flat: 'shadow-sm border',
  };
  const lc = lineColor[boardTheme];

  // ── Position marker helper ─────────────────────────────────────
  // Draws the classic "corner bracket" marks at a board intersection.
  // `cx/cy` = center of intersection in SVG coords.
  // `arm`   = length of each bracket arm (≈ CS * 0.18).
  // `gap`   = gap between bracket and line crossing (≈ CS * 0.08).
  // Only draws brackets on the side(s) that have a board line.
  const renderMarker = (cx: number, cy: number, arm: number, gap: number, sides: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }) => {
    const paths: string[] = [];
    // top-left corner
    if (sides.top && sides.left) {
      paths.push(`M${cx - gap - arm},${cy - gap} L${cx - gap},${cy - gap} L${cx - gap},${cy - gap - arm}`);
    }
    // top-right corner
    if (sides.top && sides.right) {
      paths.push(`M${cx + gap + arm},${cy - gap} L${cx + gap},${cy - gap} L${cx + gap},${cy - gap - arm}`);
    }
    // bottom-left corner
    if (sides.bottom && sides.left) {
      paths.push(`M${cx - gap - arm},${cy + gap} L${cx - gap},${cy + gap} L${cx - gap},${cy + gap + arm}`);
    }
    // bottom-right corner
    if (sides.bottom && sides.right) {
      paths.push(`M${cx + gap + arm},${cy + gap} L${cx + gap},${cy + gap} L${cx + gap},${cy + gap + arm}`);
    }
    return paths.map((d, i) => (
      <path key={i} d={d} stroke={lc} strokeWidth={1.2} fill="none" strokeLinecap="square" />
    ));
  };

  // Build all position markers:
  // Cannon positions: (2,1), (2,7), (7,1), (7,7)
  // Soldier/pawn positions: (3,0),(3,2),(3,4),(3,6),(3,8), (6,0),(6,2),(6,4),(6,6),(6,8)
  const buildMarkers = () => {
    const markers: React.ReactNode[] = [];
    const arm = CS * 0.17;
    const gap = CS * 0.08;

    const addMarker = (boardRow: number, boardCol: number) => {
      const displayRow = isFlipped ? 9 - boardRow : boardRow;
      const displayCol = isFlipped ? 8 - boardCol : boardCol;
      const cx = displayCol * CS;
      const cy = displayRow * CS;

      // Determine which sides have board lines (edge columns/rows only have lines on one side)
      const hasLeft = displayCol > 0;
      const hasRight = displayCol < 8;
      const hasTop = displayRow > 0;
      const hasBottom = displayRow < 9;

      markers.push(
        <g key={`marker-${boardRow}-${boardCol}`}>
          {renderMarker(cx, cy, arm, gap, { top: hasTop, bottom: hasBottom, left: hasLeft, right: hasRight })}
        </g>
      );
    };

    // Cannon positions (rows 2 and 7, cols 1 and 7)
    addMarker(2, 1); addMarker(2, 7);
    addMarker(7, 1); addMarker(7, 7);

    // Soldier/pawn positions (rows 3 and 6, odd columns for center, all 5 columns)
    [0, 2, 4, 6, 8].forEach(c => {
      addMarker(3, c);
      addMarker(6, c);
    });

    return markers;
  };

  // Hint arrow
  const getHintArrow = () => {
    if (!hintMove) return null;
    const fromR = isFlipped ? 9 - hintMove.from.r : hintMove.from.r;
    const fromC = isFlipped ? 8 - hintMove.from.c : hintMove.from.c;
    const toR = isFlipped ? 9 - hintMove.to.r : hintMove.to.r;
    const toC = isFlipped ? 8 - hintMove.to.c : hintMove.to.c;

    const x1 = fromC * CS;
    const y1 = fromR * CS;
    const x2 = toC * CS;
    const y2 = toR * CS;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;

    const shrink = CS * 0.28;
    const ux = dx / len;
    const uy = dy / len;

    return { x1: x1 + ux * shrink, y1: y1 + uy * shrink, x2: x2 - ux * shrink, y2: y2 - uy * shrink };
  };

  const arrow = getHintArrow();

  return (
    <div
      className="relative inline-block select-none rounded-lg shadow-2xl"
      style={{ background: boardBg[boardTheme], padding: PAD, border: `3px solid ${lc}` }}
    >
      <svg width={BOARD_W} height={BOARD_H}
        className="absolute pointer-events-none"
        style={{ top: PAD, left: PAD }}>

        {/* Board lines */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i*CS} x2={BOARD_W} y2={i*CS} stroke={lc} strokeWidth={1.5} />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <React.Fragment key={`v${i}`}>
            <line x1={i*CS} y1={0} x2={i*CS} y2={CS*4} stroke={lc} strokeWidth={1.5} />
            <line x1={i*CS} y1={CS*5} x2={i*CS} y2={BOARD_H} stroke={lc} strokeWidth={1.5} />
          </React.Fragment>
        ))}
        <line x1={0} y1={CS*4} x2={0} y2={CS*5} stroke={lc} strokeWidth={1.5} />
        <line x1={BOARD_W} y1={CS*4} x2={BOARD_W} y2={CS*5} stroke={lc} strokeWidth={1.5} />

        {/* Palace diagonals */}
        <line x1={CS*3} y1={0} x2={CS*5} y2={CS*2} stroke={lc} strokeWidth={1.5} />
        <line x1={CS*5} y1={0} x2={CS*3} y2={CS*2} stroke={lc} strokeWidth={1.5} />
        <line x1={CS*3} y1={CS*7} x2={CS*5} y2={CS*9} stroke={lc} strokeWidth={1.5} />
        <line x1={CS*5} y1={CS*7} x2={CS*3} y2={CS*9} stroke={lc} strokeWidth={1.5} />

        {/* River text */}
        <text x={CS*2} y={CS*4.62} fill={lc} fontSize={CS*0.42}
          fontFamily='"STKaiti","KaiTi","Kaiti SC",serif' textAnchor="middle">楚 河</text>
        <text x={CS*6} y={CS*4.62} fill={lc} fontSize={CS*0.42}
          fontFamily='"STKaiti","KaiTi","Kaiti SC",serif' textAnchor="middle">汉 界</text>

        {/* Border */}
        <rect x={0.5} y={0.5} width={BOARD_W-1} height={BOARD_H-1} fill="none" stroke={lc} strokeWidth={1.5} />

        {/* Position markers (cannon & soldier spots) */}
        {buildMarkers()}

        {/* Hint arrow */}
        {arrow && (
          <>
            <defs>
             <marker
  id="hint-arrowhead"
  markerWidth="10"    // 宽度不变（尖端到左边缘距离仍为 8）
  markerHeight="5"    // 从 6 改为 5，因为三角形上下范围缩小了
  refX="8"            // 尖端 x 坐标
  refY="3"            // 尖端 y 坐标（保持不变）
  orient="auto"
>
  <path d="M0,2 L8,3 L0,4 Z" fill="rgba(22,163,74,0.95)" />
</marker>
              </marker>
            </defs>
            <line
              x1={arrow.x1} y1={arrow.y1}
              x2={arrow.x2} y2={arrow.y2}
              stroke="rgba(22,163,74,0.8)"
              strokeWidth={CS * 0.07}
              strokeLinecap="round"
              markerEnd="url(#hint-arrowhead)"
              style={{ filter: 'drop-shadow(0 0 2px rgba(22,163,74,0.4))' }}
            />
          </>
        )}
      </svg>

      <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const aR = isFlipped ? 9-r : r;
            const aC = isFlipped ? 8-c : c;
            const isValid = validMoves.some(m => m.to.r===aR && m.to.c===aC);
            const last = game.history[game.history.length-1];
            const isLast = !isEditMode && last &&
              ((last.from.r===aR&&last.from.c===aC)||(last.to.r===aR&&last.to.c===aC));
            const isHintFrom = hintMove && hintMove.from.r===aR && hintMove.from.c===aC;
            const isHintTo = hintMove && hintMove.to.r===aR && hintMove.to.c===aC;

            return (
              <div key={`sq${r}${c}`}
                className="absolute flex items-center justify-center cursor-pointer z-10"
                style={{ width:CS, height:CS, left:c*CS-CS/2, top:r*CS-CS/2 }}
                onClick={() => handleSquareClick(aR, aC)}>
                {isLast && !isHintFrom && !isHintTo && (
                  <div className="absolute rounded-full pointer-events-none"
                    style={{ width:CS*0.82, height:CS*0.82, background:'rgba(255,215,0,0.38)' }} />
                )}
                {isHintFrom && (
                  <div className="absolute rounded-full pointer-events-none animate-pulse"
                    style={{ width:CS*0.82, height:CS*0.82, background:'rgba(250,204,21,0.55)', border:'2px solid rgba(234,179,8,0.9)' }} />
                )}
                {isHintTo && (
                  <div className="absolute rounded-full pointer-events-none animate-pulse"
                    style={{ width:CS*0.82, height:CS*0.82, background:'rgba(34,197,94,0.4)', border:'2.5px solid rgba(22,163,74,0.9)' }} />
                )}
                {isValid && (
                  <div className="absolute rounded-full z-10 pointer-events-none"
                    style={{ width:CS*0.28, height:CS*0.28, background:'rgba(59,130,246,0.85)' }} />
                )}
              </div>
            );
          })
        )}

        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const piece = game.getPiece(r, c);
            if (!piece) return null;
            const dR = isFlipped ? 9-r : r;
            const dC = isFlipped ? 8-c : c;
            const isSel = selected?.r===r && selected?.c===c;
            const isRed = piece.color === 'red';
            const pieceSize = CS * 0.84;

            return (
              <motion.div
                key={piece.id}
                initial={false}
                animate={{ left: dC*CS - CS/2, top: dR*CS - CS/2 }}
                transition={{ type:'spring', stiffness:320, damping:32 }}
                className="absolute flex items-center justify-center pointer-events-none z-20"
                style={{ width:CS, height:CS }}>
                <div
                  className={cn(
                    "relative rounded-full flex items-center justify-center font-bold",
                    pieceStyleClass[pieceTheme],
                    isSel && "ring-[3px] ring-blue-500 ring-offset-0"
                  )}
                  style={{
                    width: pieceSize, height: pieceSize,
                    background: pieceBg[pieceTheme],
                    borderColor: isRed ? '#9b1111' : '#222',
                    borderWidth: CS > 38 ? 2 : 1,
                    color: isRed ? '#9b1111' : '#111',
                    fontSize: CS * 0.44,
                    fontFamily: '"STKaiti","KaiTi","Kaiti SC",serif',
                  }}>
                  {PIECE_CHARS[`${piece.color}-${piece.type}`]}
                  {piece.isArmored && (
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] bg-yellow-400 text-black rounded-full w-3 h-3 flex items-center justify-center leading-none font-bold">甲</span>
                  )}
                  {piece.isDrifting && (
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] bg-blue-500 text-white rounded-full w-3 h-3 flex items-center justify-center leading-none font-bold">飘</span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
