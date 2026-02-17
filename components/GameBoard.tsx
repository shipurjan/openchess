"use client";

import React from "react";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import type { PlayerRole } from "@/lib/game-actions";
import { useGameSocket, type GameSocketMessage } from "@/hooks/useGameSocket";
import {
  getTurnFromFen,
  getPieceColor,
  formatResult,
  formatMoves,
  formatTimeControl,
  type GameResult,
} from "@/lib/chess-utils";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { logger } from "@/lib/logger";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { PaginatedMoveList } from "@/components/PaginatedMoveList";
import { ChessClock } from "@/components/ChessClock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function getLastMoveSquares(
  moves: { notation: string; fen?: string }[],
): { from: string; to: string } | null {
  if (moves.length === 0) return null;
  const lastIdx = moves.length - 1;
  const prevFen = lastIdx > 0 ? moves[lastIdx - 1].fen : INITIAL_FEN;

  if (prevFen) {
    try {
      const chess = new Chess(prevFen);
      const result = chess.move(moves[lastIdx].notation);
      return result ? { from: result.from, to: result.to } : null;
    } catch {
      return null;
    }
  }

  // Fallback: replay all moves
  const chess = new Chess();
  let result = null;
  for (const m of moves) {
    try {
      result = chess.move(m.notation);
    } catch {
      break;
    }
  }
  return result ? { from: result.from, to: result.to } : null;
}

function highlightStyle(square: string): React.CSSProperties {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  const isLight = (file + rank) % 2 === 1;
  return { backgroundColor: isLight ? "#D4A843" : "#B8912E" };
}

interface GameBoardProps {
  gameId: string;
  status: string;
  result: string | null;
  playerRole: PlayerRole;
  currentFen: string;
  canJoin: boolean;
  moves: {
    moveNumber: number;
    notation: string;
    createdAt?: number;
    fen?: string;
  }[];
  isArchived?: boolean;
  timeInitialMs?: number;
  timeIncrementMs?: number;
}

export function GameBoard({
  gameId,
  status: initialStatus,
  result: initialResult,
  playerRole,
  currentFen: initialFen,
  canJoin,
  moves: initialMoves,
  isArchived = false,
  timeInitialMs: initialTimeInitialMs = 0,
  timeIncrementMs: initialTimeIncrementMs = 0,
}: GameBoardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showJoinButton, setShowJoinButton] = useState(canJoin);
  const [copyTimeoutId, setCopyTimeoutId] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [pgnModalOpen, setPgnModalOpen] = useState(false);
  const [pgnContent, setPgnContent] = useState<string | null>(null);
  const [resignConfirming, setResignConfirming] = useState(false);
  const resignTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Game state updated via WebSocket
  const [fen, setFen] = useState(initialFen);
  const [moves, setMoves] = useState(initialMoves);
  const [gameStatus, setGameStatus] = useState(initialStatus);
  const [gameResult, setGameResult] = useState(initialResult);
  const [pendingDrawOffer, setPendingDrawOffer] = useState<
    "white" | "black" | null
  >(null);
  const [opponentConnected, setOpponentConnected] = useState<boolean | null>(
    null,
  );
  const [pendingRematchOffer, setPendingRematchOffer] = useState<
    "white" | "black" | null
  >(null);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
  } | null>(() => getLastMoveSquares(initialMoves));

  // Claim-win state
  const [claimDeadline, setClaimDeadline] = useState<number | null>(null);
  const [claimCountdown, setClaimCountdown] = useState<number | null>(null);

  // Clock state
  const [timeInitialMs, setTimeInitialMs] = useState(initialTimeInitialMs);
  const [timeIncrementMs, setTimeIncrementMs] = useState(
    initialTimeIncrementMs,
  );
  const [whiteTimeMs, setWhiteTimeMs] = useState(initialTimeInitialMs);
  const [blackTimeMs, setBlackTimeMs] = useState(initialTimeInitialMs);
  const [lastMoveAt, setLastMoveAt] = useState(0);
  const [displayWhiteTime, setDisplayWhiteTime] = useState(
    initialTimeInitialMs,
  );
  const [displayBlackTime, setDisplayBlackTime] = useState(
    initialTimeInitialMs,
  );
  const isTimed = timeInitialMs > 0;
  const flagSentRef = useRef(false);

  // Review mode: null = live, 0 = initial position, 1+ = after N moves
  const [reviewMoveIndex, setReviewMoveIndex] = useState<number | null>(null);
  const isReviewMode = reviewMoveIndex !== null;
  const canReview = moves.length > 0;

  // Sync local state with props on change (e.g. after router.refresh())
  useEffect(() => {
    setGameStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setGameResult(initialResult);
  }, [initialResult]);

  useEffect(() => {
    setFen(initialFen);
  }, [initialFen]);

  useEffect(() => {
    setMoves((prev) =>
      initialMoves.length > prev.length ? initialMoves : prev,
    );
  }, [initialMoves]);

  useEffect(() => {
    setShowJoinButton(canJoin);
  }, [canJoin]);

  const onSocketMessage = useCallback(
    (msg: GameSocketMessage) => {
      if (msg.type === "game_update") {
        router.refresh();
      } else if (msg.type === "move") {
        setFen(msg.fen);
        setLastMove({ from: msg.from, to: msg.to });
        setMoves((prev) => {
          const exists = prev.some(
            (m) => m.moveNumber === msg.moveNumber && m.notation === msg.san,
          );
          if (exists) {
            return prev.map((m) =>
              m.moveNumber === msg.moveNumber &&
              m.notation === msg.san &&
              !m.fen
                ? { ...m, fen: msg.fen }
                : m,
            );
          }
          return [
            ...prev,
            {
              moveNumber: msg.moveNumber,
              notation: msg.san,
              createdAt: msg.createdAt,
              fen: msg.fen,
            },
          ];
        });
        if (msg.whiteTimeMs !== undefined && msg.blackTimeMs !== undefined) {
          setWhiteTimeMs(msg.whiteTimeMs);
          setBlackTimeMs(msg.blackTimeMs);
          setLastMoveAt(Date.now());
          flagSentRef.current = false;
        }
        setPendingDrawOffer(null);
        if (msg.gameOver) {
          setGameStatus("FINISHED");
          setGameResult(msg.result);
        }
      } else if (msg.type === "error") {
        logger.gameBoard.error("Move error", { message: msg.message });
        router.refresh();
      } else if (msg.type === "resign") {
        setGameStatus("FINISHED");
        setGameResult(msg.result);
      } else if (msg.type === "draw_offer") {
        setPendingDrawOffer(msg.from);
      } else if (msg.type === "draw_accepted") {
        setGameStatus("FINISHED");
        setGameResult(msg.result);
        setPendingDrawOffer(null);
      } else if (msg.type === "draw_declined") {
        setPendingDrawOffer(null);
      } else if (msg.type === "connection_status") {
        setOpponentConnected(msg.opponentConnected);
      } else if (msg.type === "opponent_connected") {
        if (msg.color !== playerRole) {
          setOpponentConnected(true);
          setClaimDeadline(null);
          setClaimCountdown(null);
        }
      } else if (msg.type === "opponent_disconnected") {
        if (msg.color !== playerRole) {
          setOpponentConnected(false);
          if (msg.claimDeadline) {
            setClaimDeadline(msg.claimDeadline);
          }
        }
      } else if (msg.type === "spectator_count") {
        setSpectatorCount(msg.count);
      } else if (msg.type === "game_state") {
        setGameStatus(msg.status);
        setGameResult(msg.result);
        setFen(msg.fen);
        setMoves((prev) =>
          msg.moves.length > prev.length ? msg.moves : prev,
        );
        setLastMove(getLastMoveSquares(msg.moves));
        setPendingDrawOffer(msg.pendingDrawOffer);
        setPendingRematchOffer(msg.pendingRematchOffer);
        setSpectatorCount(msg.spectatorCount);
        if (msg.opponentConnected !== null) {
          setOpponentConnected(msg.opponentConnected);
        }
        if (msg.claimDeadline) {
          setClaimDeadline(msg.claimDeadline);
        } else {
          setClaimDeadline(null);
          setClaimCountdown(null);
        }
        if (msg.timeInitialMs !== undefined) {
          setTimeInitialMs(msg.timeInitialMs);
          setTimeIncrementMs(msg.timeIncrementMs ?? 0);
          setWhiteTimeMs(msg.whiteTimeMs ?? msg.timeInitialMs);
          setBlackTimeMs(msg.blackTimeMs ?? msg.timeInitialMs);
          setLastMoveAt(msg.lastMoveAt ?? 0);
          setDisplayWhiteTime(msg.whiteTimeMs ?? msg.timeInitialMs);
          setDisplayBlackTime(msg.blackTimeMs ?? msg.timeInitialMs);
          flagSentRef.current = false;
        }
      } else if (msg.type === "clock_sync") {
        setWhiteTimeMs(msg.whiteTimeMs);
        setBlackTimeMs(msg.blackTimeMs);
        setLastMoveAt(msg.lastMoveAt);
        setDisplayWhiteTime(msg.whiteTimeMs);
        setDisplayBlackTime(msg.blackTimeMs);
        flagSentRef.current = false;
      } else if (msg.type === "rematch_offer") {
        setPendingRematchOffer(msg.from);
      } else if (msg.type === "rematch_accepted") {
        if (msg.token) {
          fetch(`/api/games/${msg.newGameId}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: msg.token }),
          }).then(() => {
            router.push(`/game/${msg.newGameId}`);
          });
        } else {
          router.push(`/game/${msg.newGameId}`);
        }
      } else if (msg.type === "flag") {
        setGameStatus("FINISHED");
        setGameResult(msg.result);
        setWhiteTimeMs(msg.whiteTimeMs);
        setBlackTimeMs(msg.blackTimeMs);
        setDisplayWhiteTime(msg.whiteTimeMs);
        setDisplayBlackTime(msg.blackTimeMs);
      } else if (msg.type === "game_abandoned") {
        setGameStatus("ABANDONED");
        setGameResult(msg.result);
        setClaimDeadline(null);
        setClaimCountdown(null);
      } else if (msg.type === "draw_cancelled") {
        setPendingDrawOffer(null);
      } else if (msg.type === "rematch_cancelled") {
        setPendingRematchOffer(null);
      }
    },
    [router, playerRole],
  );

  const {
    sendMove,
    sendResign,
    sendDrawOffer,
    sendDrawAccept,
    sendDrawDecline,
    sendDrawCancel,
    sendRematchOffer,
    sendRematchAccept,
    sendRematchCancel,
    sendFlag,
    sendClaimWin,
    isConnected,
    isConnecting,
    reconnect,
  } = useGameSocket(gameId, onSocketMessage, { enabled: !isArchived });

  useEffect(() => {
    return () => {
      if (copyTimeoutId) clearTimeout(copyTimeoutId);
    };
  }, [copyTimeoutId]);

  useEffect(() => {
    return () => {
      if (resignTimeoutRef.current) clearTimeout(resignTimeoutRef.current);
    };
  }, []);

  async function joinGame() {
    setJoining(true);
    try {
      const res = await fetch(`/api/games/${gameId}/join`, { method: "POST" });
      const data = await res.json();
      if (data.role === "white" || data.role === "black") {
        reconnect();
        router.refresh();
      } else {
        setShowJoinButton(false);
        router.refresh();
      }
    } catch {
      setJoining(false);
    }
  }

  async function copyLink() {
    const success = await copyToClipboard(window.location.href);
    if (success) {
      if (copyTimeoutId) clearTimeout(copyTimeoutId);
      setCopied(true);
      setCopyTimeoutId(setTimeout(() => setCopied(false), 2000));
    }
  }

  async function prefetchPgn() {
    if (pgnContent) return;
    const res = await fetch(`/api/games/${gameId}/pgn`);
    const text = await res.text();
    setPgnContent(text);
  }

  async function showPgn() {
    if (!pgnContent) await prefetchPgn();
    setPgnModalOpen(true);
  }

  // Compute display FEN based on review mode
  const displayFen = useMemo(() => {
    if (!isReviewMode || reviewMoveIndex === null) return fen;
    if (reviewMoveIndex === 0) return INITIAL_FEN;

    const moveIndex = reviewMoveIndex - 1;
    if (moveIndex >= 0 && moveIndex < moves.length) {
      const move = moves[moveIndex];
      if (move.fen) return move.fen;
    }

    // Fallback: replay moves if FEN not cached
    const chess = new Chess();
    for (let i = 0; i < reviewMoveIndex && i < moves.length; i++) {
      try {
        chess.move(moves[i].notation);
      } catch {
        break;
      }
    }
    return chess.fen();
  }, [isReviewMode, reviewMoveIndex, moves, fen]);

  // Review navigation
  const goToStart = useCallback(() => {
    if (canReview) setReviewMoveIndex(0);
  }, [canReview]);

  const goToPrevMove = useCallback(() => {
    if (!canReview) return;
    setReviewMoveIndex((prev) => {
      if (prev === null) return moves.length - 1;
      if (prev === 0) return 0;
      return prev - 1;
    });
  }, [canReview, moves.length]);

  const goToNextMove = useCallback(() => {
    if (!canReview) return;
    setReviewMoveIndex((prev) => {
      if (prev === null) return 1;
      if (prev >= moves.length) return null;
      return prev + 1;
    });
  }, [canReview, moves.length]);

  const goToEnd = useCallback(() => {
    if (canReview) setReviewMoveIndex(null);
  }, [canReview]);

  const goToMove = useCallback(
    (moveIndex: number) => {
      if (canReview && moveIndex >= 0 && moveIndex < moves.length) {
        setReviewMoveIndex(moveIndex + 1);
      }
    },
    [canReview, moves.length],
  );

  // Keyboard navigation for move review
  useEffect(() => {
    if (!canReview || moves.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goToPrevMove();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNextMove();
          break;
        case "Home":
          e.preventDefault();
          goToStart();
          break;
        case "End":
          e.preventDefault();
          goToEnd();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canReview, moves.length, goToPrevMove, goToNextMove, goToStart, goToEnd]);

  // Clock countdown
  useEffect(() => {
    if (!isTimed || gameStatus !== "IN_PROGRESS" || lastMoveAt === 0) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastMoveAt;
      const turn = getTurnFromFen(fen);

      if (turn === "white") {
        const remaining = Math.max(0, whiteTimeMs - elapsed);
        setDisplayWhiteTime(remaining);
        setDisplayBlackTime(blackTimeMs);
        if (
          remaining <= 0 &&
          !flagSentRef.current &&
          playerRole !== "spectator"
        ) {
          flagSentRef.current = true;
          sendFlag();
        }
      } else {
        const remaining = Math.max(0, blackTimeMs - elapsed);
        setDisplayBlackTime(remaining);
        setDisplayWhiteTime(whiteTimeMs);
        if (
          remaining <= 0 &&
          !flagSentRef.current &&
          playerRole !== "spectator"
        ) {
          flagSentRef.current = true;
          sendFlag();
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    isTimed,
    gameStatus,
    lastMoveAt,
    whiteTimeMs,
    blackTimeMs,
    fen,
    playerRole,
    sendFlag,
  ]);

  // Reset flag when game ends
  useEffect(() => {
    if (gameStatus !== "IN_PROGRESS") {
      flagSentRef.current = false;
    }
  }, [gameStatus]);

  // Claim-win countdown
  useEffect(() => {
    if (claimDeadline === null) {
      setClaimCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = Math.ceil((claimDeadline - Date.now()) / 1000);
      setClaimCountdown(Math.max(0, remaining));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [claimDeadline]);

  // Highlighted squares
  const reviewLastMove = useMemo(() => {
    if (!isReviewMode || reviewMoveIndex === null || reviewMoveIndex === 0)
      return null;
    return getLastMoveSquares(moves.slice(0, reviewMoveIndex));
  }, [isReviewMode, reviewMoveIndex, moves]);

  const activeLastMove = isReviewMode ? reviewLastMove : lastMove;
  const squareStyles = useMemo(() => {
    if (!activeLastMove) return {};
    return {
      [activeLastMove.from]: highlightStyle(activeLastMove.from),
      [activeLastMove.to]: highlightStyle(activeLastMove.to),
    };
  }, [activeLastMove]);

  const boardFen = isReviewMode ? displayFen : fen;
  const boardOrientation = playerRole === "black" ? "black" : "white";
  const movePairs = formatMoves(moves);
  const currentTurn = getTurnFromFen(fen);
  const isPlayerTurn =
    gameStatus === "IN_PROGRESS" &&
    ((playerRole === "white" && currentTurn === "white") ||
      (playerRole === "black" && currentTurn === "black"));

  const canDragPiece = useCallback(
    ({ piece }: { piece: { pieceType: string } }) => {
      if (!isPlayerTurn) return false;
      return getPieceColor(piece.pieceType) === playerRole;
    },
    [isPlayerTurn, playerRole],
  );

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      piece: { pieceType: string };
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!targetSquare) return false;

      const chess = new Chess(fen);
      let moveResult;
      try {
        moveResult = chess.move({ from: sourceSquare, to: targetSquare });
      } catch {
        try {
          moveResult = chess.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
        } catch {
          return false;
        }
      }

      if (!moveResult) return false;

      sendMove(sourceSquare, targetSquare, moveResult.promotion);

      // Optimistic update
      const newFen = chess.fen();
      setFen(newFen);
      setLastMove({ from: sourceSquare, to: targetSquare });
      setMoves((prev) => [
        ...prev,
        {
          moveNumber: prev.length + 1,
          notation: moveResult.san,
          createdAt: Date.now(),
          fen: newFen,
        },
      ]);

      return true;
    },
    [fen, sendMove],
  );

  return (
    <div
      className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-8"
      data-ws-connected={isConnected ? "true" : "false"}
    >
      <div className="w-[min(90vw,560px)]">
        {isTimed && (
          <div className="mb-2 flex justify-end">
            <ChessClock
              timeMs={
                boardOrientation === "white"
                  ? displayBlackTime
                  : displayWhiteTime
              }
              isActive={
                gameStatus === "IN_PROGRESS" &&
                (boardOrientation === "white"
                  ? currentTurn === "black"
                  : currentTurn === "white")
              }
              isPlayerClock={false}
            />
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-border shadow-lg shadow-black/20">
          <Chessboard
            options={{
              position: boardFen,
              boardOrientation: boardOrientation,
              allowDragging: isPlayerTurn && !isReviewMode,
              canDragPiece: canDragPiece,
              onPieceDrop: onPieceDrop,
              squareStyles: squareStyles,
              darkSquareStyle: { backgroundColor: "#7B6F4E" },
              lightSquareStyle: { backgroundColor: "#E8DCC8" },
            }}
          />
        </div>
        {isTimed && (
          <div className="mt-2 flex justify-end">
            <ChessClock
              timeMs={
                boardOrientation === "white"
                  ? displayWhiteTime
                  : displayBlackTime
              }
              isActive={
                gameStatus === "IN_PROGRESS" &&
                (boardOrientation === "white"
                  ? currentTurn === "white"
                  : currentTurn === "black")
              }
              isPlayerClock={true}
            />
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-4 lg:w-64">
        {/* Connection status */}
        {!isArchived && (
          <div className="flex justify-end">
            <ConnectionIndicator
              isConnected={isConnected}
              isConnecting={isConnecting}
            />
          </div>
        )}

        {/* Waiting: show copy link for white */}
        {gameStatus === "WAITING" && playerRole === "white" && (
          <Card className="p-4 text-center">
            <p className="mb-3 text-sm text-secondary-foreground">
              Waiting for opponent...
            </p>
            <Button onClick={copyLink} className="active:scale-[0.98]">
              {copied ? "Copied!" : "Copy invite link"}
            </Button>
          </Card>
        )}

        {/* Waiting: show join button for visitors */}
        {gameStatus === "WAITING" && showJoinButton && (
          <Card className="p-4 text-center">
            <p className="mb-3 text-sm text-secondary-foreground">
              Game is waiting for an opponent
            </p>
            <Button
              onClick={joinGame}
              disabled={joining}
              className="active:scale-[0.98]"
            >
              {joining ? "Joining..." : "Join game"}
            </Button>
          </Card>
        )}

        {/* In progress */}
        {gameStatus === "IN_PROGRESS" && (
          <Card className="p-4 text-center">
            <p className="text-sm text-secondary-foreground">
              {playerRole === "spectator"
                ? "Spectating"
                : `You are playing as ${playerRole}`}
              {isTimed && (
                <span className="ml-2 text-muted-foreground">
                  ({formatTimeControl(timeInitialMs, timeIncrementMs)})
                </span>
              )}
            </p>
            {playerRole !== "spectator" && opponentConnected === false && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-center gap-2 rounded border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"></span>
                  Opponent disconnected
                  {claimCountdown !== null && claimCountdown > 0 && (
                    <span>({claimCountdown}s)</span>
                  )}
                </div>
                {claimCountdown !== null && claimCountdown <= 0 && (
                  <div className="flex justify-center">
                    <Button
                      onClick={sendClaimWin}
                      size="sm"
                      className="active:scale-[0.98]"
                    >
                      Claim Win
                    </Button>
                  </div>
                )}
              </div>
            )}
            {playerRole !== "spectator" && (
              <div className="mt-3 flex justify-center gap-2">
                <Button
                  onClick={() => {
                    if (resignConfirming) {
                      if (resignTimeoutRef.current)
                        clearTimeout(resignTimeoutRef.current);
                      setResignConfirming(false);
                      sendResign();
                    } else {
                      setResignConfirming(true);
                      resignTimeoutRef.current = setTimeout(
                        () => setResignConfirming(false),
                        5000,
                      );
                    }
                  }}
                  variant="destructive"
                  size="sm"
                  className="active:scale-[0.98]"
                >
                  {resignConfirming ? "Are you sure?" : "Resign"}
                </Button>
                {pendingDrawOffer === playerRole ? (
                  <Button
                    onClick={sendDrawCancel}
                    variant="outline"
                    size="sm"
                    className="border-primary/30 text-primary active:scale-[0.98]"
                  >
                    Cancel draw
                  </Button>
                ) : (
                  <Button
                    onClick={sendDrawOffer}
                    variant="secondary"
                    size="sm"
                    className="active:scale-[0.98]"
                  >
                    Offer draw
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Incoming draw offer */}
        {gameStatus === "IN_PROGRESS" &&
          pendingDrawOffer &&
          pendingDrawOffer !== playerRole &&
          playerRole !== "spectator" && (
            <Card className="border-primary/30 bg-primary/5 p-4 text-center">
              <p className="mb-3 text-sm text-primary">
                Your opponent offers a draw
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  onClick={sendDrawAccept}
                  size="sm"
                  className="active:scale-[0.98]"
                >
                  Accept
                </Button>
                <Button
                  onClick={sendDrawDecline}
                  variant="secondary"
                  size="sm"
                  className="active:scale-[0.98]"
                >
                  Decline
                </Button>
              </div>
            </Card>
          )}

        {/* Game over */}
        {(gameStatus === "FINISHED" || gameStatus === "ABANDONED") && (
          <Card className="p-4 text-center">
            <p className="text-sm font-medium text-foreground">Game over</p>
            {gameResult && (
              <p className="mt-1 text-sm text-secondary-foreground">
                {formatResult(gameResult as GameResult)}
              </p>
            )}
            {gameStatus === "FINISHED" && playerRole !== "spectator" && (
              <div className="mt-3">
                {!pendingRematchOffer && (
                  <Button
                    type="button"
                    onClick={sendRematchOffer}
                    className="active:scale-[0.98]"
                  >
                    Rematch
                  </Button>
                )}

                {pendingRematchOffer === playerRole && (
                  <div className="space-y-2">
                    <p className="text-sm text-secondary-foreground">
                      Rematch offered
                    </p>
                    <Button
                      type="button"
                      onClick={sendRematchCancel}
                      variant="outline"
                      size="sm"
                      className="border-primary/30 text-primary active:scale-[0.98]"
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {pendingRematchOffer &&
                  pendingRematchOffer !== playerRole && (
                    <div className="space-y-2">
                      <p className="text-sm text-secondary-foreground">
                        Opponent wants a rematch
                      </p>
                      <Button
                        type="button"
                        onClick={sendRematchAccept}
                        size="sm"
                        className="active:scale-[0.98]"
                      >
                        Accept
                      </Button>
                    </div>
                  )}
              </div>
            )}
          </Card>
        )}

        {/* Move history */}
        <Card className="p-4">
          <h3 className="font-display mb-2 text-sm font-medium text-muted-foreground">
            Moves
          </h3>
          <PaginatedMoveList
            movePairs={movePairs}
            canReview={canReview}
            isReviewMode={isReviewMode}
            reviewMoveIndex={reviewMoveIndex}
            onMoveClick={goToMove}
          />

          {canReview && moves.length > 0 && (
            <div
              className="mt-3 flex items-center justify-center gap-1 border-t border-border pt-3"
              role="group"
              aria-label="Move navigation controls. Use arrow keys to navigate, Home/End to jump to start/end."
            >
              <Button
                type="button"
                onClick={goToStart}
                variant="ghost"
                size="icon"
                className="h-8 w-8 focus:ring-primary"
                title="Go to start (Home)"
                aria-label="Go to start position"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="19 20 9 12 19 4 19 20"></polygon>
                  <line x1="5" y1="19" x2="5" y2="5"></line>
                </svg>
              </Button>
              <Button
                type="button"
                onClick={goToPrevMove}
                variant="ghost"
                size="icon"
                className="h-8 w-8 focus:ring-primary"
                title="Previous move (←)"
                aria-label="Go to previous move"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="19 20 9 12 19 4 19 20"></polygon>
                </svg>
              </Button>
              <span
                className="mx-2 min-w-[3rem] text-center text-xs text-muted-foreground"
                aria-live="polite"
                aria-atomic="true"
              >
                {reviewMoveIndex === null
                  ? "Live"
                  : reviewMoveIndex === 0
                    ? "Start"
                    : `${reviewMoveIndex}/${moves.length}`}
              </span>
              <Button
                type="button"
                onClick={goToNextMove}
                variant="ghost"
                size="icon"
                className="h-8 w-8 focus:ring-primary"
                title="Next move (→)"
                aria-label="Go to next move"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="5 4 15 12 5 20 5 4"></polygon>
                </svg>
              </Button>
              <Button
                type="button"
                onClick={goToEnd}
                variant="ghost"
                size="icon"
                className="h-8 w-8 focus:ring-primary"
                title="Go to end (End)"
                aria-label="Go to final position"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="5 4 15 12 5 20 5 4"></polygon>
                  <line x1="19" y1="5" x2="19" y2="19"></line>
                </svg>
              </Button>
            </div>
          )}

          {(gameStatus === "FINISHED" || gameStatus === "ABANDONED") && (
            <button
              onMouseEnter={prefetchPgn}
              onClick={showPgn}
              className="mt-3 block w-full cursor-pointer text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View PGN
            </button>
          )}
        </Card>

        {/* Spectator count */}
        {!isArchived && spectatorCount > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {spectatorCount}{" "}
            {spectatorCount === 1 ? "spectator" : "spectators"} watching
          </p>
        )}
      </div>

      {/* PGN Modal */}
      <Dialog open={pgnModalOpen} onOpenChange={setPgnModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>PGN</DialogTitle>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-secondary p-3 text-xs text-secondary-foreground">
            {pgnContent}
          </pre>
          <Button
            onClick={() => {
              if (pgnContent) navigator.clipboard.writeText(pgnContent);
            }}
            variant="secondary"
            className="w-full active:scale-[0.98]"
          >
            Copy to clipboard
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
