export const MOVES_PER_PAGE = 20;

export function calculateTotalPages(movePairCount: number): number {
  return Math.max(1, Math.ceil(movePairCount / MOVES_PER_PAGE));
}

export function getPageForMove(moveIndex: number): number {
  const pairIndex = Math.floor(moveIndex / 2);
  return Math.floor(pairIndex / MOVES_PER_PAGE);
}

export function getPageForPair(pairIndex: number): number {
  return Math.floor(pairIndex / MOVES_PER_PAGE);
}

export function getLastPage(movePairCount: number): number {
  return Math.max(0, calculateTotalPages(movePairCount) - 1);
}

export function getMovesForPage<T>(movePairs: T[], page: number): T[] {
  const start = page * MOVES_PER_PAGE;
  const end = start + MOVES_PER_PAGE;
  return movePairs.slice(start, end);
}

export function clampPage(page: number, totalPages: number): number {
  return Math.max(0, Math.min(page, totalPages - 1));
}
