import { Xiangqi } from './xiangqi';
import { getBestMove } from './ai';

self.onmessage = (e) => {
  const { board, turn, history, capturedPieces, difficulty } = e.data;
  
  const game = new Xiangqi();
  game.board = board;
  game.turn = turn;
  game.history = history;
  game.capturedPieces = capturedPieces;

  const move = getBestMove(game, difficulty, (progress) => {
    self.postMessage({ type: 'progress', progress });
  });

  self.postMessage({ type: 'done', move });
};
