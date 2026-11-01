"use client";

import { useState, type ReactNode } from "react";
import { startingPlay } from "@/lib/board";
import { Board, type BoardProps } from "./board";
import { GameReview, type GameReviewProps } from "./game-review";

// The Summary's two columns (layout A from JAS-89). This is the nearest parent
// of the board and Game review, so it holds the selected play both of them
// show: pick a play in either one and the other follows.
//
// On wide screens the board and `children` stack on the left, with Game review
// beside them. On phones it's one column, with Game review right under the
// board, so its plays stay close to the strip they move. That takes three grid
// items rather than two columns, and the 1fr row keeps a tall Game review from
// opening a gap under the board. A game with no scores and no win chance has no
// Game review, so it gets one column rather than a blank one.
export function SummaryColumns({
  board,
  review,
  children,
}: {
  board: Omit<BoardProps, "selected" | "onSelect">;
  review: Pick<GameReviewProps, "scores" | "notes">;
  children: ReactNode;
}) {
  const plays = board.chances?.plays ?? null;
  const [selected, setSelected] = useState(() => startingPlay(plays ?? []));
  const hasReview = review.scores.length > 0 || plays !== null;

  return (
    <div
      className={`grid items-start gap-x-6 gap-y-3.5 ${
        hasReview ? "lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr]" : ""
      }`}
    >
      <div className="min-w-0 lg:col-start-1">
        <Board {...board} selected={selected} onSelect={setSelected} />
      </div>
      {hasReview && (
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">
          <GameReview {...review} plays={plays} selected={selected} onSelect={setSelected} />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-3.5 lg:col-start-1">{children}</div>
    </div>
  );
}
