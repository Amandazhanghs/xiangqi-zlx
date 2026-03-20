import { Move } from './xiangqi';

// Opening book variations
// Represented as 'fromR,fromC-toR,toC'
const bookVariations: string[][] = [
  // 中炮对屏风马 (Central Cannon vs Screen Horse)
  ['7,7-7,4', '0,7-2,6', '9,7-7,6', '0,1-2,2', '9,8-9,7', '3,2-4,2'],
  ['7,1-7,4', '0,1-2,2', '9,1-7,2', '0,7-2,6', '9,0-9,1', '3,6-4,6'],
  ['7,7-7,4', '0,7-2,6', '9,7-7,6', '0,1-2,2', '9,8-9,7', '0,8-0,7'],
  ['7,1-7,4', '0,1-2,2', '9,1-7,2', '0,7-2,6', '9,0-9,1', '0,0-0,1'],
  
  // 中炮对顺炮 (Central Cannon vs Same Direction Cannon)
  ['7,7-7,4', '2,7-2,4', '9,7-7,6', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['7,1-7,4', '2,1-2,4', '9,1-7,2', '0,1-2,2', '9,0-9,1', '0,0-0,1'],
  ['7,7-7,4', '2,7-2,4', '9,7-7,6', '0,7-2,6', '6,4-5,4', '0,8-0,7'],
  ['7,1-7,4', '2,1-2,4', '9,1-7,2', '0,1-2,2', '6,4-5,4', '0,0-0,1'],
  
  // 中炮对列炮 (Central Cannon vs Opposite Direction Cannon)
  ['7,7-7,4', '2,1-2,4', '9,7-7,6', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['7,1-7,4', '2,7-2,4', '9,1-7,2', '0,1-2,2', '9,0-9,1', '0,0-0,1'],

  // 仙人指路对卒底炮 (Pawn to 3/7 vs Pawn Bottom Cannon)
  ['6,6-5,6', '2,7-2,6', '9,7-7,6', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['6,2-5,2', '2,1-2,2', '9,1-7,2', '0,1-2,2', '9,0-9,1', '0,0-0,1'],
  
  // 仙人指路对飞象 (Pawn to 3/7 vs Elephant)
  ['6,6-5,6', '0,2-2,4', '9,7-7,6', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['6,2-5,2', '0,6-2,4', '9,1-7,2', '0,1-2,2', '9,0-9,1', '0,0-0,1'],

  // 飞相局对过宫炮 (Elephant Opening vs Cross-Palace Cannon)
  ['9,6-7,4', '2,1-2,5', '9,7-7,6', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['9,2-7,4', '2,7-2,3', '9,1-7,2', '0,1-2,2', '9,0-9,1', '0,0-0,1'],
  
  // 飞相局对士角炮 (Elephant Opening vs Corner Cannon)
  ['9,6-7,4', '2,1-2,3', '9,7-7,6', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['9,2-7,4', '2,7-2,5', '9,1-7,2', '0,1-2,2', '9,0-9,1', '0,0-0,1'],

  // 起马局对挺卒 (Knight Opening vs Pawn)
  ['9,7-7,6', '3,2-4,2', '7,7-7,4', '0,7-2,6', '9,8-9,7', '0,8-0,7'],
  ['9,1-7,2', '3,6-4,6', '7,1-7,4', '0,1-2,2', '9,0-9,1', '0,0-0,1'],
];

export function getOpeningMove(history: Move[]): Move | null {
  const currentSequence = history.map(m => `${m.from.r},${m.from.c}-${m.to.r},${m.to.c}`);
  
  // Find all variations that match the current sequence
  const matchingVariations = bookVariations.filter(variation => {
    if (variation.length <= currentSequence.length) return false;
    for (let i = 0; i < currentSequence.length; i++) {
      if (variation[i] !== currentSequence[i]) return false;
    }
    return true;
  });

  if (matchingVariations.length === 0) return null;

  // Randomly select one matching variation
  const selectedVariation = matchingVariations[Math.floor(Math.random() * matchingVariations.length)];
  const nextMoveStr = selectedVariation[currentSequence.length];
  
  const [fromStr, toStr] = nextMoveStr.split('-');
  const [fromR, fromC] = fromStr.split(',').map(Number);
  const [toR, toC] = toStr.split(',').map(Number);

  return {
    from: { r: fromR, c: fromC },
    to: { r: toR, c: toC }
  };
}
