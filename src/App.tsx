import React, { useState, useEffect, useRef } from 'react';
import { Board, BoardTheme, PieceTheme } from './components/Board';
import { Xiangqi, Move, Piece } from './game/xiangqi';
// @ts-ignore
import AiWorker from './game/aiWorker?worker';
import {
  Users, Cpu, ArrowLeft, Settings, Edit3, RotateCcw,
  Eraser, Trash2, RefreshCw, ChevronDown, ChevronUp, X,
  Lightbulb, Play
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { playMoveSound, playCaptureSound, playCheckSound } from './utils/sounds';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type GameMode = 'menu' | 'ai' | 'local' | 'edit' | 'custom';
// custom = post-edit "start game" config screen

interface CustomGameConfig {
  redPlayer: 'human' | 'ai';
  blackPlayer: 'human' | 'ai';
  firstMove: 'red' | 'black';
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '普通', 2: '村冠', 3: '镇冠', 4: '县冠', 5: '大师'
};

export default function App() {
  const [mode, setMode] = useState<GameMode>('menu');
  const [game, setGame] = useState(new Xiangqi());
  const [playerColor, setPlayerColor] = useState<'red' | 'black' | 'both'>('red');
  // For custom mode: which colors are AI
  const [aiColors, setAiColors] = useState<Set<'red' | 'black'>>(new Set(['black']));
  const [gameOver, setGameOver] = useState<string | null>(null);

  const [aiDifficulty, setAiDifficulty] = useState<number>(4);
  const [hintDifficulty, setHintDifficulty] = useState<number>(4);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('classic');
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>('classic');
  const [showSettings, setShowSettings] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [isHinting, setIsHinting] = useState(false);

  // Custom game config (after edit mode)
  const [customConfig, setCustomConfig] = useState<CustomGameConfig>({
    redPlayer: 'human',
    blackPlayer: 'ai',
    firstMove: 'red',
  });
  const [editedGame, setEditedGame] = useState<Xiangqi | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const hintWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new AiWorker();
    hintWorkerRef.current = new AiWorker();
    return () => {
      workerRef.current?.terminate();
      hintWorkerRef.current?.terminate();
    };
  }, []);

  const [editPiece, setEditPiece] = useState<Piece | 'eraser' | null>(null);
  const [editHistory, setEditHistory] = useState<Xiangqi[]>([]);
  const [isCheatModeUnlocked, setIsCheatModeUnlocked] = useState(false);
  const [cheatPassword, setCheatPassword] = useState('');
  const [activeCheat, setActiveCheat] = useState<'none' | 'armor' | 'drift' | 'revive' | 'betray'>('none');
  const [revivePiece, setRevivePiece] = useState<Piece | null>(null);

  // Determine if current turn is AI's turn
  const isAiTurn = (): boolean => {
    if (mode === 'ai') return game.turn !== playerColor;
    if (mode === 'custom') return aiColors.has(game.turn as 'red' | 'black');
    return false;
  };

  useEffect(() => {
    if (mode !== 'edit' && mode !== 'custom') {
      const winner = game.getWinner();
      if (winner) setGameOver(winner === 'draw' ? '和棋！' : `${winner === 'red' ? '红方' : '黑方'} 胜！`);
    }
  }, [game, mode]);

  // AI move trigger
  useEffect(() => {
    let isCancelled = false;
    const shouldAiMove = (mode === 'ai' || mode === 'custom') && isAiTurn() && !game.isGameOver();

    if (shouldAiMove) {
      setIsThinking(true);
      setAiProgress(0);
      setHintMove(null);

      if (workerRef.current) {
        workerRef.current.onmessage = (e) => {
          if (isCancelled) return;
          if (e.data.type === 'progress') {
            setAiProgress(e.data.progress);
          } else if (e.data.type === 'done') {
            const bestMove = e.data.move;
            if (bestMove) {
              const newGame = game.clone();
              const isCapture = newGame.getPiece(bestMove.to.r, bestMove.to.c) !== null;
              newGame.makeMove(bestMove);
              setGame(newGame);
              if (isCapture) playCaptureSound(); else playMoveSound();
              if (newGame.isInCheck(newGame.turn)) playCheckSound();
            }
            setIsThinking(false);
            setAiProgress(0);
          }
        };
        workerRef.current.postMessage({
          board: game.board, turn: game.turn,
          history: game.history, capturedPieces: game.capturedPieces,
          difficulty: aiDifficulty
        });
      }
    }
    return () => { isCancelled = true; };
  }, [game, mode, aiColors, playerColor, aiDifficulty]);

  const handleHint = () => {
    if (isHinting || isThinking) return;
    setIsHinting(true);
    setHintMove(null);

    if (hintWorkerRef.current) {
      hintWorkerRef.current.onmessage = (e) => {
        if (e.data.type === 'done') {
          setHintMove(e.data.move);
          setIsHinting(false);
        }
      };
      hintWorkerRef.current.postMessage({
        board: game.board, turn: game.turn,
        history: game.history, capturedPieces: game.capturedPieces,
        difficulty: hintDifficulty
      });
    }
  };

  const handleMove = (move: Move) => {
    if (isThinking) return;
    setHintMove(null);
    const newGame = game.clone();
    const isCapture = newGame.getPiece(move.to.r, move.to.c) !== null;
    if (newGame.makeMove(move)) {
      setGame(newGame);
      if (isCapture) playCaptureSound(); else playMoveSound();
      if (newGame.isInCheck(newGame.turn)) playCheckSound();
    }
  };

  const handleCheatAction = (r: number, c: number) => {
    const currentPlayerColor = mode === 'custom' ? game.turn as 'red' | 'black' : playerColor as 'red' | 'black';
    const piece = game.getPiece(r, c);
    const newGame = game.clone();
    let valid = false;
    if (activeCheat === 'armor' && piece && piece.color === currentPlayerColor && piece.type === 'p') {
      newGame.applyCheatArmor(r, c); valid = true;
    } else if (activeCheat === 'drift' && piece && piece.color === currentPlayerColor && piece.type === 'r') {
      newGame.applyCheatDrift(r, c); valid = true;
    } else if (activeCheat === 'revive' && !piece && revivePiece) {
      newGame.applyCheatRevive(r, c, revivePiece); valid = true; setRevivePiece(null);
    } else if (activeCheat === 'betray' && piece && piece.color !== currentPlayerColor && ['r','c','h','p'].includes(piece.type)) {
      newGame.applyCheatBetray(r, c); valid = true;
    }
    if (valid) { setGame(newGame); setActiveCheat('none'); }
  };

  const handleEditClick = (r: number, c: number) => {
    if (!editPiece) return;
    const newGame = game.clone();
    if (editPiece === 'eraser') {
      const p = newGame.getPiece(r, c);
      if (p && p.type === 'k') { alert('将帅不能被删除！'); return; }
      newGame.setPiece(r, c, null);
    } else {
      const isRed = editPiece.color === 'red';
      let valid = true;
      switch (editPiece.type) {
        case 'k': valid = isRed ? (r>=7&&r<=9&&c>=3&&c<=5) : (r>=0&&r<=2&&c>=3&&c<=5); break;
        case 'a': valid = isRed ? (r>=7&&r<=9&&c>=3&&c<=5&&(r+c)%2===0) : (r>=0&&r<=2&&c>=3&&c<=5&&(r+c)%2!==0); break;
        case 'e': valid = isRed ? (r>=5&&r<=9&&[0,2,4,6,8].includes(c)&&(r+c)%2!==0) : (r>=0&&r<=4&&[0,2,4,6,8].includes(c)&&(r+c)%2===0); break;
        case 'p': valid = isRed ? (r<=6&&(r<=4||[0,2,4,6,8].includes(c))) : (r>=3&&(r>=5||[0,2,4,6,8].includes(c))); break;
      }
      if (!valid) { alert('该棋子不能放置在此位置！'); return; }
      const existing = newGame.getPiece(r, c);
      if (existing && existing.type==='k' && existing.color!==editPiece.color) { alert('不能覆盖对方的将帅！'); return; }
      if (existing && existing.type==='k' && editPiece.type!=='k') { alert('将帅不能被覆盖！'); return; }
      if (editPiece.type !== 'k') {
        let count = 0;
        for (let i=0;i<10;i++) for (let j=0;j<9;j++) { const p=newGame.getPiece(i,j); if(p&&p.type===editPiece.type&&p.color===editPiece.color) count++; }
        if (!existing||existing.type!==editPiece.type||existing.color!==editPiece.color) {
          if (count >= (editPiece.type==='p'?5:2)) { alert('不能添加超过正常数量的棋子！'); return; }
        }
      }
      if (editPiece.type === 'k') {
        for (let i=0;i<10;i++) for (let j=0;j<9;j++) { const p=newGame.getPiece(i,j); if(p&&p.type==='k'&&p.color===editPiece.color) newGame.setPiece(i,j,null); }
      }
      newGame.setPiece(r, c, { ...editPiece, id:`${editPiece.type}_${editPiece.color}_${Date.now()}_${Math.random()}` });
    }
    setEditHistory(prev => [...prev, game]);
    setGame(newGame);
  };

  const handleUndo = () => {
    setHintMove(null);
    if (mode === 'edit') {
      if (editHistory.length > 0) { setGame(editHistory[editHistory.length-1]); setEditHistory(p=>p.slice(0,-1)); }
    } else {
      const g = game.clone();
      if (mode === 'ai') { g.undo(); g.undo(); }
      else if (mode === 'local') { g.undo(); }
      else if (mode === 'custom') {
        // Undo until it's a human's turn
        g.undo();
        if (aiColors.has(g.turn as 'red' | 'black')) g.undo();
      }
      setGame(g);
    }
  };

  const startLocal = () => {
    setMode('local'); setPlayerColor('both'); setGame(new Xiangqi());
    setGameOver(null); setIsCheatModeUnlocked(false); setActiveCheat('none');
    setDrawerOpen(false); setHintMove(null);
  };

  const startAI = (color: 'red'|'black') => {
    setMode('ai'); setPlayerColor(color); setGame(new Xiangqi());
    setGameOver(null); setIsCheatModeUnlocked(false); setActiveCheat('none');
    setDrawerOpen(false); setHintMove(null);
  };

  const restartGame = () => {
    setHintMove(null); setGameOver(null);
    if (mode === 'ai') startAI(playerColor as 'red'|'black');
    else if (mode === 'local') startLocal();
    else if (mode === 'custom' && editedGame) {
      startCustomGame(customConfig, editedGame);
    }
  };

  const startCustomGame = (config: CustomGameConfig, baseGame: Xiangqi) => {
    const g = baseGame.clone();
    g.turn = config.firstMove;
    g.history = [];
    const colors = new Set<'red' | 'black'>();
    if (config.redPlayer === 'ai') colors.add('red');
    if (config.blackPlayer === 'ai') colors.add('black');
    setAiColors(colors);
    setGame(g);
    setPlayerColor('both');
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
    setDrawerOpen(false);
    setHintMove(null);
    setMode('custom');
  };

  const startEdit = () => {
    setMode('edit'); setPlayerColor('both');
    const g = new Xiangqi(); g.clearBoard();
    g.setPiece(9,4,{id:'k_red',type:'k',color:'red'});
    g.setPiece(0,4,{id:'k_black',type:'k',color:'black'});
    setGame(g); setEditHistory([]); setEditPiece(null); setGameOver(null);
    setIsCheatModeUnlocked(false); setActiveCheat('none'); setDrawerOpen(false); setHintMove(null);
  };

  const finishEdit = () => {
    setEditedGame(game.clone());
    setCustomConfig({ redPlayer: 'human', blackPlayer: 'ai', firstMove: 'red' });
    setMode('custom');
  };

  const handleCheatUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (cheatPassword==='244039') { setIsCheatModeUnlocked(true); setCheatPassword(''); }
    else alert('密码错误！');
  };

  // Determine board flip and who can move
  const boardPlayerColor = (): 'red' | 'black' | 'both' => {
    if (mode === 'local') return 'both';
    if (mode === 'custom') {
      // If both are human, allow both. If one is human, show from that perspective.
      const humanColors: ('red'|'black')[] = [];
      if (!aiColors.has('red')) humanColors.push('red');
      if (!aiColors.has('black')) humanColors.push('black');
      if (humanColors.length === 2 || humanColors.length === 0) return 'both';
      return humanColors[0];
    }
    return playerColor as 'red' | 'black' | 'both';
  };

  // ─── MENU ────────────────────────────────────────────────────────
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-4 py-8"
        style={{ fontFamily: "'Noto Serif SC', 'STKaiti', serif" }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-amber-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-b from-red-700 to-red-800 px-6 py-8 text-center">
            <div className="text-5xl font-bold text-yellow-300 tracking-widest mb-1">中国象棋</div>
            <div className="text-red-200 text-sm tracking-widest">千年智慧 · 方寸博弈</div>
          </div>

          <div className="p-5 space-y-3">
            {/* AI game */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-4 h-4 text-red-600" />
                <span className="text-red-700 font-bold text-sm">人机对战</span>
                <span className="ml-auto text-xs text-red-400 bg-red-100 px-2 py-0.5 rounded-full">
                  {DIFFICULTY_LABELS[aiDifficulty]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>startAI('red')}
                  className="py-3 bg-red-700 hover:bg-red-800 text-yellow-200 rounded-xl font-bold text-base shadow active:scale-95 transition-transform">
                  执红先手
                </button>
                <button onClick={()=>startAI('black')}
                  className="py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-base shadow active:scale-95 transition-transform">
                  执黑后手
                </button>
              </div>
            </div>

            {/* Other buttons */}
            {[
              { icon:<Users className="w-5 h-5 text-green-600"/>, label:'双人对战', sub:'本地双人轮流操作', color:'bg-green-50 border-green-200', action:startLocal },
              { icon:<Edit3 className="w-5 h-5 text-blue-600"/>, label:'打谱模式', sub:'摆局面 · 自由对弈', color:'bg-blue-50 border-blue-200', action:startEdit },
              { icon:<Settings className="w-5 h-5 text-purple-600"/>, label:'设置', sub:'棋盘 · 棋子 · 难度', color:'bg-purple-50 border-purple-200', action:()=>setShowSettings(true) },
            ].map(({icon,label,sub,color,action}) => (
              <button key={label} onClick={action}
                className={cn("w-full border rounded-2xl p-4 text-left flex items-center gap-4 active:scale-[0.98] transition-transform", color)}>
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">{icon}</div>
                <div>
                  <div className="font-bold text-gray-800 text-base">{label}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {showSettings && (
          <SettingsModal {...{aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme}}
            onClose={()=>setShowSettings(false)} />
        )}
      </div>
    );
  }

  // ─── CUSTOM GAME SETUP (after edit) ──────────────────────────────
  if (mode === 'custom' && editedGame && !game.history.length && !aiColors.size && !(aiColors.size > 0)) {
    // Actually we need a proper check: show setup only when entering from edit
    // We'll handle this with a separate flag - editedGame !== null && mode === 'custom' with game not yet started
  }

  // ─── EDIT MODE: custom game setup overlay ─────────────────────────
  // Show this when mode was just set to 'custom' from finishEdit
  const showCustomSetup = mode === 'custom' && editedGame !== null && game === editedGame;

  if (showCustomSetup) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-4 py-8"
        style={{ fontFamily: "'Noto Serif SC', 'STKaiti', serif" }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-amber-200 overflow-hidden">
          <div className="bg-gradient-to-b from-blue-700 to-blue-800 px-6 py-6 text-center">
            <div className="text-2xl font-bold text-white mb-1">对局设置</div>
            <div className="text-blue-200 text-sm">配置打谱局面的对弈方式</div>
          </div>
          <div className="p-5 space-y-4">
            {/* First move */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
              <div className="font-bold text-gray-700 mb-3">先手方</div>
              <div className="grid grid-cols-2 gap-2">
                {(['red','black'] as const).map(c => (
                  <button key={c} onClick={()=>setCustomConfig(p=>({...p,firstMove:c}))}
                    className={cn("py-3 rounded-xl font-bold text-sm transition-all",
                      customConfig.firstMove === c
                        ? (c==='red' ? 'bg-red-700 text-yellow-200 shadow' : 'bg-gray-800 text-white shadow')
                        : 'bg-gray-100 text-gray-600')}>
                    {c==='red' ? '🔴 红方先走' : '⚫ 黑方先走'}
                  </button>
                ))}
              </div>
            </div>

            {/* Red player */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="font-bold text-red-700 mb-3">红方由谁执棋</div>
              <div className="grid grid-cols-2 gap-2">
                {([['human','👤 人类'],['ai','🤖 电脑']] as const).map(([v,label]) => (
                  <button key={v} onClick={()=>setCustomConfig(p=>({...p,redPlayer:v}))}
                    className={cn("py-3 rounded-xl font-bold text-sm transition-all",
                      customConfig.redPlayer === v ? 'bg-red-700 text-yellow-200 shadow' : 'bg-white border border-red-200 text-red-700')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Black player */}
            <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
              <div className="font-bold text-gray-700 mb-3">黑方由谁执棋</div>
              <div className="grid grid-cols-2 gap-2">
                {([['human','👤 人类'],['ai','🤖 电脑']] as const).map(([v,label]) => (
                  <button key={v} onClick={()=>setCustomConfig(p=>({...p,blackPlayer:v}))}
                    className={cn("py-3 rounded-xl font-bold text-sm transition-all",
                      customConfig.blackPlayer === v ? 'bg-gray-800 text-white shadow' : 'bg-white border border-gray-300 text-gray-700')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={startEdit}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4"/>返回编辑
              </button>
              <button onClick={()=>startCustomGame(customConfig, editedGame!)}
                className="flex-1 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow">
                <Play className="w-4 h-4"/>开始对弈
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── GAME SCREEN ─────────────────────────────────────────────────
  const turnColor = game.turn;
  const currentBoardPlayerColor = boardPlayerColor();

  const humanTurn = mode === 'custom'
    ? !aiColors.has(game.turn as 'red'|'black')
    : (mode === 'local' || game.turn === playerColor);

  // Labels
  const getPlayerLabel = (color: 'red'|'black') => {
    if (mode === 'ai') return color === playerColor ? '我' : '电脑';
    if (mode === 'custom') return aiColors.has(color) ? '电脑' : '玩家';
    return color === 'red' ? '红方' : '黑方';
  };

  return (
    <div className="h-screen max-h-screen flex flex-col bg-amber-50 overflow-hidden"
      style={{ fontFamily: "'Noto Serif SC', 'STKaiti', serif" }}>

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-amber-200 shadow-sm shrink-0">
        <button onClick={()=>setMode('menu')}
          className="flex items-center gap-1.5 text-gray-600 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">返回</span>
        </button>

        <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 rounded-full border border-amber-300">
          <div className={cn("w-3 h-3 rounded-full shrink-0 shadow-sm",
            turnColor==='red' ? 'bg-red-600' : 'bg-gray-800',
            isThinking && 'animate-pulse'
          )} />
          <span className="text-sm font-bold text-amber-900">
            {isThinking ? `思考中 ${aiProgress}%` : (turnColor==='red'?'红方走棋':'黑方走棋')}
          </span>
        </div>

        <button onClick={()=>setShowSettings(true)}
          className="p-2 text-gray-500 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* PROGRESS BAR */}
      <div className="h-1 bg-amber-100 shrink-0">
        <div className="h-full bg-red-500 transition-all duration-300 ease-out"
          style={{ width: isThinking ? `${aiProgress}%` : '0%' }} />
      </div>

      {/* OPPONENT STRIP */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-amber-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn("w-3 h-3 rounded-full shadow-sm",
            (mode==='ai'&&playerColor==='red')||
            (mode==='custom'&&!aiColors.has('black')) ? 'bg-gray-800' : 'bg-gray-800'
          )} />
          <span className="text-sm font-medium text-gray-600">
            黑方：{getPlayerLabel('black')}
            {mode==='local' && <span className="text-xs text-gray-400 ml-1">（双人模式）</span>}
          </span>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{game.history.length} 步</span>
      </div>

      {/* BOARD AREA */}
      <div className="flex-1 flex items-center justify-center py-1 px-1 min-h-0">
        <div className="relative w-full h-full flex items-center justify-center">
          <Board
            game={game}
            playerColor={currentBoardPlayerColor}
            onMove={handleMove}
            boardTheme={boardTheme}
            pieceTheme={pieceTheme}
            isEditMode={mode==='edit'}
            onEditClick={handleEditClick}
            onSquareClickOverride={activeCheat!=='none'?handleCheatAction:undefined}
            hintMove={hintMove}
          />
          {gameOver && mode !== 'edit' && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded z-50">
              <div className="bg-white border border-amber-200 rounded-3xl p-6 mx-6 text-center w-full max-w-xs shadow-2xl">
                <div className="text-4xl font-bold text-red-700 mb-2">{gameOver}</div>
                <div className="text-gray-500 text-sm mb-5">共走 {game.history.length} 步</div>
                <div className="flex gap-2">
                  <button onClick={restartGame}
                    className="flex-1 py-3 bg-red-700 text-yellow-200 rounded-xl font-bold text-base shadow">
                    再来一局
                  </button>
                  <button onClick={()=>setMode('menu')}
                    className="flex-1 py-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-base font-medium">
                    主菜单
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MY STRIP */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-t border-amber-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-600 shadow-sm" />
          <span className="text-sm font-bold text-red-700">
            红方：{getPlayerLabel('red')}
          </span>
        </div>
        {activeCheat !== 'none' && (
          <span className="text-red-600 text-xs font-medium animate-pulse bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
            点击棋盘目标格
          </span>
        )}
        {mode==='edit' && editPiece && editPiece!=='eraser' && (
          <span className="text-blue-600 text-xs font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            点击棋盘放置棋子
          </span>
        )}
        {hintMove && !isHinting && (
          <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
            💡 已显示提示
          </span>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div className="bg-white border-t border-amber-200 shadow-sm shrink-0">
        <div className="flex items-stretch gap-2 px-3 py-2.5">
          <button onClick={handleUndo}
            disabled={(mode==='edit'?editHistory.length===0:game.history.length===0)||isThinking}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium disabled:opacity-30 active:scale-95 transition-all">
            <RotateCcw className="w-4 h-4" />
            悔棋
          </button>

          {mode !== 'edit' && (
            <button onClick={restartGame} disabled={isThinking}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium disabled:opacity-30 active:scale-95 transition-all">
              <RefreshCw className="w-4 h-4" />
              重开
            </button>
          )}

          {/* Hint button (not in edit mode) */}
          {mode !== 'edit' && humanTurn && !isThinking && (
            <button onClick={handleHint} disabled={isHinting || isThinking || !!game.getWinner()}
              className={cn("flex-1 flex flex-col items-center justify-center gap-1 py-2.5 border rounded-xl text-sm font-medium active:scale-95 transition-all",
                isHinting ? "bg-yellow-100 border-yellow-300 text-yellow-700 animate-pulse"
                  : "bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-700 disabled:opacity-30"
              )}>
              <Lightbulb className="w-4 h-4" />
              {isHinting ? '分析中' : '提示'}
            </button>
          )}

          {/* Edit mode: finish edit */}
          {mode === 'edit' && (
            <button onClick={finishEdit}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-blue-600 hover:bg-blue-700 border border-blue-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-all">
              <Play className="w-4 h-4" />
              开始对局
            </button>
          )}

          <button onClick={()=>setDrawerOpen(o=>!o)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 border rounded-xl text-sm font-medium transition-all active:scale-95",
              drawerOpen ? "bg-amber-100 border-amber-400 text-amber-800" : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
            )}>
            {drawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            {mode==='edit' ? '编辑' : '秘籍'}
          </button>
        </div>

        {/* DRAWER */}
        {drawerOpen && (
          <div className="border-t border-amber-200 px-3 pt-3 pb-3 space-y-3 bg-amber-50">
            {mode === 'edit' ? (
              <EditDrawer
                game={game}
                editPiece={editPiece}
                setEditPiece={setEditPiece}
                onReset={()=>{setEditHistory(p=>[...p,game]);setGame(new Xiangqi());}}
                onClear={()=>{const g=game.clone();setEditHistory(p=>[...p,game]);g.clearBoard();g.setPiece(9,4,{id:'k_red',type:'k',color:'red'});g.setPiece(0,4,{id:'k_black',type:'k',color:'black'});setGame(g);}}
              />
            ) : (
              <CheatDrawer
                game={game}
                playerColor={mode==='custom' ? game.turn as 'red'|'black' : playerColor as 'red'|'black'}
                isCheatModeUnlocked={isCheatModeUnlocked}
                cheatPassword={cheatPassword}
                setCheatPassword={setCheatPassword}
                activeCheat={activeCheat}
                setActiveCheat={setActiveCheat}
                revivePiece={revivePiece}
                setRevivePiece={setRevivePiece}
                onUnlock={handleCheatUnlock}
                hintDifficulty={hintDifficulty}
                setHintDifficulty={setHintDifficulty}
              />
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal {...{aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme}}
          onClose={()=>setShowSettings(false)} />
      )}
    </div>
  );
}

// ─── EDIT DRAWER ─────────────────────────────────────────────────
function EditDrawer({ game, editPiece, setEditPiece, onReset, onClear }: {
  game: Xiangqi;
  editPiece: Piece | 'eraser' | null;
  setEditPiece: (p: Piece | 'eraser' | null) => void;
  onReset: () => void;
  onClear: () => void;
}) {
  const SERIF = { fontFamily: "'Noto Serif SC','STKaiti',serif" };
  return (
    <div className="space-y-3" style={SERIF}>
      <div className="flex gap-2">
        <button onClick={onReset}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-95 transition-all">
          <RefreshCw className="w-3.5 h-3.5"/>初始局面
        </button>
        <button onClick={onClear}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-95 transition-all">
          <Trash2 className="w-3.5 h-3.5"/>清空棋盘
        </button>
      </div>
      <div>
        <div className="text-red-600 text-xs font-bold mb-2 pl-1">红方棋子</div>
        <div className="flex gap-1.5">
          {(['k','a','e','h','r','c','p'] as const).map(type=>(
            <button key={`r-${type}`} onClick={()=>setEditPiece({id:`${type}_red`,type,color:'red'})}
              className={cn("flex-1 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all",
                editPiece!=='eraser'&&(editPiece as Piece)?.type===type&&(editPiece as Piece)?.color==='red'
                  ?"border-red-700 bg-red-700 text-yellow-200 scale-110 shadow"
                  :"border-red-200 bg-white text-red-700 hover:bg-red-50")}>
              {type==='k'?'帅':type==='a'?'仕':type==='e'?'相':type==='h'?'马':type==='r'?'车':type==='c'?'炮':'兵'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-gray-600 text-xs font-bold mb-2 pl-1">黑方棋子</div>
        <div className="flex gap-1.5">
          {(['k','a','e','h','r','c','p'] as const).map(type=>(
            <button key={`b-${type}`} onClick={()=>setEditPiece({id:`${type}_black`,type,color:'black'})}
              className={cn("flex-1 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all",
                editPiece!=='eraser'&&(editPiece as Piece)?.type===type&&(editPiece as Piece)?.color==='black'
                  ?"border-gray-800 bg-gray-800 text-white scale-110 shadow"
                  :"border-gray-300 bg-white text-gray-800 hover:bg-gray-50")}>
              {type==='k'?'将':type==='a'?'士':type==='e'?'象':type==='h'?'马':type==='r'?'车':type==='c'?'炮':'卒'}
            </button>
          ))}
        </div>
      </div>
      <button onClick={()=>setEditPiece('eraser')}
        className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all active:scale-95",
          editPiece==='eraser'?"border-orange-400 bg-orange-100 text-orange-700":"border-gray-200 bg-white text-gray-500 hover:bg-gray-50")}>
        <Eraser className="w-4 h-4"/>橡皮擦
      </button>
    </div>
  );
}

// ─── CHEAT DRAWER ─────────────────────────────────────────────────
function CheatDrawer({ game, playerColor, isCheatModeUnlocked, cheatPassword, setCheatPassword,
  activeCheat, setActiveCheat, revivePiece, setRevivePiece, onUnlock, hintDifficulty, setHintDifficulty }: any) {
  const SERIF = { fontFamily: "'Noto Serif SC','STKaiti',serif" };
  return (
    <div className="space-y-3" style={SERIF}>
      {/* Hint difficulty setting */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-600"/>
            <span className="text-sm font-bold text-yellow-700">提示强度</span>
          </div>
          <select value={hintDifficulty} onChange={(e)=>setHintDifficulty(Number(e.target.value))}
            className="bg-white border border-yellow-300 text-yellow-800 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-yellow-500">
            <option value={1}>普通</option>
            <option value={2}>村冠</option>
            <option value={3}>镇冠</option>
            <option value={4}>县冠</option>
            <option value={5}>大师</option>
          </select>
        </div>
        <div className="text-xs text-yellow-600 mt-1.5">强度越高分析越准，思考时间越长</div>
      </div>

      {/* Cheat unlock */}
      {!isCheatModeUnlocked ? (
        <form onSubmit={onUnlock} className="flex gap-2">
          <input type="password" value={cheatPassword} onChange={(e:any)=>setCheatPassword(e.target.value)}
            placeholder="输入秘籍密码"
            className="flex-1 bg-white border border-gray-300 text-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 placeholder:text-gray-300"/>
          <button type="submit"
            className="px-5 bg-red-700 text-yellow-200 rounded-xl text-sm font-bold hover:bg-red-800 active:scale-95 transition-all">
            解锁
          </button>
        </form>
      ) : (
        <>
          <div className="text-gray-500 text-xs bg-white border border-gray-200 rounded-xl p-2 text-center">选择技能后点击棋盘目标</div>
          <div className="grid grid-cols-3 gap-2">
            {([['armor','铁甲兵'],['drift','漂移车'],['betray','策反']] as const).map(([id,label])=>(
              <button key={id} onClick={()=>setActiveCheat(activeCheat===id?'none':id)}
                className={cn("py-2.5 rounded-xl text-sm font-medium border transition-all active:scale-95",
                  activeCheat===id?"bg-red-700 border-red-700 text-yellow-200 shadow":"bg-white border-gray-200 text-gray-700 hover:bg-gray-50")}>
                {label}
              </button>
            ))}
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-2 pl-1">复活阵亡棋子</div>
            <div className="flex flex-wrap gap-1.5">
              {game.capturedPieces.filter((p:any)=>p.color===playerColor).map((p:any,i:number)=>(
                <button key={i} onClick={()=>{setRevivePiece(p);setActiveCheat('revive');}}
                  className={cn("w-9 h-9 rounded-full border-2 text-sm font-bold transition-all active:scale-95",
                    activeCheat==='revive'&&revivePiece===p
                      ?"bg-red-700 border-red-700 text-yellow-200 shadow"
                      :"bg-white border-gray-300 text-gray-700 hover:bg-gray-50")}>
                  {p.type==='r'?'车':p.type==='h'?'马':p.type==='c'?'炮':p.type==='e'?'相':p.type==='a'?'仕':'兵'}
                </button>
              ))}
              {game.capturedPieces.filter((p:any)=>p.color===playerColor).length===0&&
                <span className="text-gray-400 text-xs py-2">无阵亡棋子</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────
interface SettingsModalProps {
  aiDifficulty:number; setAiDifficulty:(v:number)=>void;
  boardTheme:BoardTheme; setBoardTheme:(v:BoardTheme)=>void;
  pieceTheme:PieceTheme; setPieceTheme:(v:PieceTheme)=>void;
  onClose:()=>void;
}
function SettingsModal({aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme,onClose}:SettingsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50"
      style={{ fontFamily:"'Noto Serif SC','STKaiti',serif" }}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl border border-amber-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-amber-100">
          <h2 className="text-xl font-bold text-gray-800">设置</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl active:scale-95 transition-all">
            <X className="w-5 h-5"/>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {[
            { label:'人机难度', value:aiDifficulty, onChange:(v:string)=>setAiDifficulty(Number(v)),
              options:[['1','普通'],['2','村冠'],['3','镇冠'],['4','县冠'],['5','大师']] },
            { label:'棋盘样式', value:boardTheme, onChange:(v:string)=>setBoardTheme(v as BoardTheme),
              options:[['classic','经典'],['wood','木纹'],['paper','纸质']] },
            { label:'棋子样式', value:pieceTheme, onChange:(v:string)=>setPieceTheme(v as PieceTheme),
              options:[['classic','经典'],['wood','木质'],['flat','扁平']] },
          ].map(({label,value,onChange,options})=>(
            <div key={label} className="flex items-center justify-between">
              <span className="text-gray-700 font-medium text-base">{label}</span>
              <select value={value} onChange={e=>onChange(e.target.value)}
                className="bg-amber-50 border border-amber-300 text-gray-800 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-amber-500">
                {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="px-5 pb-6">
          <button onClick={onClose}
            className="w-full py-3.5 bg-red-700 hover:bg-red-800 text-yellow-200 rounded-xl font-bold text-base active:scale-95 transition-all shadow">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
