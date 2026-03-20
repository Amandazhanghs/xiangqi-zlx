import React, { useState, useEffect, useRef } from 'react';
import { Board, BoardTheme, PieceTheme } from './components/Board';
import { Xiangqi, Move, Piece } from './game/xiangqi';
// @ts-ignore
import AiWorker from './game/aiWorker?worker';
import { Users, Cpu, ArrowLeft, Settings, Edit3, RotateCcw, Eraser, Trash2, RefreshCw } from 'lucide-react';
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

  // Settings
  const [aiDifficulty, setAiDifficulty] = useState<number>(3);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('wood');
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>('wood');
  const [showSettings, setShowSettings] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new AiWorker();
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Edit Mode
  const [editPiece, setEditPiece] = useState<Piece | 'eraser' | null>(null);
  const [editHistory, setEditHistory] = useState<Xiangqi[]>([]);

  // Cheat Mode
  const [isCheatModeUnlocked, setIsCheatModeUnlocked] = useState(false);
  const [cheatPassword, setCheatPassword] = useState('');
  const [activeCheat, setActiveCheat] = useState<'none' | 'armor' | 'drift' | 'revive' | 'betray'>('none');
  const [revivePiece, setRevivePiece] = useState<Piece | null>(null);

  useEffect(() => {
    if (mode !== 'edit') {
      const winner = game.getWinner();
      if (winner) {
        if (winner === 'draw') {
          setGameOver('和棋！');
        } else {
          setGameOver(`${winner === 'red' ? '红方' : '黑方'} 胜！`);
        }
      }
    }
  }, [game, mode]);

  // AI Move effect
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

              if (isCapture) {
                playCaptureSound();
              } else {
                playMoveSound();
              }
              if (newGame.isInCheck(newGame.turn)) {
                playCheckSound();
              }
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
          difficulty: aiDifficulty
        });
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [game, mode, playerColor, aiDifficulty]);

  const handleMove = (move: Move) => {
    if (isThinking) return;
    
    const newGame = game.clone();
    const isCapture = newGame.getPiece(move.to.r, move.to.c) !== null;
    
    if (newGame.makeMove(move)) {
      setGame(newGame);
      
      if (isCapture) {
        playCaptureSound();
      } else {
        playMoveSound();
      }
      if (newGame.isInCheck(newGame.turn)) {
        playCheckSound();
      }
    }
  };

  const handleCheatAction = (r: number, c: number) => {
    const piece = game.getPiece(r, c);
    const newGame = game.clone();
    let valid = false;

    if (activeCheat === 'armor' && piece && piece.color === playerColor && piece.type === 'p') {
      newGame.applyCheatArmor(r, c);
      valid = true;
    } else if (activeCheat === 'drift' && piece && piece.color === playerColor && piece.type === 'r') {
      newGame.applyCheatDrift(r, c);
      valid = true;
    } else if (activeCheat === 'revive' && !piece && revivePiece) {
      newGame.applyCheatRevive(r, c, revivePiece);
      valid = true;
      setRevivePiece(null);
    } else if (activeCheat === 'betray' && piece && piece.color !== playerColor && ['r', 'c', 'h', 'p'].includes(piece.type)) {
      newGame.applyCheatBetray(r, c);
      valid = true;
    }

    if (valid) {
      setGame(newGame);
      setActiveCheat('none');
    }
  };

  const handleEditClick = (r: number, c: number) => {
    if (!editPiece) return;
    const newGame = game.clone();
    if (editPiece === 'eraser') {
      const p = newGame.getPiece(r, c);
      if (p && p.type === 'k') {
        alert('将帅不能被删除！');
        return;
      }
      newGame.setPiece(r, c, null);
    } else {
      const isRed = editPiece.color === 'red';
      let valid = true;
      
      switch (editPiece.type) {
        case 'k':
          if (isRed) {
            valid = (r >= 7 && r <= 9 && c >= 3 && c <= 5);
          } else {
            valid = (r >= 0 && r <= 2 && c >= 3 && c <= 5);
          }
          break;
        case 'a':
          if (isRed) {
            valid = (r >= 7 && r <= 9 && c >= 3 && c <= 5 && (r + c) % 2 === 0);
          } else {
            valid = (r >= 0 && r <= 2 && c >= 3 && c <= 5 && (r + c) % 2 !== 0);
          }
          break;
        case 'e':
          if (isRed) {
            valid = (r >= 5 && r <= 9 && [0, 2, 4, 6, 8].includes(c) && (r + c) % 2 !== 0);
          } else {
            valid = (r >= 0 && r <= 4 && [0, 2, 4, 6, 8].includes(c) && (r + c) % 2 === 0);
          }
          break;
        case 'p':
          if (isRed) {
            valid = r <= 6 && (r <= 4 || [0, 2, 4, 6, 8].includes(c));
          } else {
            valid = r >= 3 && (r >= 5 || [0, 2, 4, 6, 8].includes(c));
          }
          break;
      }
      
      if (!valid) {
        alert('该棋子不能放置在此位置！');
        return;
      }

      const existingPiece = newGame.getPiece(r, c);
      if (existingPiece && existingPiece.type === 'k' && existingPiece.color !== editPiece.color) {
        alert('不能覆盖对方的将帅！');
        return;
      }
      if (existingPiece && existingPiece.type === 'k' && editPiece.type !== 'k') {
        alert('将帅不能被覆盖！');
        return;
      }

      // Check piece count limits
      if (editPiece.type !== 'k') {
        let count = 0;
        for (let i = 0; i < 10; i++) {
          for (let j = 0; j < 9; j++) {
            const p = newGame.getPiece(i, j);
            if (p && p.type === editPiece.type && p.color === editPiece.color) {
              count++;
            }
          }
        }

        if (!existingPiece || existingPiece.type !== editPiece.type || existingPiece.color !== editPiece.color) {
          let maxCount = 2;
          if (editPiece.type === 'p') maxCount = 5;

          if (count >= maxCount) {
            alert(`不能添加超过正常数量的棋子！`);
            return;
          }
        }
      }

      if (editPiece.type === 'k') {
        // Remove the old king
        for (let i = 0; i < 10; i++) {
          for (let j = 0; j < 9; j++) {
            const p = newGame.getPiece(i, j);
            if (p && p.type === 'k' && p.color === editPiece.color) {
              newGame.setPiece(i, j, null);
            }
          }
        }
      }

      newGame.setPiece(r, c, { ...editPiece, id: `${editPiece.type}_${editPiece.color}_${Date.now()}_${Math.random()}` });
    }
    setEditHistory(prev => [...prev, game]);
    setGame(newGame);
  };

  const handleUndo = () => {
    if (mode === 'edit') {
      if (editHistory.length > 0) {
        const previousState = editHistory[editHistory.length - 1];
        setGame(previousState);
        setEditHistory(prev => prev.slice(0, -1));
      }
    } else {
      const newGame = game.clone();
      if (mode === 'ai') {
        newGame.undo();
        newGame.undo();
      } else if (mode === 'local') {
        newGame.undo();
      }
      setGame(newGame);
    }
  };

  const startLocal = () => {
    setMode('local');
    setPlayerColor('both');
    setGame(new Xiangqi());
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
  };

  const startAI = (color: 'red' | 'black') => {
    setMode('ai');
    setPlayerColor(color);
    setGame(new Xiangqi());
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
  };

  const restartGame = () => {
    if (mode === 'ai') {
      startAI(playerColor as 'red' | 'black');
    } else if (mode === 'local') {
      startLocal();
    }
  };

  const startEdit = () => {
    setMode('edit');
    setPlayerColor('both');
    const newGame = new Xiangqi();
    newGame.clearBoard();
    newGame.setPiece(9, 4, { id: 'k_red', type: 'k', color: 'red' });
    newGame.setPiece(0, 4, { id: 'k_black', type: 'k', color: 'black' });
    setGame(newGame);
    setEditHistory([]);
    setEditPiece(null);
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
  };

  const handleCheatUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (cheatPassword === '244039') {
      setIsCheatModeUnlocked(true);
      setCheatPassword('');
    } else {
      alert('密码错误！');
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] font-['Cormorant_Garamond',_serif] text-[#2c2c2c] flex flex-col items-center justify-center p-4">
      {mode === 'menu' && (
        <div className="w-full max-w-md bg-white p-10 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#e5e5df]">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold mb-3 tracking-tight text-[#1a1a1a]">中国象棋</h1>
            <p className="text-[#666] italic text-lg">传承千年的智慧博弈</p>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-[#4a4a4a] border-b border-[#e5e5df] pb-2">
                <Cpu className="w-5 h-5 text-[#5A5A40]" /> 人机对战
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => startAI('red')}
                  className="flex-1 py-3 bg-[#8B0000] hover:bg-[#6B0000] text-white rounded-full font-medium transition-all shadow-sm hover:shadow-md"
                >
                  执红先手
                </button>
                <button
                  onClick={() => startAI('black')}
                  className="flex-1 py-3 bg-[#2c2c2c] hover:bg-[#1a1a1a] text-white rounded-full font-medium transition-all shadow-sm hover:shadow-md"
                >
                  执黑后手
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-[#4a4a4a] border-b border-[#e5e5df] pb-2">
                <Users className="w-5 h-5 text-[#5A5A40]" /> 双人对战
              </h2>
              <button
                onClick={startLocal}
                className="w-full py-3 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-full font-medium transition-all shadow-sm hover:shadow-md"
              >
                本地双人
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={startEdit}
                className="flex-1 py-3 bg-white border border-[#d5d5cf] hover:bg-[#f5f5f0] text-[#4a4a4a] rounded-full font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" /> 打谱模式
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="flex-1 py-3 bg-white border border-[#d5d5cf] hover:bg-[#f5f5f0] text-[#4a4a4a] rounded-full font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" /> 设置
              </button>
            </div>
          </div>
        </div>
      )}

      {mode !== 'menu' && (
        <div className="flex flex-col xl:flex-row gap-8 items-start justify-center w-full max-w-6xl">
          {/* Left Panel - Controls */}
          <div className="w-full xl:w-80 flex flex-col gap-4">
            <button
              onClick={() => setMode('menu')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-[#f5f5f0] text-[#4a4a4a] rounded-full font-medium transition-colors border border-[#d5d5cf] shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> 返回主菜单
            </button>

            {mode === 'edit' && (
              <div className="bg-white p-6 rounded-[24px] shadow-sm border border-[#e5e5df] flex flex-col gap-4">
                <h3 className="font-semibold text-lg border-b border-[#e5e5df] pb-2">编辑工具</h3>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const newGame = new Xiangqi();
                      setEditHistory(prev => [...prev, game]);
                      setGame(newGame);
                    }}
                    className="flex items-center justify-center gap-2 py-2 bg-[#f5f5f0] hover:bg-[#e5e5df] text-[#4a4a4a] rounded-xl font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> 初始局面
                  </button>
                  <button
                    onClick={() => {
                      const newGame = game.clone();
                      setEditHistory(prev => [...prev, game]);
                      newGame.clearBoard();
                      newGame.setPiece(9, 4, { id: 'k_red', type: 'k', color: 'red' });
                      newGame.setPiece(0, 4, { id: 'k_black', type: 'k', color: 'black' });
                      setGame(newGame);
                    }}
                    className="flex items-center justify-center gap-2 py-2 bg-[#f5f5f0] hover:bg-[#e5e5df] text-[#4a4a4a] rounded-xl font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> 清空棋盘
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-[#666]">红方棋子</div>
                  <div className="flex flex-wrap gap-2">
                    {(['k', 'a', 'e', 'h', 'r', 'c', 'p'] as const).map(type => (
                      <button
                        key={`red-${type}`}
                        onClick={() => setEditPiece({ id: `${type}_red_${Date.now()}`, type, color: 'red' })}
                        className={cn(
                          "w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-bold transition-all",
                          editPiece !== 'eraser' && editPiece?.type === type && editPiece?.color === 'red'
                            ? "border-[#8B0000] bg-[#fff0f0] text-[#8B0000] shadow-md scale-110"
                            : "border-[#d5d5cf] bg-white text-[#8B0000] hover:bg-[#f5f5f0]"
                        )}
                      >
                        {type === 'k' ? '帅' : type === 'a' ? '仕' : type === 'e' ? '相' : type === 'h' ? '马' : type === 'r' ? '车' : type === 'c' ? '炮' : '兵'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-[#666]">黑方棋子</div>
                  <div className="flex flex-wrap gap-2">
                    {(['k', 'a', 'e', 'h', 'r', 'c', 'p'] as const).map(type => (
                      <button
                        key={`black-${type}`}
                        onClick={() => setEditPiece({ id: `${type}_black_${Date.now()}`, type, color: 'black' })}
                        className={cn(
                          "w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-bold transition-all",
                          editPiece !== 'eraser' && editPiece?.type === type && editPiece?.color === 'black'
                            ? "border-[#2c2c2c] bg-[#f0f0f0] text-[#2c2c2c] shadow-md scale-110"
                            : "border-[#d5d5cf] bg-white text-[#2c2c2c] hover:bg-[#f5f5f0]"
                        )}
                      >
                        {type === 'k' ? '将' : type === 'a' ? '士' : type === 'e' ? '象' : type === 'h' ? '马' : type === 'r' ? '车' : type === 'c' ? '炮' : '卒'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setEditPiece('eraser')}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-xl font-medium transition-all border-2",
                    editPiece === 'eraser'
                      ? "border-[#5A5A40] bg-[#f0f0e8] text-[#5A5A40] shadow-md"
                      : "border-[#d5d5cf] bg-white text-[#666] hover:bg-[#f5f5f0]"
                  )}
                >
                  <Eraser className="w-4 h-4" /> 橡皮擦
                </button>
              </div>
            )}

            <div className="bg-white p-6 rounded-[24px] shadow-sm border border-[#e5e5df] flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-[#e5e5df] pb-2">
                <span className="font-semibold text-lg">当前回合</span>
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full", game.turn === 'red' ? 'bg-[#8B0000]' : 'bg-[#2c2c2c]')} />
                  <span className="font-medium">{game.turn === 'red' ? '红方' : '黑方'}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleUndo}
                  disabled={(mode === 'edit' ? editHistory.length === 0 : game.history.length === 0) || isThinking}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#f5f5f0] hover:bg-[#e5e5df] disabled:opacity-50 disabled:cursor-not-allowed text-[#4a4a4a] rounded-full font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> 悔棋
                </button>
                {mode !== 'edit' && (
                  <button
                    onClick={restartGame}
                    disabled={isThinking}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#f5f5f0] hover:bg-[#e5e5df] disabled:opacity-50 disabled:cursor-not-allowed text-[#4a4a4a] rounded-full font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> 重新开始
                  </button>
                )}
              </div>
            </div>

            {/* Cheat Mode Panel */}
            {mode !== 'edit' && (
              <div className="bg-white p-6 rounded-[24px] shadow-sm border border-[#e5e5df] flex flex-col gap-4">
                <h3 className="font-semibold text-lg border-b border-[#e5e5df] pb-2">秘籍模式</h3>
                {!isCheatModeUnlocked ? (
                  <form onSubmit={handleCheatUnlock} className="flex gap-2">
                    <input
                      type="password"
                      value={cheatPassword}
                      onChange={(e) => setCheatPassword(e.target.value)}
                      placeholder="输入密码"
                      className="flex-1 border border-[#d5d5cf] rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#5A5A40]"
                    />
                    <button type="submit" className="px-4 py-2 bg-[#5A5A40] text-white rounded-full text-sm font-medium hover:bg-[#4A4A30]">
                      解锁
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-[#666] italic">点击下方技能，然后在棋盘上选择目标。</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setActiveCheat(activeCheat === 'armor' ? 'none' : 'armor')}
                        className={cn("py-2 px-2 text-sm rounded-xl border transition-all", activeCheat === 'armor' ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#4a4a4a] border-[#d5d5cf] hover:bg-[#f5f5f0]")}
                      >
                        铁甲兵 (己方兵)
                      </button>
                      <button
                        onClick={() => setActiveCheat(activeCheat === 'drift' ? 'none' : 'drift')}
                        className={cn("py-2 px-2 text-sm rounded-xl border transition-all", activeCheat === 'drift' ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#4a4a4a] border-[#d5d5cf] hover:bg-[#f5f5f0]")}
                      >
                        漂移车 (己方车)
                      </button>
                      <button
                        onClick={() => setActiveCheat(activeCheat === 'betray' ? 'none' : 'betray')}
                        className={cn("py-2 px-2 text-sm rounded-xl border transition-all", activeCheat === 'betray' ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#4a4a4a] border-[#d5d5cf] hover:bg-[#f5f5f0]")}
                      >
                        策反 (敌方棋子)
                      </button>
                    </div>
                    
                    <div className="pt-2 border-t border-[#e5e5df]">
                      <div className="text-sm mb-2">复活阵亡棋子:</div>
                      <div className="flex flex-wrap gap-1">
                        {game.capturedPieces.filter(p => p.color === playerColor).map((p, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setRevivePiece(p);
                              setActiveCheat('revive');
                            }}
                            className={cn(
                              "w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold",
                              activeCheat === 'revive' && revivePiece === p ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#4a4a4a] border-[#d5d5cf] hover:bg-[#f5f5f0]"
                            )}
                          >
                            {p.type === 'r' ? '车' : p.type === 'h' ? '马' : p.type === 'c' ? '炮' : p.type === 'e' ? '相' : p.type === 'a' ? '仕' : '兵'}
                          </button>
                        ))}
                        {game.capturedPieces.filter(p => p.color === playerColor).length === 0 && (
                          <span className="text-xs text-[#999]">无阵亡棋子</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel - Board */}
          <div className="relative flex flex-col items-center">
            {mode !== 'edit' && (
              <div className="flex flex-col w-full max-w-md mb-6 bg-white rounded-[24px] shadow-sm border border-[#e5e5df] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", playerColor === 'red' ? 'bg-[#8B0000]' : 'bg-[#2c2c2c]')} />
                    <span className="font-medium text-lg">{playerColor === 'red' ? '红方' : '黑方'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {isThinking && (
                      <span className="text-sm font-medium text-[#5A5A40]">电脑思考中… {aiProgress}%</span>
                    )}
                    <div className="text-sm text-[#666] italic">
                      {mode === 'ai' ? '（电脑）' : '（玩家 2）'}
                    </div>
                  </div>
                </div>
                {isThinking && (
                  <div className="w-full bg-[#e5e5df] h-1.5">
                    <div
                      className="bg-[#5A5A40] h-1.5 transition-all duration-300 ease-out"
                      style={{ width: `${aiProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <Board 
                game={game} 
                playerColor={playerColor} 
                onMove={handleMove} 
                boardTheme={boardTheme}
                pieceTheme={pieceTheme}
                isEditMode={mode === 'edit'}
                onEditClick={handleEditClick}
                onSquareClickOverride={activeCheat !== 'none' ? handleCheatAction : undefined}
              />
              
              {gameOver && mode !== 'edit' && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[24px] z-50">
                  <h2 className="text-5xl font-bold text-[#1a1a1a] mb-8">{gameOver}</h2>
                  <button
                    onClick={() => {
                      if (mode === 'ai') startAI(playerColor as 'red' | 'black');
                      else if (mode === 'local') startLocal();
                      else setMode('menu');
                    }}
                    className="px-10 py-4 bg-[#8B0000] hover:bg-[#6B0000] text-white rounded-full font-medium transition-all shadow-lg hover:shadow-xl text-lg"
                  >
                    再来一局
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-[32px] shadow-2xl w-full max-w-sm border border-[#e5e5df]">
            <h2 className="text-3xl font-bold mb-8 text-[#1a1a1a] text-center">设置</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#666] mb-2">人机难度</label>
              <select 
                value={aiDifficulty} 
                onChange={e => setAiDifficulty(Number(e.target.value))}
                className="w-full border border-[#d5d5cf] rounded-xl px-4 py-3 bg-[#f5f5f0] focus:outline-none focus:border-[#5A5A40]"
              >
                <option value={1}>普通</option>
                <option value={2}>村冠</option>
                <option value={3}>镇冠</option>
                <option value={4}>县冠</option>
                <option value={5}>大师</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[#666] mb-2">棋盘样式</label>
              <select 
                value={boardTheme} 
                onChange={e => setBoardTheme(e.target.value as BoardTheme)}
                className="w-full border border-[#d5d5cf] rounded-xl px-4 py-3 bg-[#f5f5f0] focus:outline-none focus:border-[#5A5A40]"
              >
                <option value="classic">经典</option>
                <option value="wood">木纹</option>
                <option value="paper">纸质</option>
              </select>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-[#666] mb-2">棋子样式</label>
              <select 
                value={pieceTheme} 
                onChange={e => setPieceTheme(e.target.value as PieceTheme)}
                className="w-full border border-[#d5d5cf] rounded-xl px-4 py-3 bg-[#f5f5f0] focus:outline-none focus:border-[#5A5A40]"
              >
                <option value="classic">经典</option>
                <option value="wood">木质</option>
                <option value="flat">扁平</option>
              </select>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-4 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-full font-medium transition-all shadow-md hover:shadow-lg"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
