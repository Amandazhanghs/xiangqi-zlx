import React from 'react';
import { Xiangqi, Move } from '../game/xiangqi';
import { motion } from 'motion/react';
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';
import { playPickSound } from '../utils/sounds';

function cn(...args: (string | undefined | null | false)[]) {
  return twMerge(clsx(args));
}

export const PIECE_CHARS: Record<string, string> = {
  'red-k': '帅', 'red-a': '仕', 'red-e': '相', 'red-h': '㐷',
  'red-r': '俥', 'red-c': '炮', 'red-p': '兵',
  'black-k': '将', 'black-a': '士', 'black-e': '象', 'black-h': '马',
  'black-r': '车', 'black-c': '砲', 'black-p': '卒',
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
  extraReservedV?: number;
}

// ─────────────────────────────────────────────────────────────────
// PieceDisc
//
// Design goal: keep the ORIGINAL piece look (ivory background,
// red/black characters, border ring) but add just enough shadow
// to give a flat, coin-like 3D depth — nothing more.
//
// All three themes use the same approach:
//   • Solid face colour (not a wild gradient)
//   • Thin rim border
//   • Inner decorative ring
//   • Drop shadow underneath + inner highlight on top = coin depth
//   • Character colour unchanged from original
// ─────────────────────────────────────────────────────────────────
const PieceDisc = React.memo(function PieceDisc({
  char, isRed, isSelected, isArmored, isDrifting, theme, size,
}: {
  char: string;
  isRed: boolean;
  isSelected: boolean;
  isArmored?: boolean;
  isDrifting?: boolean;
  theme: PieceTheme;
  size: number;
}) {
  const s = size;

  // ── per-theme tokens (face / rim / ring / text) ──────────────
  // Face colours are deliberately close to the original app values.
  // Text colour stays true red (#cc0000) or true black (#111).
  let face: string;
  let rim: string;
  let ring: string;
  let textColor: string;
  let dropShadow: string;        // cast shadow beneath piece
  let innerHighlight: string;    // top-left bright gloss
  let innerShadow: string;       // bottom-right depth shadow

  if (theme === 'flat') {
    // Flat = almost no 3D; just a subtle border + faint drop shadow
    face          = isRed ? '#ffe4b5' : '#ffe4b5';   // same ivory for both
    rim           = isRed ? '#cc0000' : '#1a1a1a';
    ring          = isRed ? '#cc0000' : '#1a1a1a';
    textColor     = isRed ? '#cc0000' : '#111111';
    dropShadow    = `0 2px 4px rgba(0,0,0,0.22)`;
    innerHighlight = '';
    innerShadow   = '';
  } else if (theme === 'wood') {
    // Wood = warm amber-ivory face, brown rim
    face          = isRed ? '#f5d98a' : '#e8d090';
    rim           = isRed ? '#9b1c00' : '#2c1a08';
    ring          = isRed ? '#b83000' : '#4a3018';
    textColor     = isRed ? '#cc0000' : '#111111';
    dropShadow    = `0 ${Math.round(s*0.05)}px ${Math.round(s*0.12)}px rgba(0,0,0,0.38)`;
    innerHighlight = `inset 0 ${Math.round(s*0.06)}px ${Math.round(s*0.12)}px rgba(255,255,255,0.50)`;
    innerShadow    = `inset 0 -${Math.round(s*0.04)}px ${Math.round(s*0.09)}px rgba(0,0,0,0.20)`;
  } else {
    // Classic = original ivory #ffe4b5, red/black rim, subtle 3D
    face          = '#ffe4b5';
    rim           = isRed ? '#9b1c00' : '#2a1a0a';
    ring          = isRed ? '#b83000' : '#4a3018';
    textColor     = isRed ? '#cc0000' : '#111111';
    dropShadow    = `0 ${Math.round(s*0.055)}px ${Math.round(s*0.13)}px rgba(0,0,0,0.35)`;
    innerHighlight = `inset 0 ${Math.round(s*0.065)}px ${Math.round(s*0.13)}px rgba(255,255,255,0.55)`;
    innerShadow    = `inset 0 -${Math.round(s*0.04)}px ${Math.round(s*0.09)}px rgba(0,0,0,0.18)`;
  }

  const rimW  = Math.max(2, Math.round(s * 0.055));
  const ringI = Math.round(s * 0.10);   // inner ring inset

  const boxShadow = [
    dropShadow,
    innerHighlight || undefined,
    innerShadow    || undefined,
    isSelected
      ? `0 0 0 ${Math.round(s*0.10)}px rgba(59,130,246,0.90), 0 0 ${Math.round(s*0.20)}px rgba(59,130,246,0.45)`
      : undefined,
  ].filter(Boolean).join(', ');

  return (
    <div style={{
      width: s, height: s,
      borderRadius: '50%',
      background: face,
      border: `${rimW}px solid ${rim}`,
      boxShadow,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      userSelect: 'none',
    }}>

      {/* Inner decorative ring */}
      {theme !== 'flat' && (
        <div style={{
          position: 'absolute',
          inset: ringI,
          borderRadius: '50%',
          border: `1px solid ${ring}`,
          opacity: 0.55,
          pointerEvents: 'none',
        }} />
      )}

      {/* Chinese character — original colour, unchanged */}
      <span style={{
        fontSize: s * 0.44,
        fontFamily: '"STKaiti","KaiTi","Kaiti SC","Noto Serif SC",serif',
        fontWeight: 700,
        color: textColor,
        lineHeight: 1,
        position: 'relative',
        zIndex: 1,
        // Very subtle emboss only on non-flat themes
        textShadow: theme !== 'flat'
          ? `0 1px 1px rgba(255,255,255,0.40), 0 -1px 0px rgba(0,0,0,0.15)`
          : 'none',
      }}>
        {char}
      </span>

      {/* Armored badge */}
      {isArmored && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1,
          width: 14, height: 14, borderRadius: '50%',
          background: '#facc15', color: '#000',
          fontSize: 7, fontWeight: 800, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
        }}>甲</span>
      )}

      {/* Drifting badge */}
      {isDrifting && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1,
          width: 14, height: 14, borderRadius: '50%',
          background: '#3b82f6', color: '#fff',
          fontSize: 7, fontWeight: 800, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
        }}>飘</span>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────
// HintArrow
//
// Draws an SVG arrow from the hint piece's origin cell to its
// destination cell, overlaid on the board.  The arrow makes it
// immediately obvious which piece to move and where.
//
// Layout note: the board inner area has width=CS*8, height=CS*9.
// Each intersection is at (c*CS, r*CS) — the piece centres.
// But click squares are positioned at (c*CS - CS/2, r*CS - CS/2),
// so the visual centre of column c is at c*CS, row r is at r*CS.
// ─────────────────────────────────────────────────────────────────
function HintArrow({
  hintMove, CS, isFlipped,
}: {
  hintMove: Move;
  CS: number;
  isFlipped: boolean;
}) {
  const fr = isFlipped ? 9 - hintMove.from.r : hintMove.from.r;
  const fc = isFlipped ? 8 - hintMove.from.c : hintMove.from.c;
  const tr = isFlipped ? 9 - hintMove.to.r   : hintMove.to.r;
  const tc = isFlipped ? 8 - hintMove.to.c   : hintMove.to.c;

  // Centre coords in the board inner SVG coordinate space
  const x1 = fc * CS;
  const y1 = fr * CS;
  const x2 = tc * CS;
  const y2 = tr * CS;

  // Shorten the line at both ends so it doesn't overlap the pieces
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const ux = dx / len, uy = dy / len;
  const shrink = CS * 0.38;   // pull back from each piece centre
  const sx1 = x1 + ux * shrink;
  const sy1 = y1 + uy * shrink;
  const sx2 = x2 - ux * shrink;
  const sy2 = y2 - uy * shrink;

  const BW = CS * 8, BH = CS * 9;
  const arrowId = 'hint-arrow-head';

  return (
    <svg
      width={BW} height={BH}
      className="absolute pointer-events-none"
      style={{ top: 0, left: 0, zIndex: 25 }}
    >
      <defs>
        <marker
          id={arrowId}
          markerWidth="8" markerHeight="8"
          refX="6" refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z"
            fill="rgba(34,197,94,0.90)" />
        </marker>
      </defs>

      {/* Glow / shadow line behind for contrast */}
      <line
        x1={sx1} y1={sy1} x2={sx2} y2={sy2}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={CS * 0.13}
        strokeLinecap="round"
      />

      {/* Main arrow line */}
      <line
        x1={sx1} y1={sy1} x2={sx2} y2={sy2}
        stroke="rgba(34,197,94,0.90)"
        strokeWidth={CS * 0.09}
        strokeLinecap="round"
        markerEnd={`url(#${arrowId})`}
        strokeDasharray={`${CS * 0.18} ${CS * 0.10}`}
      />

      {/* Origin highlight dot */}
      <circle
        cx={x1} cy={y1}
        r={CS * 0.18}
        fill="rgba(250,204,21,0.75)"
        stroke="rgba(234,179,8,0.90)"
        strokeWidth={CS * 0.04}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// BOARD COMPONENT
// ─────────────────────────────────────────────────────────────────
export function Board({
  game, playerColor, onMove,
  boardTheme = 'classic', pieceTheme = 'classic',
  isEditMode = false, onEditClick, onSquareClickOverride,
  hintMove = null, extraReservedV = 0,
}: BoardProps) {
  const [selected,   setSelected]   = React.useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = React.useState<Move[]>([]);
  const [cellSize,   setCellSize]   = React.useState(44);

  // Responsive cell size
  React.useEffect(() => {
    const upd = () => {
      const maxW = Math.floor((window.innerWidth  - 32) / 8);
      const maxH = Math.floor((window.innerHeight - 212 - extraReservedV) / 9);
      setCellSize(Math.max(26, Math.min(54, maxW, maxH)));
    };
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, [extraReservedV]);

  // Clear selection on each new move (no bounce animation)
  React.useEffect(() => {
    setSelected(null);
    setValidMoves([]);
  }, [game.turn, game.history.length]);

  const handleClick = (r: number, c: number) => {
    if (onSquareClickOverride) { onSquareClickOverride(r, c); return; }
    if (isEditMode && onEditClick) { onEditClick(r, c); return; }
    if (playerColor !== 'both' && game.turn !== playerColor) return;
    const piece = game.getPiece(r, c);
    if (selected) {
      const mv = validMoves.find(m => m.to.r === r && m.to.c === c);
      if (mv && onMove) { onMove(mv); setSelected(null); setValidMoves([]); return; }
    }
    if (piece && piece.color === game.turn) {
      if (playerColor !== 'both' && piece.color !== playerColor) return;
      playPickSound();
      setSelected({ r, c });
      setValidMoves(game.getValidMoves(r, c));
    } else {
      setSelected(null); setValidMoves([]);
    }
  };

  const isFlipped = playerColor === 'black';
  const CS = cellSize;
  const BW = CS * 8, BH = CS * 9, PAD = 12;

  const boardBg: Record<BoardTheme, string> = {
    classic: '#eed898', wood: '#c07838', paper: '#ece7da',
  };
  const lineCol: Record<BoardTheme, string> = {
    classic: '#6b2a06', wood: '#391808', paper: '#554848',
  };
  const lc = lineCol[boardTheme];

  return (
    <div
      className="relative inline-block select-none"
      style={{
        background: boardBg[boardTheme],
        padding: PAD,
        border: `3px solid ${lc}`,
        borderRadius: 10,
        boxShadow: [
          '0 10px 36px rgba(0,0,0,0.40)',
          '0 3px 8px rgba(0,0,0,0.22)',
          'inset 0 1px 3px rgba(255,255,255,0.18)',
        ].join(', '),
      }}
    >
      {/* SVG grid */}
      <svg width={BW} height={BH}
        className="absolute pointer-events-none"
        style={{ top: PAD, left: PAD }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i*CS} x2={BW} y2={i*CS}
            stroke={lc} strokeWidth={i===0||i===9 ? 2 : 1.2} />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <React.Fragment key={`v${i}`}>
            <line x1={i*CS} y1={0}    x2={i*CS} y2={CS*4}
              stroke={lc} strokeWidth={i===0||i===8 ? 2 : 1.2} />
            <line x1={i*CS} y1={CS*5} x2={i*CS} y2={BH}
              stroke={lc} strokeWidth={i===0||i===8 ? 2 : 1.2} />
          </React.Fragment>
        ))}
        <line x1={0}  y1={CS*4} x2={0}  y2={CS*5} stroke={lc} strokeWidth={2} />
        <line x1={BW} y1={CS*4} x2={BW} y2={CS*5} stroke={lc} strokeWidth={2} />
        <line x1={CS*3} y1={0}    x2={CS*5} y2={CS*2}  stroke={lc} strokeWidth={1.2} />
        <line x1={CS*5} y1={0}    x2={CS*3} y2={CS*2}  stroke={lc} strokeWidth={1.2} />
        <line x1={CS*3} y1={CS*7} x2={CS*5} y2={CS*9}  stroke={lc} strokeWidth={1.2} />
        <line x1={CS*5} y1={CS*7} x2={CS*3} y2={CS*9}  stroke={lc} strokeWidth={1.2} />
        <text x={CS*2} y={CS*4.63} fill={lc} fontSize={CS*0.40}
          fontFamily='"STKaiti","KaiTi",serif' textAnchor="middle" opacity={0.82}>楚 河</text>
        <text x={CS*6} y={CS*4.63} fill={lc} fontSize={CS*0.40}
          fontFamily='"STKaiti","KaiTi",serif' textAnchor="middle" opacity={0.82}>汉 界</text>
        <rect x={1} y={1} width={BW-2} height={BH-2}
          fill="none" stroke={lc} strokeWidth={2} />
      </svg>

      <div className="relative" style={{ width: BW, height: BH }}>

        {/* ── Click squares + highlight overlays ── */}
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const aR = isFlipped ? 9-r : r;
            const aC = isFlipped ? 8-c : c;
            const isValid = validMoves.some(m => m.to.r===aR && m.to.c===aC);
            const last    = game.history[game.history.length - 1];
            const isLast  = !isEditMode && !!last &&
              ((last.from.r===aR&&last.from.c===aC)||(last.to.r===aR&&last.to.c===aC));
            // Hint: only show destination dot (arrow covers from→to)
            const hTo = !!hintMove && hintMove.to.r===aR && hintMove.to.c===aC;

            return (
              <div key={`sq${r}${c}`}
                className="absolute flex items-center justify-center cursor-pointer"
                style={{ width:CS, height:CS, left:c*CS-CS/2, top:r*CS-CS/2, zIndex:10 }}
                onClick={() => handleClick(aR, aC)}
              >
                {/* Last-move amber glow */}
                {isLast && !hTo && (
                  <div className="absolute rounded-full pointer-events-none"
                    style={{ width:CS*0.82, height:CS*0.82, background:'rgba(255,200,0,0.30)' }} />
                )}
                {/* Hint destination dot */}
                {hTo && (
                  <div className="absolute rounded-full pointer-events-none animate-pulse"
                    style={{ width:CS*0.82, height:CS*0.82,
                      background:'rgba(34,197,94,0.32)', border:'2.5px solid rgba(22,163,74,0.85)' }} />
                )}
                {/* Valid-move dot */}
                {isValid && (
                  <div className="absolute rounded-full pointer-events-none"
                    style={{ width:CS*0.25, height:CS*0.25,
                      background:'rgba(59,130,246,0.80)',
                      boxShadow:'0 0 6px 1px rgba(59,130,246,0.42)' }} />
                )}
              </div>
            );
          })
        )}

        {/* ── Hint arrow overlay (above highlights, below pieces) ── */}
        {hintMove && (
          <HintArrow hintMove={hintMove} CS={CS} isFlipped={isFlipped} />
        )}

        {/* ── Pieces (spring slide + scale on select, NO bounce) ── */}
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const piece = game.getPiece(r, c);
            if (!piece) return null;
            const dR   = isFlipped ? 9-r : r;
            const dC   = isFlipped ? 8-c : c;
            const isSel = selected?.r===r && selected?.c===c;
            const ps   = CS * 0.86;

            return (
              <motion.div
                key={piece.id}
                initial={false}
                animate={{
                  left:   dC * CS - CS / 2,
                  top:    dR * CS - CS / 2,
                  scale:  isSel ? 1.08 : 1,
                  zIndex: isSel ? 30 : 20,
                }}
                transition={{
                  left:   { type: 'spring', stiffness: 400, damping: 30, mass: 0.75 },
                  top:    { type: 'spring', stiffness: 400, damping: 30, mass: 0.75 },
                  scale:  { type: 'spring', stiffness: 500, damping: 28, mass: 0.60 },
                  zIndex: { duration: 0 },
                }}
                style={{
                  position: 'absolute',
                  width: CS, height: CS,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <PieceDisc
                  char={PIECE_CHARS[`${piece.color}-${piece.type}`]}
                  isRed={piece.color === 'red'}
                  isSelected={isSel}
                  isArmored={piece.isArmored}
                  isDrifting={piece.isDrifting}
                  theme={pieceTheme}
                  size={ps}
                />
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
