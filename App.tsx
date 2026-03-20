import React, { useState, useEffect, useRef } from 'react';
import { Board, BoardTheme, PieceTheme } from './components/Board';
import { Xiangqi, Move, Piece } from './game/xiangqi';
// @ts-ignore
import AiWorker from './game/aiWorker?worker';
import {
  Users, Cpu, ArrowLeft, Settings, Edit3, RotateCcw,
  Eraser, Trash2, RefreshCw, ChevronDown, ChevronUp, X
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { playMoveSound, playCaptureSound, playCheckSound } from './utils/sounds';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type GameMode = 'menu' | 'ai' | 'local' | 'edit';

export default function App() {
  const [mode, setMode] = useState<GameMode>('menu');
  const [game, setGame] = useState(new Xiangqi());
  const [playerColor, setPlayerColor] = useState<'red' | 'black' | 'both'>('red');
  const [gameOver, setGameOver] = useState<string | null>(null);

  const [aiDifficulty, setAiDifficulty] = useState<number>(3);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('wood');
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>('wood');
  const [showSettings, setShowSettings] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new AiWorker();
    return () => { workerRef.current?.terminate(); };
  }, []);

  const [editPiece, setEditPiece] = useState<Piece | 'eraser' | null>(null);
  const [editHistory, setEditHistory] = useState<Xiangqi[]>([]);
  const [isCheatModeUnlocked, setIsCheatModeUnlocked] = useState(false);
  const [cheatPassword, setCheatPassword] = useState('');
  const [activeCheat, setActiveCheat] = useState<'none' | 'armor' | 'drift' | 'revive' | 'betray'>('none');
  const [revivePiece, setRevivePiece] = useState<Piece | null>(null);

  useEffect(() => {
    if (mode !== 'edit') {
      const winner = game.getWinner();
      if (winner) setGameOver(winner === 'draw' ? '和棋！' : `${winner === 'red' ? '红方' : '黑方'} 胜！`);
    }
  }, [game, mode]);

  useEffect(() => {
    let isCancelled = false;
    if (mode === 'ai' && game.turn !== playerColor && !game.isGameOver()) {
      setIsThinking(true);
      setAiProgress(0);
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
  }, [game, mode, playerColor, aiDifficulty]);

  const handleMove = (move: Move) => {
    if (isThinking) return;
    const newGame = game.clone();
    const isCapture = newGame.getPiece(move.to.r, move.to.c) !== null;
    if (newGame.makeMove(move)) {
      setGame(newGame);
      if (isCapture) playCaptureSound(); else playMoveSound();
      if (newGame.isInCheck(newGame.turn)) playCheckSound();
    }
  };

  const handleCheatAction = (r: number, c: number) => {
    const piece = game.getPiece(r, c);
    const newGame = game.clone();
    let valid = false;
    if (activeCheat === 'armor' && piece && piece.color === playerColor && piece.type === 'p') {
      newGame.applyCheatArmor(r, c); valid = true;
    } else if (activeCheat === 'drift' && piece && piece.color === playerColor && piece.type === 'r') {
      newGame.applyCheatDrift(r, c); valid = true;
    } else if (activeCheat === 'revive' && !piece && revivePiece) {
      newGame.applyCheatRevive(r, c, revivePiece); valid = true; setRevivePiece(null);
    } else if (activeCheat === 'betray' && piece && piece.color !== playerColor && ['r','c','h','p'].includes(piece.type)) {
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
    if (mode === 'edit') {
      if (editHistory.length > 0) { setGame(editHistory[editHistory.length-1]); setEditHistory(p=>p.slice(0,-1)); }
    } else {
      const g = game.clone();
      if (mode==='ai') { g.undo(); g.undo(); }
      else if (mode==='local') { g.undo(); }
      setGame(g);
    }
  };

  const startLocal = () => {
    setMode('local'); setPlayerColor('both'); setGame(new Xiangqi());
    setGameOver(null); setIsCheatModeUnlocked(false); setActiveCheat('none'); setDrawerOpen(false);
  };
  const startAI = (color: 'red'|'black') => {
    setMode('ai'); setPlayerColor(color); setGame(new Xiangqi());
    setGameOver(null); setIsCheatModeUnlocked(false); setActiveCheat('none'); setDrawerOpen(false);
  };
  const restartGame = () => { if (mode==='ai') startAI(playerColor as 'red'|'black'); else if (mode==='local') startLocal(); };
  const startEdit = () => {
    setMode('edit'); setPlayerColor('both');
    const g = new Xiangqi(); g.clearBoard();
    g.setPiece(9,4,{id:'k_red',type:'k',color:'red'});
    g.setPiece(0,4,{id:'k_black',type:'k',color:'black'});
    setGame(g); setEditHistory([]); setEditPiece(null); setGameOver(null);
    setIsCheatModeUnlocked(false); setActiveCheat('none'); setDrawerOpen(false);
  };
  const handleCheatUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (cheatPassword==='244039') { setIsCheatModeUnlocked(true); setCheatPassword(''); }
    else alert('密码错误！');
  };

  const SERIF = { fontFamily: "'Noto Serif SC', 'STKaiti', 'KaiTi', 'Kaiti SC', serif" };

  // ══════════════════════════════════════════════════
  // MENU
  // ══════════════════════════════════════════════════
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-[#0f0a04] flex flex-col items-center justify-center px-4 py-8" style={SERIF}>
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 47px,#c8a86b 47px,#c8a86b 49px),repeating-linear-gradient(90deg,transparent,transparent 47px,#c8a86b 47px,#c8a86b 49px)' }} />

        <div className="relative w-full max-w-xs">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8B0000] to-[#5a0000] mb-4 shadow-xl">
              <span style={{ fontSize:30, color:'#ffd700', fontWeight:700 }}>象</span>
            </div>
            <h1 className="text-3xl font-bold text-[#ffd700] tracking-[0.2em] mb-1">中国象棋</h1>
            <p className="text-[#7a6045] text-xs tracking-widest">千年智慧 · 方寸博弈</p>
          </div>

          <div className="space-y-2.5">
            <div className="bg-[#1c1208] border border-[#3d2810] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-3.5 h-3.5 text-[#c8a86b]" />
                <span className="text-[#c8a86b] text-xs tracking-wider">人机对战</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>startAI('red')}
                  className="py-3 bg-gradient-to-b from-[#9b0000] to-[#7a0000] text-[#ffd700] rounded-xl font-bold text-sm shadow-lg shadow-red-950/50 active:scale-95 transition-transform">
                  执红先手
                </button>
                <button onClick={()=>startAI('black')}
                  className="py-3 bg-[#1a1a1a] border border-[#444] text-[#e8d5b0] rounded-xl font-bold text-sm active:scale-95 transition-transform">
                  执黑后手
                </button>
              </div>
            </div>

            {[
              { icon:<Users className="w-4 h-4 text-[#c8a86b]"/>, label:'双人对战', sub:'本地双人轮流操作', action:startLocal },
              { icon:<Edit3 className="w-4 h-4 text-[#c8a86b]"/>, label:'打谱模式', sub:'自由摆放棋子局面', action:startEdit },
              { icon:<Settings className="w-4 h-4 text-[#c8a86b]"/>, label:'设置', sub:'难度 · 棋盘 · 棋子样式', action:()=>setShowSettings(true) },
            ].map(({icon,label,sub,action}) => (
              <button key={label} onClick={action}
                className="w-full bg-[#1c1208] border border-[#3d2810] rounded-2xl p-4 text-left flex items-center gap-3 active:bg-[#261a0c] transition-colors">
                <div className="shrink-0">{icon}</div>
                <div>
                  <div className="text-[#e8d5b0] font-medium text-sm">{label}</div>
                  <div className="text-[#5a4530] text-xs mt-0.5">{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {showSettings && (
          <SettingsModal {...{aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme}} onClose={()=>setShowSettings(false)} />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // GAME SCREEN
  // ══════════════════════════════════════════════════
  const turnColor = game.turn;
  const myColorLabel = mode==='local' ? null : (playerColor==='red'?'红方':'黑方');
  const oppColorLabel = mode==='local' ? null : (playerColor==='red'?'黑方':'红方');

  return (
    <div className="h-screen max-h-screen flex flex-col bg-[#0f0a04] overflow-hidden" style={SERIF}>

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0603] border-b border-[#2a1c08] shrink-0">
        <button onClick={()=>setMode('menu')}
          className="flex items-center gap-1 text-[#c8a86b] px-2 py-1.5 rounded-lg active:bg-[#1c1208] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>

        {/* Center: turn status */}
        <div className="flex items-center gap-2 bg-[#1c1208] px-3 py-1.5 rounded-full border border-[#3d2810]">
          <div className={cn(
            "w-2 h-2 rounded-full shrink-0",
            turnColor==='red' ? 'bg-[#dd2222]' : 'bg-[#e8d5b0]',
            isThinking && 'animate-pulse'
          )} />
          <span className="text-xs font-medium text-[#e8d5b0]">
            {isThinking ? `思考中 ${aiProgress}%` : (turnColor==='red'?'红方走棋':'黑方走棋')}
          </span>
        </div>

        <button onClick={()=>setShowSettings(true)}
          className="p-2 text-[#c8a86b] rounded-lg active:bg-[#1c1208] transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* PROGRESS BAR */}
      <div className="h-0.5 bg-[#1c1208] shrink-0">
        <div className="h-full bg-[#c8a86b] transition-all duration-300 ease-out"
          style={{ width: isThinking ? `${aiProgress}%` : '0%' }} />
      </div>

      {/* OPPONENT STRIP */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a0603] shrink-0">
        <div className="flex items-center gap-2">
          {mode !== 'local' && (
            <div className={cn("w-1.5 h-1.5 rounded-full", oppColorLabel==='红方'?'bg-[#dd2222]':'bg-[#e8d5b0]')} />
          )}
          <span className="text-[#5a4530] text-xs">
            {mode==='local' ? '双人对战模式' : `${mode==='ai'?'电脑':'玩家2'}（${oppColorLabel}）`}
          </span>
        </div>
        <span className="text-[#3d2810] text-xs">{game.history.length} 步</span>
      </div>

      {/* BOARD */}
      <div className="flex-1 flex items-center justify-center py-1 px-1 min-h-0">
        <div className="relative w-full h-full flex items-center justify-center">
          <Board
            game={game} playerColor={playerColor} onMove={handleMove}
            boardTheme={boardTheme} pieceTheme={pieceTheme}
            isEditMode={mode==='edit'} onEditClick={handleEditClick}
            onSquareClickOverride={activeCheat!=='none'?handleCheatAction:undefined}
          />
          {gameOver && mode !== 'edit' && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center rounded z-50">
              <div className="bg-[#1c1208] border border-[#c8a86b]/60 rounded-2xl p-6 mx-6 text-center w-full max-w-xs">
                <div className="text-3xl font-bold text-[#ffd700] mb-1">{gameOver}</div>
                <div className="text-[#5a4530] text-sm mb-5">共走 {game.history.length} 步</div>
                <div className="flex gap-2">
                  <button onClick={restartGame}
                    className="flex-1 py-3 bg-[#8B0000] text-[#ffd700] rounded-xl font-bold text-sm">
                    再来一局
                  </button>
                  <button onClick={()=>setMode('menu')}
                    className="flex-1 py-3 bg-[#1a1208] border border-[#3d2810] text-[#c8a86b] rounded-xl text-sm">
                    主菜单
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MY STRIP */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a0603] shrink-0">
        <div className="flex items-center gap-2">
          {mode !== 'local' && (
            <div className={cn("w-1.5 h-1.5 rounded-full", myColorLabel==='红方'?'bg-[#dd2222]':'bg-[#e8d5b0]')} />
          )}
          <span className="text-[#c8a86b] text-xs font-medium">
            {mode==='local' ? '请双方轮流操作' : `我（${myColorLabel}）`}
          </span>
        </div>
        {activeCheat !== 'none' && (
          <span className="text-[#c8a86b] text-xs animate-pulse">点击棋盘目标格</span>
        )}
        {mode==='edit' && editPiece && editPiece!=='eraser' && (
          <span className="text-[#c8a86b] text-xs">点击棋盘放置棋子</span>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div className="bg-[#0a0603] border-t border-[#2a1c08] shrink-0">
        {/* Action buttons */}
        <div className="flex items-stretch gap-2 px-3 py-2.5">
          <button onClick={handleUndo}
            disabled={(mode==='edit'?editHistory.length===0:game.history.length===0)||isThinking}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 bg-[#1c1208] border border-[#3d2810] text-[#c8a86b] rounded-xl text-xs disabled:opacity-35 active:bg-[#261a0c] transition-colors">
            <RotateCcw className="w-4 h-4" />
            悔棋
          </button>
          {mode !== 'edit' && (
            <button onClick={restartGame} disabled={isThinking}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 bg-[#1c1208] border border-[#3d2810] text-[#c8a86b] rounded-xl text-xs disabled:opacity-35 active:bg-[#261a0c] transition-colors">
              <RefreshCw className="w-4 h-4" />
              重开
            </button>
          )}
          <button onClick={()=>setDrawerOpen(o=>!o)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2 border rounded-xl text-xs transition-colors",
              drawerOpen ? "bg-[#2a1c08] border-[#c8a86b] text-[#ffd700]" : "bg-[#1c1208] border-[#3d2810] text-[#c8a86b] active:bg-[#261a0c]"
            )}>
            {drawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            {mode==='edit' ? '编辑' : '秘籍'}
          </button>
        </div>

        {/* Drawer */}
        {drawerOpen && (
          <div className="border-t border-[#2a1c08] px-3 pt-3 pb-3 space-y-3">
            {mode === 'edit' ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={()=>{setEditHistory(p=>[...p,game]);setGame(new Xiangqi());}}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1c1208] border border-[#3d2810] text-[#c8a86b] rounded-xl text-xs active:bg-[#261a0c]">
                    <RefreshCw className="w-3 h-3"/>初始局面
                  </button>
                  <button onClick={()=>{const g=game.clone();setEditHistory(p=>[...p,game]);g.clearBoard();g.setPiece(9,4,{id:'k_red',type:'k',color:'red'});g.setPiece(0,4,{id:'k_black',type:'k',color:'black'});setGame(g);}}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1c1208] border border-[#3d2810] text-[#c8a86b] rounded-xl text-xs active:bg-[#261a0c]">
                    <Trash2 className="w-3 h-3"/>清空棋盘
                  </button>
                </div>
                <div>
                  <div className="text-[#5a4530] text-xs mb-2">红方棋子</div>
                  <div className="flex gap-1.5">
                    {(['k','a','e','h','r','c','p'] as const).map(type=>(
                      <button key={`r-${type}`} onClick={()=>setEditPiece({id:`${type}_red`,type,color:'red'})}
                        className={cn("flex-1 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all",
                          editPiece!=='eraser'&&editPiece?.type===type&&editPiece?.color==='red'
                            ?"border-[#dd2222] bg-[#2a0808] text-[#dd2222] scale-110"
                            :"border-[#3d2810] bg-[#1c1208] text-[#dd2222] active:bg-[#261a0c]")}>
                        {type==='k'?'帅':type==='a'?'仕':type==='e'?'相':type==='h'?'马':type==='r'?'车':type==='c'?'炮':'兵'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[#5a4530] text-xs mb-2">黑方棋子</div>
                  <div className="flex gap-1.5">
                    {(['k','a','e','h','r','c','p'] as const).map(type=>(
                      <button key={`b-${type}`} onClick={()=>setEditPiece({id:`${type}_black`,type,color:'black'})}
                        className={cn("flex-1 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all",
                          editPiece!=='eraser'&&editPiece?.type===type&&editPiece?.color==='black'
                            ?"border-[#e8d5b0] bg-[#12120a] text-[#e8d5b0] scale-110"
                            :"border-[#3d2810] bg-[#1c1208] text-[#e8d5b0] active:bg-[#261a0c]")}>
                        {type==='k'?'将':type==='a'?'士':type==='e'?'象':type==='h'?'马':type==='r'?'车':type==='c'?'炮':'卒'}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setEditPiece('eraser')}
                  className={cn("w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs border-2 transition-all",
                    editPiece==='eraser'?"border-[#c8a86b] bg-[#201808] text-[#c8a86b]":"border-[#3d2810] bg-[#1c1208] text-[#5a4530] active:bg-[#261a0c]")}>
                  <Eraser className="w-3.5 h-3.5"/>橡皮擦
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {!isCheatModeUnlocked ? (
                  <form onSubmit={handleCheatUnlock} className="flex gap-2">
                    <input type="password" value={cheatPassword} onChange={e=>setCheatPassword(e.target.value)}
                      placeholder="输入秘籍密码"
                      className="flex-1 bg-[#1c1208] border border-[#3d2810] text-[#e8d5b0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#c8a86b] placeholder:text-[#3d2810]"/>
                    <button type="submit" className="px-4 bg-[#8B0000] text-white rounded-xl text-sm font-medium">解锁</button>
                  </form>
                ) : (
                  <>
                    <div className="text-[#5a4530] text-xs">选择技能后点击棋盘目标</div>
                    <div className="grid grid-cols-3 gap-2">
                      {([['armor','铁甲兵'],['drift','漂移车'],['betray','策反']] as const).map(([id,label])=>(
                        <button key={id} onClick={()=>setActiveCheat(activeCheat===id?'none':id)}
                          className={cn("py-2 rounded-xl text-xs border transition-all",
                            activeCheat===id?"bg-[#8B0000] border-[#dd2222] text-[#ffd700]":"bg-[#1c1208] border-[#3d2810] text-[#c8a86b] active:bg-[#261a0c]")}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div>
                      <div className="text-[#5a4530] text-xs mb-2">复活阵亡棋子</div>
                      <div className="flex flex-wrap gap-1.5">
                        {game.capturedPieces.filter(p=>p.color===playerColor).map((p,i)=>(
                          <button key={i} onClick={()=>{setRevivePiece(p);setActiveCheat('revive');}}
                            className={cn("w-8 h-8 rounded-full border text-xs font-bold",
                              activeCheat==='revive'&&revivePiece===p?"bg-[#8B0000] border-[#dd2222] text-[#ffd700]":"bg-[#1c1208] border-[#3d2810] text-[#c8a86b]")}>
                            {p.type==='r'?'车':p.type==='h'?'马':p.type==='c'?'炮':p.type==='e'?'相':p.type==='a'?'仕':'兵'}
                          </button>
                        ))}
                        {game.capturedPieces.filter(p=>p.color===playerColor).length===0&&
                          <span className="text-[#3d2810] text-xs">无阵亡棋子</span>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal {...{aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme}} onClose={()=>setShowSettings(false)} />
      )}
    </div>
  );
}

interface SettingsModalProps {
  aiDifficulty:number; setAiDifficulty:(v:number)=>void;
  boardTheme:BoardTheme; setBoardTheme:(v:BoardTheme)=>void;
  pieceTheme:PieceTheme; setPieceTheme:(v:PieceTheme)=>void;
  onClose:()=>void;
}
function SettingsModal({aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme,onClose}:SettingsModalProps) {
  const SERIF = { fontFamily:"'Noto Serif SC','STKaiti','KaiTi','Kaiti SC',serif" };
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" style={SERIF}>
      <div className="bg-[#120d05] border border-[#3d2810] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#2a1c08]">
          <h2 className="text-lg font-bold text-[#ffd700]">设置</h2>
          <button onClick={onClose} className="p-1.5 text-[#5a4530] active:text-[#c8a86b]"><X className="w-5 h-5"/></button>
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
              <span className="text-[#c8a86b] text-sm">{label}</span>
              <select value={value} onChange={e=>onChange(e.target.value)}
                className="bg-[#1c1208] border border-[#3d2810] text-[#e8d5b0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#c8a86b]">
                {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="px-5 pb-6">
          <button onClick={onClose}
            className="w-full py-3 bg-[#8B0000] text-[#ffd700] rounded-xl font-bold text-sm active:bg-[#6B0000] transition-colors">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
