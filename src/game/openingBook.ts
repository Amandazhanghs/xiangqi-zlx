// Opening book removed — AI now computes all moves independently.
// This file is kept for compatibility but exports a no-op function.

import { Move } from './xiangqi';

export function getOpeningMove(_history: Move[]): Move | null {
  return null;
}
