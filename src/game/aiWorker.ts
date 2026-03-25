import { Xiangqi, Move } from './xiangqi';
import { getBestMove } from './ai';

self.onmessage = (e) => {
  const { board, turn, history, capturedPieces, difficulty, forbiddenMoves, boardKeyHistory, movesSinceCapture } = e.data;

  const game = new Xiangqi();
  game.board = board;
  game.turn = turn;
  game.history = history;
  game.capturedPieces = capturedPieces;
  // Restore draw-tracking state if provided
  if (boardKeyHistory) game.boardKeyHistory = boardKeyHistory;
  if (typeof movesSinceCapture === 'number') game.movesSinceCapture = movesSinceCapture;

  const move = getBestMove(game, difficulty, (progress) => {
    self.postMessage({ type: 'progress', progress });
  }, forbiddenMoves || []);

  self.postMessage({ type: 'done', move });
};
