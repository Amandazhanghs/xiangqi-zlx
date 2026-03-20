import React, { useState, useEffect } from 'react';
import { Board, BoardTheme, PieceTheme, PIECE_CHARS } from './components/Board';
import { Xiangqi, Move, Piece, PieceColor, PieceType } from './game/xiangqi';
import { getBestMove } from './game/ai';
import { io, Socket } from 'socket.io-client';
import { Users, Cpu, ArrowLeft, Loader2, Settings, Edit3, RotateCcw, Play, Eraser, Trash2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { playMoveSound, playCaptureSound, playCheckSound } from './utils/sounds';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type GameMode = 'menu' | 'ai' | 'online' | 'local' | 'edit';

export default function App() {
  const [mode, setMode] = useState<GameMode>('menu');
  const [game, setGame] = useState(new Xiangqi());
  const [playerColor, setPlayerColor] = useState<'red' | 'black' | 'both'>('red');
  const [roomId, setRoomId] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [creatorColor, setCreatorColor] = useState<'red' | 'black'>('red');

  // Settings
  const [aiDifficulty, setAiDifficulty] = useState<number>(3);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('classic');
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>('classic');
  const [showSettings, setShowSettings] = useState(false);

  // Edit Mode
  const [editPiece, setEditPiece] = useState<Piece | 'eraser' | null>(null);

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
    if (mode === 'ai' && game.turn !== playerColor && !game.isGameOver()) {
      const timer = setTimeout(() => {
        const bestMove = getBestMove(game, aiDifficulty);
        if (bestMove) {
          const newGame = game.clone();
          newGame.makeMove(bestMove);
          triggerSoundEffects(bestMove, newGame);
          setGame(newGame);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [game, mode, playerColor, aiDifficulty]);

  // Socket setup
  useEffect(() => {
    if (mode === 'online') {
      // Support both same-origin (dev) and cross-origin (deployed) connections
      // When deployed, the client and server are on the same host, so no URL needed.
      // window.location.origin ensures it connects to the correct server when deployed.
      const serverUrl = window.location.origin;
      const newSocket = io(serverUrl, {
        transports: ['websocket', 'polling'],
      });
      setSocket(newSocket);

      newSocket.on('roomCreated', (id) => {
        setRoomId(id);
        setIsWaiting(true);
      });

      newSocket.on('playerColor', (color) => {
        setPlayerColor(color);
      });

      newSocket.on('gameStart', () => {
        setIsWaiting(false);
        setGame(new Xiangqi());
        setGameOver(null);
        setIsCheatModeUnlocked(false);
        setActiveCheat('none');
      });

      newSocket.on('opponentMove', (move: Move) => {
        setGame(prev => {
          const newGame = prev.clone();
          newGame.makeMove(move);
          triggerSoundEffects(move, newGame);
          return newGame;
        });
      });

      newSocket.on('opponentCheatAction', ({ action, payload }) => {
        setGame(prev => {
          const newGame = prev.clone();
          if (action === 'armor') newGame.applyCheatArmor(payload.r, payload.c);
          if (action === 'drift') newGame.applyCheatDrift(payload.r, payload.c);
          if (action === 'revive') newGame.applyCheatRevive(payload.r, payload.c, payload.piece);
          if (action === 'betray') newGame.applyCheatBetray(payload.r, payload.c);
          return newGame;
        });
      });

      newSocket.on('playerDisconnected', () => {
        setGameOver('对手已断开连接');
      });

      newSocket.on('error', (msg) => {
        alert(msg);
        setMode('menu');
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [mode]);

  /**
   * Play sound effects based on what happened after a move:
   * - If the opponent is in check after the move → 将军
   * - If a piece was captured → 吃
   * - Otherwise → move sound
   */
  const triggerSoundEffects = (move: Move, gameAfterMove: Xiangqi) => {
    const opponentColor: PieceColor = gameAfterMove.turn; // turn has already flipped
    const inCheck = gameAfterMove.isInCheck(opponentColor);
    if (inCheck) {
      playCheckSound();
    } else if (move.captured) {
      playCaptureSound();
    } else {
      playMoveSound();
    }
  };

  const handleMove = (move: Move) => {
    const newGame = game.clone();
    if (newGame.makeMove(move)) {
      triggerSoundEffects(move, newGame);
      setGame(newGame);
      if (mode === 'online' && socket) {
        socket.emit('move', { roomId, move });
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
      if (mode === 'online' && socket) {
        socket.emit('cheatAction', {
          roomId,
          action: activeCheat,
          payload: { r, c, piece: activeCheat === 'revive' ? revivePiece : undefined }
        });
      }
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

      if (editPiece.type === 'k') {
        for (let i = 0; i < 10; i++) {
          for (let j = 0; j < 9; j++) {
            const p = newGame.getPiece(i, j);
            if (p && p.type === 'k' && p.color === editPiece.color) {
              newGame.setPiece(i, j, null);
            }
          }
        }
      }

      newGame.setPiece(r, c, { ...editPiece });
    }
    setGame(newGame);
  };

  const handleUndo = () => {
    if (mode === 'ai') {
      const newGame = game.clone();
      newGame.undo();
      newGame.undo();
      setGame(newGame);
      setGameOver(null);
    } else if (mode === 'local' || mode === 'edit') {
      const newGame = game.clone();
      newGame.undo();
      setGame(newGame);
      setGameOver(null);
    }
  };

  const startAI = (color: 'red' | 'black') => {
    setPlayerColor(color);
    setGame(new Xiangqi());
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
    setMode('ai');
  };

  const startLocal = () => {
    setPlayerColor('both');
    setGame(new Xiangqi());
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
    setMode('local');
  };

  const startEdit = () => {
    setPlayerColor('both');
    const newGame = new Xiangqi();
    newGame.clearBoard();
    newGame.setPiece(9, 4, { id: 'k_red', type: 'k', color: 'red' });
    newGame.setPiece(0, 4, { id: 'k_black', type: 'k', color: 'black' });
    setGame(newGame);
    setGameOver(null);
    setIsCheatModeUnlocked(false);
    setActiveCheat('none');
    setMode('edit');
  };

  const createRoom = () => {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    socket?.emit('createRoom', { roomId: id, color: creatorColor });
  };

  const joinRoom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const id = formData.get('roomId') as string;
    if (id) {
      setRoomId(id);
      socket?.emit('joinRoom', id);
    }
  };

  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
        <h1 className="text-5xl font-bold text-amber-900 mb-12" style={{ fontFamily: '"Kaiti", "STKaiti", serif' }}>
          中国象棋
        </h1>
        <div className="flex flex-col gap-6 w-full max-w-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-stone-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-stone-800">
                <Cpu className="w-5 h-5" /> 人机对战
              </h2>
              <select 
                value={aiDifficulty} 
                onChange={e => setAiDifficulty(Number(e.target.value))}
                className="text-sm border border-stone-300 rounded px-2 py-1 bg-stone-50"
              >
                <option value={2}>简单 (深度 2)</option>
                <option value={3}>普通 (深度 3)</option>
                <option value={4}>困难 (深度 4)</option>
              </select>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => startAI('red')}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
              >
                执红先手
              </button>
              <button
                onClick={() => startAI('black')}
                className="flex-1 py-3 bg-stone-800 hover:bg-stone-900 text-white rounded-xl font-medium transition-colors"
              >
                执黑后手
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xl border border-stone-200">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-stone-800">
              <Users className="w-5 h-5" /> 双人对战
            </h2>
            <div className="flex gap-4 mb-4">
              <button
                onClick={startLocal}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
              >
                本地双人
              </button>
              <button
                onClick={() => setMode('online')}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors"
              >
                联网对战
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={startEdit}
              className="flex-1 py-3 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Edit3 className="w-5 h-5" /> 打谱 / 编辑
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex-1 py-3 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Settings className="w-5 h-5" /> 设置
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
              <h2 className="text-2xl font-bold mb-6 text-stone-800">设置</h2>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-stone-700 mb-2">棋盘样式</label>
                <select 
                  value={boardTheme} 
                  onChange={e => setBoardTheme(e.target.value as BoardTheme)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2"
                >
                  <option value="classic">经典</option>
                  <option value="wood">木纹</option>
                  <option value="paper">纸质</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-stone-700 mb-2">棋子样式</label>
                <select 
                  value={pieceTheme} 
                  onChange={e => setPieceTheme(e.target.value as PieceTheme)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2"
                >
                  <option value="classic">经典</option>
                  <option value="wood">木质</option>
                  <option value="flat">扁平</option>
                </select>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-4 mb-8">
        <button
          onClick={() => {
            setMode('menu');
            setRoomId('');
            if (socket) socket.disconnect();
          }}
          className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors bg-white px-4 py-2 rounded-lg shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回主菜单
        </button>
        
        <div className="text-lg font-medium text-stone-800 bg-white px-6 py-2 rounded-lg shadow-sm flex items-center gap-4">
          {mode === 'online' ? (
            isWaiting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 等待对手加入... 房间号: <strong className="text-amber-600">{roomId}</strong>
              </span>
            ) : (
              <span>联网对战 - 房间号: {roomId}</span>
            )
          ) : mode === 'local' ? (
            <span>本地双人</span>
          ) : mode === 'edit' ? (
            <span>打谱 / 编辑局面</span>
          ) : (
            <span>人机对战 (深度 {aiDifficulty})</span>
          )}

          {mode !== 'online' && mode !== 'edit' && (
            <button
              onClick={handleUndo}
              disabled={game.history.length === 0}
              className="ml-4 flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> 悔棋
            </button>
          )}
        </div>
      </div>

      {mode === 'online' && !roomId && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-stone-200 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-stone-800 mb-6">联网对战</h2>
          
          <div className="mb-6 text-left">
            <label className="block text-sm font-medium text-stone-700 mb-2">选择执棋颜色</label>
            <div className="flex gap-4">
              <button
                onClick={() => setCreatorColor('red')}
                className={`flex-1 py-2 rounded-lg border-2 font-medium transition-colors ${creatorColor === 'red' ? 'border-red-600 bg-red-50 text-red-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
              >
                执红先走
              </button>
              <button
                onClick={() => setCreatorColor('black')}
                className={`flex-1 py-2 rounded-lg border-2 font-medium transition-colors ${creatorColor === 'black' ? 'border-stone-800 bg-stone-100 text-stone-900' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
              >
                执黑后走
              </button>
            </div>
          </div>

          <button
            onClick={createRoom}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors mb-6"
          >
            创建新房间
          </button>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-stone-500">或加入已有房间</span>
            </div>
          </div>
          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              name="roomId"
              placeholder="输入6位数字房间号"
              className="flex-1 px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              maxLength={6}
              pattern="\d{6}"
              required
            />
            <button
              type="submit"
              className="px-6 py-3 bg-stone-800 hover:bg-stone-900 text-white rounded-xl font-medium transition-colors"
            >
              加入
            </button>
          </form>
        </div>
      )}

      {(!isWaiting && (mode === 'ai' || mode === 'local' || mode === 'edit' || (mode === 'online' && roomId))) && (
        <div className="flex flex-col lg:flex-row items-start gap-8">
          <div className="flex flex-col items-center gap-4">
            {mode !== 'edit' && (
              <div className="flex items-center justify-between w-full max-w-md px-4 py-2 bg-white rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${game.turn === (playerColor === 'red' ? 'black' : 'red') ? (playerColor === 'red' ? 'bg-black' : 'bg-red-500') : 'bg-stone-300'}`} />
                  <span className="font-medium">{playerColor === 'red' ? '黑方' : '红方'}</span>
                </div>
                <div className="text-sm text-stone-500">
                  {mode === 'ai' ? '(电脑)' : mode === 'local' ? '(玩家 2)' : '(对手)'}
                </div>
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
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-50">
                  <h2 className="text-4xl font-bold text-stone-800 mb-6">{gameOver}</h2>
                  <button
                    onClick={() => {
                      if (mode === 'ai') startAI(playerColor as 'red' | 'black');
                      else if (mode === 'local') startLocal();
                      else setMode('menu');
                    }}
                    className="px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors"
                  >
                    {mode === 'online' ? '返回主菜单' : '再来一局'}
                  </button>
                </div>
              )}
            </div>

            {mode !== 'edit' && (
              <div className="flex items-center justify-between w-full max-w-md px-4 py-2 bg-white rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${game.turn === playerColor || (mode==='local' && game.turn==='red') ? (playerColor === 'black' ? 'bg-black' : 'bg-red-500') : 'bg-stone-300'}`} />
                  <span className="font-medium">{playerColor === 'black' ? '黑方' : '红方'}</span>
                </div>
                <div className="text-sm text-stone-500">
                  {mode === 'local' ? '(玩家 1)' : '(你)'}
                </div>
              </div>
            )}
          </div>

          {/* Cheat Mode Palette */}
          {(mode === 'online' || mode === 'ai') && (
            <div className="w-full max-w-xs flex flex-col gap-4">
              {!isCheatModeUnlocked && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={cheatPassword}
                      onChange={e => setCheatPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => {
                        if (cheatPassword === '244039') {
                          setIsCheatModeUnlocked(true);
                          setCheatPassword('');
                        } else {
                          alert('密码错误');
                        }
                      }}
                      className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      解锁
                    </button>
                  </div>
                </div>
              )}

              {isCheatModeUnlocked && (
                <div className="bg-white p-5 rounded-xl shadow-xl border border-red-200">
                  <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                    🔥 开挂模式
                  </h3>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setActiveCheat(activeCheat === 'armor' ? 'none' : 'armor')}
                      className={cn("py-3 px-4 text-sm font-medium rounded-lg border transition-colors text-left", activeCheat === 'armor' ? "bg-red-50 border-red-500 text-red-700" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100")}
                    >
                      🛡️ 装甲兵 (选己方兵)
                    </button>
                    <button
                      onClick={() => setActiveCheat(activeCheat === 'drift' ? 'none' : 'drift')}
                      className={cn("py-3 px-4 text-sm font-medium rounded-lg border transition-colors text-left", activeCheat === 'drift' ? "bg-red-50 border-red-500 text-red-700" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100")}
                    >
                      🏎️ 漂移车 (选己方车)
                    </button>
                    <button
                      onClick={() => {
                        setActiveCheat(activeCheat === 'revive' ? 'none' : 'revive');
                        setRevivePiece(null);
                      }}
                      className={cn("py-3 px-4 text-sm font-medium rounded-lg border transition-colors text-left", activeCheat === 'revive' ? "bg-red-50 border-red-500 text-red-700" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100")}
                    >
                      ✨ 复活 (选被吃棋子)
                    </button>
                    {activeCheat === 'revive' && (
                      <div className="flex flex-wrap gap-2 mt-1 p-3 bg-stone-100 rounded-lg border border-stone-200">
                        {game.capturedPieces.filter(p => p.color === playerColor).map((p, i) => (
                          <button
                            key={i}
                            onClick={() => setRevivePiece(p)}
                            className={cn("w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-bold transition-all",
                              p.color === 'red' ? "text-red-600 border-red-700 bg-[#ffe4b5]" : "text-black border-gray-800 bg-[#ffe4b5]",
                              revivePiece === p ? "ring-4 ring-blue-400 scale-110" : "hover:scale-105"
                            )}
                            style={{ fontFamily: '"Kaiti", "STKaiti", serif' }}
                          >
                            {PIECE_CHARS[`${p.color}-${p.type}`]}
                          </button>
                        ))}
                        {game.capturedPieces.filter(p => p.color === playerColor).length === 0 && (
                          <span className="text-sm text-stone-500 w-full text-center py-2">无被吃棋子</span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setActiveCheat(activeCheat === 'betray' ? 'none' : 'betray')}
                      className={cn("py-3 px-4 text-sm font-medium rounded-lg border transition-colors text-left", activeCheat === 'betray' ? "bg-red-50 border-red-500 text-red-700" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100")}
                    >
                      🤝 叛变 (选敌方进攻棋子)
                    </button>
                  </div>
                  {activeCheat !== 'none' && (
                    <p className="mt-4 text-xs text-red-500 font-medium text-center">
                      请在棋盘上点击目标位置/棋子
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Edit Mode Palette */}
          {mode === 'edit' && (
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-stone-200 w-full max-w-xs">
              <h3 className="text-lg font-bold text-stone-800 mb-4">编辑工具</h3>
              
              <div className="mb-6">
                <h4 className="text-sm font-medium text-stone-500 mb-2">红方棋子</h4>
                <div className="flex flex-wrap gap-2">
                  {(['k', 'a', 'e', 'h', 'r', 'c', 'p'] as PieceType[]).map(type => (
                    <button
                      key={`red-${type}`}
                      onClick={() => setEditPiece({ color: 'red', type })}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 text-red-600 border-red-700 bg-[#ffe4b5]",
                        editPiece !== 'eraser' && editPiece?.color === 'red' && editPiece?.type === type && "ring-4 ring-blue-400"
                      )}
                      style={{ fontFamily: '"Kaiti", "STKaiti", serif' }}
                    >
                      {PIECE_CHARS[`red-${type}`]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium text-stone-500 mb-2">黑方棋子</h4>
                <div className="flex flex-wrap gap-2">
                  {(['k', 'a', 'e', 'h', 'r', 'c', 'p'] as PieceType[]).map(type => (
                    <button
                      key={`black-${type}`}
                      onClick={() => setEditPiece({ color: 'black', type })}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 text-black border-gray-800 bg-[#ffe4b5]",
                        editPiece !== 'eraser' && editPiece?.color === 'black' && editPiece?.type === type && "ring-4 ring-blue-400"
                      )}
                      style={{ fontFamily: '"Kaiti", "STKaiti", serif' }}
                    >
                      {PIECE_CHARS[`black-${type}`]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <button
                  onClick={() => setEditPiece('eraser')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium",
                    editPiece === 'eraser' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-stone-300 text-stone-600 hover:bg-stone-50"
                  )}
                >
                  <Eraser className="w-5 h-5" /> 橡皮擦
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    const newGame = new Xiangqi();
                    newGame.clearBoard();
                    setGame(newGame);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> 清空棋盘
                </button>
                <button
                  onClick={() => {
                    const newGame = new Xiangqi();
                    setGame(newGame);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> 初始局面
                </button>
                
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-sm font-medium text-stone-500 mb-2">从当前局面开始:</h4>
                  <button
                    onClick={() => {
                      setPlayerColor('red');
                      setMode('ai');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 mb-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Play className="w-4 h-4" /> 人机对战 (执红)
                  </button>
                  <button
                    onClick={() => {
                      setPlayerColor('black');
                      setMode('ai');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 mb-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg font-medium transition-colors"
                  >
                    <Play className="w-4 h-4" /> 人机对战 (执黑)
                  </button>
                  <button
                    onClick={() => {
                      setPlayerColor('both');
                      setMode('local');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Users className="w-4 h-4" /> 本地双人
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
