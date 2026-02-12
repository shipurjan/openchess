"use client";

import { useEffect, useRef } from "react";
import { formatTimestamp, type MovePair } from "@/lib/chess-utils";

interface PaginatedMoveListProps {
  movePairs: MovePair[];
  canReview: boolean;
  isReviewMode: boolean;
  reviewMoveIndex: number | null;
  onMoveClick: (arrayIndex: number) => void;
}

export function PaginatedMoveList({
  movePairs,
  canReview,
  isReviewMode,
  reviewMoveIndex,
  onMoveClick,
}: PaginatedMoveListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isReviewMode) {
      bottomRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [movePairs.length, isReviewMode]);

  return (
    <div className="max-h-64 overflow-y-auto text-sm" data-testid="move-list">
      {movePairs.length === 0 && (
        <p className="text-muted-foreground">No moves yet</p>
      )}
      {movePairs.map((pair) => {
        const whiteMoveArrayIndex = (pair.num - 1) * 2;
        const blackMoveArrayIndex = (pair.num - 1) * 2 + 1;
        const isWhiteSelected =
          isReviewMode && reviewMoveIndex === whiteMoveArrayIndex + 1;
        const isBlackSelected =
          isReviewMode && reviewMoveIndex === blackMoveArrayIndex + 1;

        return (
          <div key={pair.num} className="flex items-center gap-2 py-0.5">
            <span className="w-6 text-right text-muted-foreground">
              {pair.num}.
            </span>
            <button
              type="button"
              onClick={() => canReview && onMoveClick(whiteMoveArrayIndex)}
              className={`w-16 text-left transition-colors ${
                canReview ? "cursor-pointer hover:text-primary" : ""
              } ${isWhiteSelected ? "-mx-1 rounded bg-primary/20 px-1 text-primary" : "text-foreground"}`}
              disabled={!canReview}
              title={
                pair.whiteTimestamp
                  ? formatTimestamp(pair.whiteTimestamp)
                  : undefined
              }
            >
              {pair.white}
            </button>
            {pair.black && (
              <button
                type="button"
                onClick={() => canReview && onMoveClick(blackMoveArrayIndex)}
                className={`w-16 text-left transition-colors ${
                  canReview ? "cursor-pointer hover:text-primary" : ""
                } ${isBlackSelected ? "-mx-1 rounded bg-primary/20 px-1 text-primary" : "text-foreground"}`}
                disabled={!canReview}
                title={
                  pair.blackTimestamp
                    ? formatTimestamp(pair.blackTimestamp)
                    : undefined
                }
              >
                {pair.black}
              </button>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
