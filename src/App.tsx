import React, { useState, useEffect, useRef } from 'react';
import { Board, BoardTheme, PieceTheme } from './components/Board';
import { Xiangqi, Move, Piece, RepetitionViolation } from './game/xiangqi';
// @ts-ignore
import AiWorker from './game/aiWorker?worker';
import {
  Users, Cpu, ArrowLeft, Settings, Edit3, RotateCcw,
  Eraser, Trash2, RefreshCw, ChevronDown, ChevronUp, X,
  Lightbulb, Play, CheckCheck, RefreshCwIcon, FlipVertical
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { playMoveSound, playCaptureSound, playCheckSound } from './utils/sounds';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type GameMode = 'menu' | 'ai' | 'local' | 'edit' | 'setup' | 'custom';

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
  const [aiColors, setAiColors] = useState<Set<'red' | 'black'>>(new Set());
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
  const [isFlipped, setIsFlipped] = useState(false); // 打谱翻转状态

  const [repetitionViolation, setRepetitionViolation] = useState<RepetitionViolation | null>(null);
  const [setupGame, setSetupGame] = useState<Xiangqi | null>(null);
  const [customConfig, setCustomConfig] = useState<CustomGameConfig>({
    redPlayer: 'human',
    blackPlayer: 'ai',
    firstMove: 'red',
  });

  const workerRef = useRef<Worker | null>(null);
  const hintWorkerRef = useRef<Worker | null>(null);

  const resetWorkers = () => {
    workerRef.current?.terminate();
    hintWorkerRef.current?.terminate();
    workerRef.current = new AiWorker();
    hintWorkerRef.current = new AiWorker();
    setIsThinking(false);
    setIsHinting(false);
    setAiProgress(0);
    setHintMove(null);
  };

  useEffect(() => {
    workerRef.current = new AiWorker();
    hintWorkerRef.current = new AiWorker();
    return () => {
      workerRef.current?.terminate();
      hintWorkerRef.current?.terminate();
    };
  }, []);

  const [editPiece, setEditPiece] = useState<Piece | 'eraser' | null>(null);
  const [selectedEditPos, setSelectedEditPos] = useState<{r: number, c: number} | null>(null);
  const [editHistory, setEditHistory] = useState<Xiangqi[]>([]);
  const [isCheatModeUnlocked, setIsCheatModeUnlocked] = useState(false);
  const [cheatPassword, setCheatPassword] = useState('');
  const [activeCheat, setActiveCheat] = useState<'none' | 'armor' | 'drift' | 'revive' | 'betray'>('none');
  const [revivePiece, setRevivePiece] = useState<Piece | null>(null);

  const isAiTurn = (): boolean => {
    if (mode === 'ai') return game.turn !== playerColor;
    if (mode === 'custom') return aiColors.has(game.turn as 'red' | 'black');
    return false;
  };

  useEffect(() => {
    if (mode !== 'edit' && mode !== 'setup') {
      const winner = game.getWinner();
      if (winner) {
        setGameOver(winner === 'draw' ? '和棋！' : `${winner === 'red' ? '红方' : '黑方'} 胜！`);
        setRepetitionViolation(null);
        return;
      }
      const violation = game.getRepetitionViolation();
      setRepetitionViolation(violation);
    }
  }, [game, mode]);

  const currentForbiddenMoves: Move[] = (() => {
    if (!repetitionViolation) return [];
    if (repetitionViolation.violator === game.turn) return repetitionViolation.forbiddenMoves;
    return [];
  })();

  useEffect(() => {
    let isCancelled = false;
    const shouldAiMove = (mode === 'ai' || mode === 'custom') && isAiTurn() && !game.isGameOver();
    if (shouldAiMove) {
      setIsThinking(true);
      setAiProgress(0);
      setHintMove(null);
      const aiForbidden = repetitionViolation && repetitionViolation.violator === game.turn
        ? repetitionViolation.forbiddenMoves
        : [];
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
          board: game.board,
          turn: game.turn,
          history: game.history,
          capturedPieces: game.capturedPieces,
          difficulty: aiDifficulty,
          forbiddenMoves: aiForbidden,
        });
      }
    }
    return () => { isCancelled = true; };
  }, [game, mode, aiColors, playerColor, aiDifficulty, repetitionViolation]);

  const handleHint = () => {
    if (isHinting || isThinking) return;
    setIsHinting(true);
    setHintMove(null);
    if (hintWorkerRef.current) {
      hintWorkerRef.current.onmessage = (e) => {
        if (e.data.type === 'done') { setHintMove(e.data.move); setIsHinting(false); }
      };
      hintWorkerRef.current.postMessage({
        board: game.board, turn: game.turn,
        history: game.history, capturedPieces: game.capturedPieces,
        difficulty: hintDifficulty,
        forbiddenMoves: currentForbiddenMoves,
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
    const cpColor = mode === 'custom' ? game.turn as 'red' | 'black' : playerColor as 'red' | 'black';
    const piece = game.getPiece(r, c);
    const newGame = game.clone();
    let valid = false;
    if (activeCheat === 'armor' && piece && piece.color === cpColor && piece.type === 'p') {
      newGame.applyCheatArmor(r, c); valid = true;
    } else if (activeCheat === 'drift' && piece && piece.color === cpColor && piece.type === 'r') {
      newGame.applyCheatDrift(r, c); valid = true;
    } else if (activeCheat === 'revive' && !piece && revivePiece) {
      newGame.applyCheatRevive(r, c, revivePiece); valid = true; setRevivePiece(null);
    } else if (activeCheat === 'betray' && piece && piece.color !== cpColor && ['r','c','h','p'].includes(piece.type)) {
      newGame.applyCheatBetray(r, c); valid = true;
    }
    if (valid) { setGame(newGame); setActiveCheat('none'); }
  };

  const handleEditClick = (r: number, c: number) => {
    const newGame = game.clone();
    
    // 逻辑：如果当前选了棋子/橡皮擦，则进行放置
    if (editPiece) {
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
        newGame.setPiece(r, c, { ...editPiece, id:`${editPiece.type}_${editPiece.color}_${Date.now()}` });
      }
      setEditHistory(prev => [...prev, game]);
      setGame(newGame);
    } 
    // 逻辑：如果没选棋子模板，则实现“点击选择-再点击移动”
    else {
      if (selectedEditPos) {
        if (selectedEditPos.r === r && selectedEditPos.c === c) {
          setSelectedEditPos(null);
          return;
        }
        const movingPiece = game.getPiece(selectedEditPos.r, selectedEditPos.c);
        if (movingPiece) {
          // 这里的移动逻辑简化处理，直接设置位置，不进行复杂的行棋验证
          const targetPiece = game.getPiece(r, c);
          if (targetPiece && targetPiece.type === 'k') {
             alert('不能移动到将帅位置！');
             setSelectedEditPos(null);
             return;
          }
          newGame.setPiece(r, c, movingPiece);
          newGame.setPiece(selectedEditPos.r, selectedEditPos.c, null);
          setEditHistory(prev => [...prev, game]);
          setGame(newGame);
        }
        setSelectedEditPos(null);
      } else {
        if (game.getPiece(r, c)) {
          setSelectedEditPos({ r, c });
        }
      }
    }
  };

  const handleUndo = () => {
    setHintMove(null);
    setRepetitionViolation(null);
    if (mode === 'edit') {
      if (editHistory.length > 0) { 
        setGame(editHistory[editHistory.length-1]); 
        setEditHistory(p=>p.slice(0,-1)); 
      }
    } else {
      const g = game.clone();
      if (mode === 'ai') { g.undo(); g.undo(); }
      else if (mode === 'local') { g.undo(); }
      else if (mode === 'custom') {
        g.undo();
        if (aiColors.has(g.turn as 'red' | 'black')) g.undo();
      }
      setGame(g);
    }
  };

  const startLocal = () => {
    resetWorkers();
    setMode('local'); setPlayerColor('both'); setGame(new Xiangqi());
    setGameOver(null); setIsCheatModeUnlocked(false); setActiveCheat('none');
    setDrawerOpen(false); setAiColors(new Set()); setRepetitionViolation(null);
  };

  const startAI = (color: 'red'|'black') => {
    resetWorkers();
    setMode('ai'); setPlayerColor(color); setGame(new Xiangqi());
    setGameOver(null); setIsCheatModeUnlocked(false); setActiveCheat('none');
    setDrawerOpen(false); setRepetitionViolation(null);
  };

  const restartGame = () => {
    setGameOver(null);
    setRepetitionViolation(null);
    if (mode === 'ai') startAI(playerColor as 'red'|'black');
    else if (mode === 'local') startLocal();
    else if (mode === 'custom' && setupGame) launchCustomGame(customConfig, setupGame);
  };

  const launchCustomGame = (config: CustomGameConfig, base: Xiangqi) => {
    const g = base.clone();
    g.turn = config.firstMove;
    g.history = [];
    g.capturedPieces = [];
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
    setRepetitionViolation(null);
    resetWorkers();
    setMode('custom');
  };

  const startEdit = () => {
    resetWorkers();
    setMode('edit'); setPlayerColor('both');
    const g = new Xiangqi(); g.clearBoard();
    g.setPiece(9,4,{id:'k_red',type:'k',color:'red'});
    g.setPiece(0,4,{id:'k_black',type:'k',color:'black'});
    setGame(g); setEditHistory([]); setEditPiece(null); setGameOver(null);
    setIsCheatModeUnlocked(false); setActiveCheat('none'); setDrawerOpen(false);
    setRepetitionViolation(null);
  };

  const finishEdit = () => {
    setSetupGame(game.clone());
    setCustomConfig({ redPlayer: 'human', blackPlayer: 'ai', firstMove: 'red' });
    setMode('setup');
  };

  const handleCheatUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (cheatPassword==='244039') { setIsCheatModeUnlocked(true); setCheatPassword(''); }
    else alert('密码错误！');
  };

  const boardPlayerColor = (): 'red' | 'black' | 'both' => {
    if (mode === 'local' || mode === 'custom') return 'both';
    if (mode === 'edit') return isFlipped ? 'black' : 'red';
    return playerColor as 'red' | 'black' | 'both';
  };

  const getPlayerLabel = (color: 'red'|'black') => {
    if (mode === 'ai') return color === playerColor ? '我' : '电脑';
    if (mode === 'custom') return aiColors.has(color) ? '电脑' : '玩家';
    return color === 'red' ? '红方' : '黑方';
  };

  const humanTurn = mode === 'custom'
    ? !aiColors.has(game.turn as 'red'|'black')
    : (mode === 'local' || game.turn === playerColor);

  const isEditMode = mode === 'edit';
  const SERIF: React.CSSProperties = { fontFamily: "'Noto Serif SC', 'STKaiti', 'KaiTi', serif" };

  const violationBanner = (() => {
    if (!repetitionViolation) return null;
    const who = repetitionViolation.violator === 'red' ? '红方' : '黑方';
    const reason = repetitionViolation.reason === 'perpetualCheck' ? '长将' : '长捉';
    const isCurrentTurn = repetitionViolation.violator === game.turn;
    if (isCurrentTurn) return `${who}${reason}，必须变着！`;
    return `检测到${who}${reason}，等待变着`;
  })();

  return (
    <div className="h-screen max-h-screen flex flex-col bg-amber-50 overflow-hidden" style={SERIF}>

      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-amber-200 shadow-sm shrink-0">
        <button onClick={()=>{ resetWorkers(); setMode('menu'); }}
          className="flex items-center gap-1.5 text-gray-600 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">返回</span>
        </button>

        <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full border",
          isEditMode ? "bg-blue-50 border-blue-300" : "bg-amber-100 border-amber-300")}>
          {isEditMode ? (
            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
          ) : (
            <div className={cn("w-3 h-3 rounded-full shrink-0 shadow-sm",
              turnColor==='red' ? 'bg-red-600' : 'bg-gray-800',
              isThinking && 'animate-pulse')} />
          )}
          <span className={cn("text-sm font-bold", isEditMode ? "text-blue-700" : "text-amber-900")}>
            {isEditMode ? '打谱编辑中' : isThinking ? `思考中 ${aiProgress}%` : (game.turn==='red'?'红方走棋':'黑方走棋')}
          </span>
        </div>

        <button onClick={()=>setShowSettings(true)}
          className="p-2 text-gray-500 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="h-1 bg-amber-100 shrink-0">
        <div className="h-full bg-red-500 transition-all duration-300"
          style={{ width: isThinking ? `${aiProgress}%` : '0%' }} />
      </div>

      {violationBanner && !isEditMode && (
        <div className={cn(
          "px-4 py-2 text-center text-xs font-bold shrink-0",
          repetitionViolation?.violator === game.turn
            ? "bg-orange-100 border-b border-orange-300 text-orange-800"
            : "bg-yellow-50 border-b border-yellow-200 text-yellow-700"
        )}>
          ⚠️ {violationBanner}
        </div>
      )}

      {!isEditMode && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-amber-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-800 shadow-sm" />
            <span className="text-sm font-medium text-gray-600">黑方：{getPlayerLabel('black')}</span>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{game.history.length} 步</span>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center py-1 px-2 min-h-0">
        <div className="relative flex items-center justify-center w-full h-full">
          <Board
            game={game}
            playerColor={boardPlayerColor()}
            onMove={handleMove}
            boardTheme={boardTheme}
            pieceTheme={pieceTheme}
            isEditMode={isEditMode}
            onEditClick={handleEditClick}
            onSquareClickOverride={activeCheat!=='none'?handleCheatAction:undefined}
            hintMove={hintMove}
            forbiddenMoves={currentForbiddenMoves}
            selectedEditPos={selectedEditPos}
          />
          {gameOver && !isEditMode && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded z-50">
              <div className="bg-white border border-amber-200 rounded-3xl p-6 mx-6 text-center w-full max-w-xs shadow-2xl">
                <div className="text-4xl font-bold text-red-700 mb-2">{gameOver}</div>
                <div className="text-gray-400 text-sm mb-5">共走 {game.history.length} 步</div>
                <div className="flex gap-2">
                  <button onClick={restartGame}
                    className="flex-1 py-3 bg-red-700 text-yellow-200 rounded-xl font-bold text-base shadow">再来一局</button>
                  <button onClick={()=>{ 
                      if (mode === 'custom') { setMode('edit'); setGameOver(null); } 
                      else { resetWorkers(); setMode('menu'); }
                    }}
                    className="flex-1 py-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-base font-medium">
                    {mode === 'custom' ? '继续编辑' : '主菜单'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!isEditMode && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-white border-t border-amber-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600 shadow-sm" />
            <span className="text-sm font-bold text-red-700">红方：{getPlayerLabel('red')}</span>
          </div>
          <div className="flex gap-1.5">
            {activeCheat !== 'none' && (
              <span className="text-red-600 text-xs font-medium animate-pulse bg-red-50 px-2 py-0.5 rounded-full border border-red-200">点击棋盘目标格</span>
            )}
            {hintMove && !isHinting && (
              <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">💡 已显示提示</span>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border-t border-amber-200 shadow-sm shrink-0">
        <div className="flex items-stretch gap-2 px-3 py-2.5">

          {isEditMode ? (
             <button onClick={()=>setIsFlipped(!isFlipped)}
               className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium active:scale-95 transition-all">
               <FlipVertical className="w-4 h-4" />
               翻转
             </button>
          ) : (
            <button onClick={handleUndo}
              disabled={game.history.length===0 || isThinking}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium disabled:opacity-30 active:scale-95 transition-all">
              <RotateCcw className="w-4 h-4" />
              悔棋
            </button>
          )}

          {!isEditMode && (
            <button onClick={restartGame} disabled={isThinking}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium disabled:opacity-30 active:scale-95 transition-all">
              <RefreshCw className="w-4 h-4" />
              重开
            </button>
          )}

          {!isEditMode && humanTurn && !isThinking && (
            <button onClick={handleHint} disabled={isHinting || !!game.getWinner()}
              className={cn("flex-1 flex flex-col items-center justify-center gap-1 py-2.5 border rounded-xl text-sm font-medium active:scale-95 transition-all",
                isHinting
                  ? "bg-yellow-100 border-yellow-300 text-yellow-700 animate-pulse"
                  : "bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-700 disabled:opacity-30")}>
              <Lightbulb className="w-4 h-4" />
              {isHinting ? '分析中' : '提示'}
            </button>
          )}

          {isEditMode && (
            <button onClick={finishEdit}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 bg-blue-600 hover:bg-blue-700 border border-blue-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-all shadow">
              <CheckCheck className="w-4 h-4" />
              对局设置
            </button>
          )}

          <button onClick={()=>setDrawerOpen(o=>!o)}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1 py-2.5 border rounded-xl text-sm font-medium transition-all active:scale-95",
              drawerOpen ? "bg-amber-100 border-amber-400 text-amber-800" : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700")}>
            {drawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            {isEditMode ? '工具栏' : '秘籍'}
          </button>
        </div>

        {drawerOpen && (
          <div className="border-t border-amber-200 px-3 pt-3 pb-4 bg-amber-50 space-y-3">
            {isEditMode ? (
              <EditDrawer
                editPiece={editPiece}
                setEditPiece={setEditPiece}
                undoHistoryEmpty={editHistory.length === 0}
                onUndo={handleUndo}
                onReset={()=>{ setEditHistory(p=>[...p,game]); setGame(new Xiangqi()); }}
                onClear={()=>{
                  const g = game.clone();
                  setEditHistory(p=>[...p,game]);
                  g.clearBoard();
                  g.setPiece(9,4,{id:'k_red',type:'k',color:'red'});
                  g.setPiece(0,4,{id:'k_black',type:'k',color:'black'});
                  setGame(g);
                }}
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

      {showSettings && <SettingsModal {...{aiDifficulty,setAiDifficulty,boardTheme,setBoardTheme,pieceTheme,setPieceTheme}} onClose={()=>setShowSettings(false)} />}
    </div>
  );
}

// ── EditDrawer (撤销已移入此组件的首行) ──────────────────────────
function EditDrawer({ editPiece, setEditPiece, undoHistoryEmpty, onUndo, onReset, onClear }: {
  editPiece: Piece | 'eraser' | null;
  setEditPiece: (p: Piece | 'eraser' | null) => void;
  undoHistoryEmpty: boolean;
  onUndo: () => void;
  onReset: () => void;
  onClear: () => void;
}) {
  const ep = editPiece !== 'eraser' ? editPiece as Piece | null : null;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={onUndo} disabled={undoHistoryEmpty}
          className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-30">
          <RotateCcw className="w-3 h-3"/>撤销
        </button>
        <button onClick={onReset}
          className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 active:scale-95 transition-all">
          <RefreshCwIcon className="w-3 h-3"/>初始局面
        </button>
        <button onClick={onClear}
          className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 active:scale-95 transition-all">
          <Trash2 className="w-3 h-3"/>清空棋盘
        </button>
        <button onClick={()=>setEditPiece(editPiece==='eraser'?null:'eraser')}
          className={cn("flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium border-2 transition-all active:scale-95",
            editPiece==='eraser'?"border-orange-400 bg-orange-100 text-orange-700 shadow":"border-gray-200 bg-white text-gray-500 hover:bg-gray-50")}>
          <Eraser className="w-3 h-3"/>消除
        </button>
      </div>
      <div>
        <div className="flex gap-1.5">
          {(['k','a','e','h','r','c','p'] as const).map(type=>(
            <button key={`r-${type}`} onClick={()=>setEditPiece(ep?.type===type && ep?.color==='red' ? null : {id:`${type}_red`,type,color:'red'})}
              className={cn("flex-1 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all",
                editPiece!=='eraser' && ep?.type===type && ep?.color==='red'
                  ?"border-red-700 bg-red-700 text-yellow-200 scale-110 shadow"
                  :"border-red-200 bg-white text-red-700 hover:bg-red-50 active:scale-95")}>
              {type==='k'?'帅':type==='a'?'仕':type==='e'?'相':type==='h'?'马':type==='r'?'车':type==='c'?'炮':'兵'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex gap-1.5">
          {(['k','a','e','h','r','c','p'] as const).map(type=>(
            <button key={`b-${type}`} onClick={()=>setEditPiece(ep?.type===type && ep?.color==='black' ? null : {id:`${type}_black`,type,color:'black'})}
              className={cn("flex-1 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all",
                editPiece!=='eraser' && ep?.type===type && ep?.color==='black'
                  ?"border-gray-800 bg-gray-800 text-white scale-110 shadow"
                  :"border-gray-300 bg-white text-gray-800 hover:bg-gray-50 active:scale-95")}>
              {type==='k'?'将':type==='a'?'士':type==='e'?'象':type==='h'?'马':type==='r'?'车':type==='c'?'炮':'卒'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CheatDrawer ───────────────────────────────────────────────────
function CheatDrawer({ game, playerColor, isCheatModeUnlocked, cheatPassword, setCheatPassword,
  activeCheat, setActiveCheat, revivePiece, setRevivePiece, onUnlock, hintDifficulty, setHintDifficulty }: any) {
  return (
    <div className="space-y-3">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-600"/>
            <span className="text-sm font-bold text-yellow-700">提示强度</span>
          </div>
          <select value={hintDifficulty} onChange={(e:any)=>setHintDifficulty(Number(e.target.value))}
            className="bg-white border border-yellow-300 text-yellow-800 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none">
            {[1,2,3,4,5].map(v=><option key={v} value={v}>{['普通','村冠','镇冠','县冠','大师'][v-1]}</option>)}
          </select>
        </div>
        <div className="text-xs text-yellow-600 mt-1.5">强度越高分析越准，耗时越长</div>
      </div>
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
                <span className="text-gray-400 text-xs py-1.5">无阵亡棋子</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────
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
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl active:scale-95">
            <X className="w-5 h-5"/>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {[
            { label:'人机难度', value:aiDifficulty, onChange:(v:string)=>setAiDifficulty(Number(v)),
              opts:[['1','普通'],['2','村冠'],['3','镇冠'],['4','县冠'],['5','大师']] },
            { label:'棋盘样式', value:boardTheme, onChange:(v:string)=>setBoardTheme(v as BoardTheme),
              opts:[['classic','经典'],['wood','木纹'],['paper','纸质']] },
            { label:'棋子样式', value:pieceTheme, onChange:(v:string)=>setPieceTheme(v as PieceTheme),
              opts:[['classic','经典'],['wood','木质'],['flat','扁平']] },
          ].map(({label,value,onChange,opts})=>(
            <div key={label} className="flex items-center justify-between">
              <span className="text-gray-700 font-medium text-base">{label}</span>
              <select value={value} onChange={e=>onChange(e.target.value)}
                className="bg-amber-50 border border-amber-300 text-gray-800 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none">
                {opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
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
