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
}

export function Board({ 
  game, 
  playerColor, 
  onMove, 
  boardTheme = 'classic', 
  pieceTheme = 'classic',
  isEditMode = false,
  onEditClick,
  onSquareClickOverride
}: BoardProps) {
  const [selected, setSelected] = React.useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = React.useState<Move[]>([]);

  const [cellSize, setCellSize] = React.useState(48);

  React.useEffect(() => {
    const updateSize = () => {
      const maxWidth = window.innerWidth - 32; // 16px padding on sides
      const calculated = Math.floor((maxWidth - 48) / 8);
      setCellSize(Math.min(48, Math.max(30, calculated)));
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
    if (onSquareClickOverride) {
      onSquareClickOverride(r, c);
      return;
    }

    if (isEditMode && onEditClick) {
      onEditClick(r, c);
      return;
    }

    if (playerColor !== 'both' && game.turn !== playerColor) return;

    const piece = game.getPiece(r, c);

    if (selected) {
      const move = validMoves.find(m => m.to.r === r && m.to.c === c);
      if (move && onMove) {
        onMove(move);
        setSelected(null);
        setValidMoves([]);
        return;
      }
    }

    if (piece && piece.color === game.turn) {
      if (playerColor !== 'both' && piece.color !== playerColor) return;
      setSelected({ r, c });
      setValidMoves(game.getValidMoves(r, c));
    } else {
      setSelected(null);
      setValidMoves([]);
    }
  };

  const isFlipped = playerColor === 'black';
  const CELL_SIZE = cellSize;
  const BOARD_WIDTH = CELL_SIZE * 8;
  const BOARD_HEIGHT = CELL_SIZE * 9;

  const boardThemes = {
    classic: 'bg-[#f5deb3] border-amber-900',
    wood: 'bg-[#d4a373] border-[#5c3a21]',
    paper: 'bg-[#f4f1ea] border-[#5c5c5c]'
  };

  const pieceThemes = {
    classic: 'bg-[#ffe4b5] shadow-md border-2',
    wood: 'bg-[#e6c280] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.4),0_2px_4px_rgba(0,0,0,0.5)] border-[#8b5a2b] border',
    flat: 'bg-white shadow-sm border border-gray-300'
  };

  const lineColors = {
    classic: '#78350f',
    wood: '#4a2e15',
    paper: '#5c5c5c'
  };

  const lineColor = lineColors[boardTheme];

  return (
    <div className={cn("relative inline-block p-6 border-4 rounded-lg shadow-2xl select-none", boardThemes[boardTheme])}>
      <svg width={BOARD_WIDTH} height={BOARD_HEIGHT} className="absolute top-6 left-6 pointer-events-none">
        {/* Horizontal lines */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h-${i}`} x1={0} y1={i * CELL_SIZE} x2={BOARD_WIDTH} y2={i * CELL_SIZE} stroke={lineColor} strokeWidth="2" />
        ))}
        {/* Vertical lines */}
        {Array.from({ length: 9 }).map((_, i) => (
          <React.Fragment key={`v-${i}`}>
            <line x1={i * CELL_SIZE} y1={0} x2={i * CELL_SIZE} y2={CELL_SIZE * 4} stroke={lineColor} strokeWidth="2" />
            <line x1={i * CELL_SIZE} y1={CELL_SIZE * 5} x2={i * CELL_SIZE} y2={BOARD_HEIGHT} stroke={lineColor} strokeWidth="2" />
          </React.Fragment>
        ))}
        {/* Connecting side lines for the river */}
        <line x1={0} y1={CELL_SIZE * 4} x2={0} y2={CELL_SIZE * 5} stroke={lineColor} strokeWidth="2" />
        <line x1={BOARD_WIDTH} y1={CELL_SIZE * 4} x2={BOARD_WIDTH} y2={CELL_SIZE * 5} stroke={lineColor} strokeWidth="2" />
        
        {/* Palace diagonals */}
        <line x1={CELL_SIZE * 3} y1={0} x2={CELL_SIZE * 5} y2={CELL_SIZE * 2} stroke={lineColor} strokeWidth="2" />
        <line x1={CELL_SIZE * 5} y1={0} x2={CELL_SIZE * 3} y2={CELL_SIZE * 2} stroke={lineColor} strokeWidth="2" />
        <line x1={CELL_SIZE * 3} y1={CELL_SIZE * 7} x2={CELL_SIZE * 5} y2={CELL_SIZE * 9} stroke={lineColor} strokeWidth="2" />
        <line x1={CELL_SIZE * 5} y1={CELL_SIZE * 7} x2={CELL_SIZE * 3} y2={CELL_SIZE * 9} stroke={lineColor} strokeWidth="2" />
        
        {/* River text */}
        <text x={CELL_SIZE * 2} y={CELL_SIZE * 4.6} fill={lineColor} fontSize={CELL_SIZE * 0.5} fontFamily='"Kaiti", "STKaiti", serif' textAnchor="middle">楚 河</text>
        <text x={CELL_SIZE * 6} y={CELL_SIZE * 4.6} fill={lineColor} fontSize={CELL_SIZE * 0.5} fontFamily='"Kaiti", "STKaiti", serif' textAnchor="middle">汉 界</text>

        {/* Outer border to ensure it's exactly as thick as inner lines */}
        <rect x={1} y={1} width={BOARD_WIDTH - 2} height={BOARD_HEIGHT - 2} fill="none" stroke={lineColor} strokeWidth="2" />
      </svg>

      <div className="relative" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}>
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const actualR = isFlipped ? 9 - r : r;
            const actualC = isFlipped ? 8 - c : c;
            const isValidMove = validMoves.some(m => m.to.r === actualR && m.to.c === actualC);
            const lastMove = game.history[game.history.length - 1];
            const isLastMove = !isEditMode && lastMove && ((lastMove.from.r === actualR && lastMove.from.c === actualC) || (lastMove.to.r === actualR && lastMove.to.c === actualC));

            return (
              <div
                key={`square-${r}-${c}`}
                className="absolute flex items-center justify-center cursor-pointer z-10"
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  left: c * CELL_SIZE - CELL_SIZE / 2,
                  top: r * CELL_SIZE - CELL_SIZE / 2,
                }}
                onClick={() => handleSquareClick(actualR, actualC)}
              >
                {isLastMove && <div className="absolute bg-yellow-400/40 rounded-full pointer-events-none" style={{ width: CELL_SIZE * 0.85, height: CELL_SIZE * 0.85 }} />}
                {isValidMove && <div className="absolute bg-green-500 rounded-full z-10 pointer-events-none" style={{ width: CELL_SIZE * 0.25, height: CELL_SIZE * 0.25 }} />}
              </div>
            );
          })
        )}

        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const piece = game.getPiece(r, c);
            if (!piece) return null;

            const displayR = isFlipped ? 9 - r : r;
            const displayC = isFlipped ? 8 - c : c;
            const isSelected = selected?.r === r && selected?.c === c;

            return (
              <motion.div
                key={piece.id}
                initial={false}
                animate={{
                  left: displayC * CELL_SIZE - CELL_SIZE / 2,
                  top: displayR * CELL_SIZE - CELL_SIZE / 2,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute flex items-center justify-center pointer-events-none z-20"
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                }}
              >
                <div
                  className={cn(
                    "relative rounded-full flex items-center justify-center font-bold",
                    pieceThemes[pieceTheme],
                    piece.color === 'red' ? "text-red-600 border-red-700" : "text-black border-gray-800",
                    isSelected && "ring-4 ring-blue-400"
                  )}
                  style={{ 
                    fontFamily: '"Kaiti", "STKaiti", serif',
                    width: CELL_SIZE * 0.85,
                    height: CELL_SIZE * 0.85,
                    fontSize: CELL_SIZE * 0.45,
                    borderWidth: CELL_SIZE > 40 ? 2 : 1
                  }}
                >
                  {PIECE_CHARS[`${piece.color}-${piece.type}`]}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
