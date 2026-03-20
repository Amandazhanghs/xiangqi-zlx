import React from 'react';
import { Xiangqi, Move } from '../game/xiangqi';
import { motion } from 'motion/react';
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

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
// Piece3D: renders a single lacquered wooden chess disc with:
//   - Multi-stop radial gradient (bright top-left → dark bottom-right)
//   - Gloss highlight overlay (top-left ellipse)
//   - Inner decorative ring
//   - Multi-layer box-shadow (drop + inner highlight + inner shadow)
//   - Selection blue halo
// ─────────────────────────────────────────────────────────────────
const Piece3D = React.memo(function Piece3D({
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

  // --- colour tokens ---
  let gradient: string;
  let rimColor: string;
  let textColor: string;
  let ringColor: string;
  let shadowRgba: string;

  if (theme === 'flat') {
    gradient    = isRed ? '#fff0e0' : '#f4f0e8';
    rimColor    = isRed ? '#cc3333' : '#555555';
    textColor   = isRed ? '#990000' : '#1a1a1a';
    ringColor   = isRed ? '#ee8888' : '#aaaaaa';
    shadowRgba  = isRed ? 'rgba(160,50,50,0.38)' : 'rgba(50,50,50,0.38)';
  } else if (theme === 'wood') {
    if (isRed) {
      gradient   = `radial-gradient(ellipse 64% 56% at 34% 26%,
        #fff5c0 0%, #f5c840 20%, #d48a0c 52%, #8b5400 80%, #4a2c00 100%)`;
      rimColor   = '#6a3c00';
      textColor  = '#5a0000';
      ringColor  = '#c08820';
      shadowRgba = 'rgba(90,48,0,0.68)';
    } else {
      gradient   = `radial-gradient(ellipse 64% 56% at 34% 26%,
        #f0e8cc 0%, #d0b068 20%, #9c7038 52%, #5a3c18 80%, #2c1c08 100%)`;
      rimColor   = '#2c1808';
      textColor  = '#100a02';
      ringColor  = '#785838';
      shadowRgba = 'rgba(12,8,2,0.68)';
    }
  } else {
    // classic — richest lacquer finish
    if (isRed) {
      gradient   = `radial-gradient(ellipse 64% 56% at 34% 26%,
        #ffffff 0%, #ffe898 14%, #ffcc40 36%, #d48800 62%, #8a5000 84%, #4c2800 100%)`;
      rimColor   = '#8a5200';
      textColor  = '#780000';
      ringColor  = '#d4a020';
      shadowRgba = 'rgba(120,70,0,0.64)';
    } else {
      gradient   = `radial-gradient(ellipse 64% 56% at 34% 26%,
        #ffffff 0%, #f2e8d4 14%, #d8c498 36%, #a08860 62%, #5c3c20 84%, #2c1808 100%)`;
      rimColor   = '#3a2410';
      textColor  = '#0c0804';
      ringColor  = '#806448';
      shadowRgba = 'rgba(12,8,4,0.68)';
    }
  }

  const rimW        = Math.max(2, Math.round(s * 0.055));
  const innerRing   = Math.round(s * 0.09);
  const shadowY     = Math.round(s * 0.055);
  const shadowBlur  = Math.round(s * 0.15);
  const shadowSprea = Math.round(s * 0.02);

  const boxShadow = [
    // 1. cast shadow
    `0 ${shadowY}px ${shadowBlur}px ${shadowSprea}px ${shadowRgba}`,
    // 2. inner top-left highlight (convex gloss)
    theme !== 'flat'
      ? `inset 0 ${Math.round(s*0.07)}px ${Math.round(s*0.14)}px rgba(255,255,255,0.55)`
      : undefined,
    // 3. inner bottom-right shadow (depth)
    theme !== 'flat'
      ? `inset 0 -${Math.round(s*0.05)}px ${Math.round(s*0.10)}px rgba(0,0,0,0.40)`
      : undefined,
    // 4. selection halo
    isSelected
      ? `0 0 0 ${Math.round(s*0.10)}px rgba(59,130,246,0.92), 0 0 ${Math.round(s*0.22)}px rgba(59,130,246,0.55)`
      : undefined,
  ].filter(Boolean).join(', ');

  return (
    <div style={{
      width: s, height: s,
      borderRadius: '50%',
      background: gradient,
      border: `${rimW}px solid ${rimColor}`,
      boxShadow,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Decorative inner ring */}
      {theme !== 'flat' && (
        <div style={{
          position: 'absolute', inset: innerRing,
          borderRadius: '50%',
          border: `1px solid ${ringColor}`,
          opacity: 0.60,
          pointerEvents: 'none',
        }} />
      )}

      {/* Sharp gloss highlight — top-left ellipse */}
      {theme !== 'flat' && (
        <div style={{
          position: 'absolute',
          top: Math.round(s * 0.07),
          left: Math.round(s * 0.09),
          width:  Math.round(s * 0.44),
          height: Math.round(s * 0.30),
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 38% 38%, rgba(255,255,255,0.76) 0%, rgba(255,255,255,0) 72%)',
          transform: 'rotate(-18deg)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Chinese character */}
      <span style={{
        fontSize: s * 0.42,
        fontFamily: '"STKaiti","KaiTi","Kaiti SC","Noto Serif SC",serif',
        fontWeight: 700,
        color: textColor,
        lineHeight: 1,
        position: 'relative',
        zIndex: 1,
        textShadow: theme !== 'flat'
          ? '0 1px 2px rgba(255,255,255,0.48), 0 -1px 1px rgba(0,0,0,0.28)'
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
          zIndex: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.55)',
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
          zIndex: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.55)',
        }}>飘</span>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────
// BOARD
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
  // Track which piece id just landed to trigger settle animation
  const [justLanded, setJustLanded] = React.useState<string | null>(null);

  // Responsive sizing
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

  // On each new move: clear selection + trigger settle squish
  React.useEffect(() => {
    setSelected(null);
    setValidMoves([]);
    const last = game.history[game.history.length - 1];
    if (last) {
      const p = game.getPiece(last.to.r, last.to.c);
      if (p?.id) {
        setJustLanded(p.id);
        const tid = window.setTimeout(() => setJustLanded(null), 360);
        return () => window.clearTimeout(tid);
      }
    }
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
          '0 12px 40px rgba(0,0,0,0.45)',
          '0 4px 10px rgba(0,0,0,0.28)',
          'inset 0 1px 3px rgba(255,255,255,0.20)',
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

        {/* Click squares + highlight overlays */}
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const aR = isFlipped ? 9-r : r;
            const aC = isFlipped ? 8-c : c;
            const isValid    = validMoves.some(m => m.to.r===aR && m.to.c===aC);
            const last       = game.history[game.history.length - 1];
            const isLast     = !isEditMode && !!last &&
              ((last.from.r===aR&&last.from.c===aC)||(last.to.r===aR&&last.to.c===aC));
            const hFrom = !!hintMove && hintMove.from.r===aR && hintMove.from.c===aC;
            const hTo   = !!hintMove && hintMove.to.r===aR   && hintMove.to.c===aC;

            return (
              <div key={`sq${r}${c}`}
                className="absolute flex items-center justify-center cursor-pointer"
                style={{ width:CS, height:CS, left:c*CS-CS/2, top:r*CS-CS/2, zIndex:10 }}
                onClick={() => handleClick(aR, aC)}
              >
                {isLast && !hFrom && !hTo && (
                  <div className="absolute rounded-full pointer-events-none"
                    style={{ width:CS*0.82, height:CS*0.82, background:'rgba(255,200,0,0.32)' }} />
                )}
                {hFrom && (
                  <div className="absolute rounded-full pointer-events-none animate-pulse"
                    style={{ width:CS*0.82, height:CS*0.82,
                      background:'rgba(250,204,21,0.48)', border:'2px solid rgba(234,179,8,0.88)' }} />
                )}
                {hTo && (
                  <div className="absolute rounded-full pointer-events-none animate-pulse"
                    style={{ width:CS*0.82, height:CS*0.82,
                      background:'rgba(34,197,94,0.36)', border:'2.5px solid rgba(22,163,74,0.88)' }} />
                )}
                {isValid && (
                  <div className="absolute rounded-full pointer-events-none"
                    style={{ width:CS*0.25, height:CS*0.25,
                      background:'rgba(59,130,246,0.80)',
                      boxShadow:'0 0 6px 1px rgba(59,130,246,0.45)' }} />
                )}
              </div>
            );
          })
        )}

        {/* Pieces */}
        {Array.from({ length: 10 }).map((_, r) =>
          Array.from({ length: 9 }).map((_, c) => {
            const piece = game.getPiece(r, c);
            if (!piece) return null;
            const dR   = isFlipped ? 9-r : r;
            const dC   = isFlipped ? 8-c : c;
            const isSel = selected?.r===r && selected?.c===c;
            const landing = justLanded === piece.id;
            const ps  = CS * 0.86;

            return (
              <motion.div
                key={piece.id}
                initial={false}
                /* ── Position + lift-on-select ── */
                animate={{
                  left:  dC * CS - CS / 2,
                  top:   dR * CS - CS / 2,
                  scale: isSel ? 1.10 : 1,
                  zIndex: isSel ? 30 : 20,
                }}
                transition={{
                  // Smooth physics slide — fast enough to feel responsive,
                  // slow enough to follow the arc naturally
                  left:  { type:'spring', stiffness:400, damping:30, mass:0.75 },
                  top:   { type:'spring', stiffness:400, damping:30, mass:0.75 },
                  // Snappy scale pop on selection
                  scale: { type:'spring', stiffness:520, damping:26, mass:0.55 },
                  zIndex:{ duration:0 },
                }}
                style={{
                  position: 'absolute',
                  width: CS, height: CS,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {/*
                  Settle "squish" is on a child div so it doesn't
                  conflict with the parent's spring-based position.
                  When landing=true the piece squishes down then bounces
                  back, mimicking a physical piece hitting the board.
                */}
                <motion.div
                  animate={landing
                    ? {
                        scaleY: [1, 0.88, 1.08, 0.96, 1.01, 1.00],
                        scaleX: [1, 1.08, 0.94, 1.03, 0.99, 1.00],
                      }
                    : { scaleY: 1, scaleX: 1 }
                  }
                  transition={{
                    duration: 0.32,
                    ease: [0.18, 1.2, 0.40, 1],
                  }}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >
                  <Piece3D
                    char={PIECE_CHARS[`${piece.color}-${piece.type}`]}
                    isRed={piece.color === 'red'}
                    isSelected={isSel}
                    isArmored={piece.isArmored}
                    isDrifting={piece.isDrifting}
                    theme={pieceTheme}
                    size={ps}
                  />
                </motion.div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
