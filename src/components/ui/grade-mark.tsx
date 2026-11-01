// A play's grade as the Review board draws it: a circle in the grade's colour
// with its own symbol, like chess.com's move marks (JAS-77). The replay's
// play list uses it now, and the Summary's board and grade legend can use the
// same one (JAS-107), so a grade looks the same everywhere.
//
// The analyzer grades into eight of these (GRADES in
// src/lib/analyzer/plays.ts). Best, Book and Miss are here so a legend can
// show the whole scale before the analyzer can award them.

export const MARK_GRADES = [
  "Brilliant",
  "Great",
  "Best",
  "Excellent",
  "Good",
  "Even",
  "Book",
  "Inaccuracy",
  "Mistake",
  "Miss",
  "Blunder",
] as const;

export type MarkGrade = (typeof MARK_GRADES)[number];

// The symbol's colour on the circle. In dark every grade colour is light
// enough for the page colour on top. In light most still are, so the symbol
// takes the text colour; Great, Miss and Blunder are dark there, so it turns
// white (the light panel). Each pair stays above 4:1 except Brilliant and Book
// in light, which are still above the 3:1 a symbol needs: the grade's name is
// always written beside the mark, so the symbol only repeats it.
// Fill for the characters, stroke for the drawn ones, both written out so
// Tailwind finds them.
type Ink = { fill: string; stroke: string };
const INK: Ink = { fill: "fill-page light:fill-main", stroke: "stroke-page light:stroke-main" };
const INK_ON_DARK: Ink = {
  fill: "fill-page light:fill-panel",
  stroke: "stroke-page light:stroke-panel",
};

type Look = {
  // The symbol as text: what the mark shows, and what a test can compare.
  symbol: string;
  // Tailwind classes for the circle and for a plain dot of the same colour.
  circle: string;
  dot: string;
  ink: Ink;
};

// Full class names written out, so Tailwind finds them in the source.
export const GRADE_LOOKS: Record<MarkGrade, Look> = {
  Brilliant: { symbol: "!!", circle: "fill-grade-brilliant", dot: "bg-grade-brilliant", ink: INK },
  Great: { symbol: "!", circle: "fill-grade-great", dot: "bg-grade-great", ink: INK_ON_DARK },
  Best: { symbol: "★", circle: "fill-grade-best", dot: "bg-grade-best", ink: INK },
  Excellent: { symbol: "✓", circle: "fill-grade-excellent", dot: "bg-grade-excellent", ink: INK },
  Good: { symbol: "+", circle: "fill-grade-good", dot: "bg-grade-good", ink: INK },
  Even: { symbol: "=", circle: "fill-grade-even", dot: "bg-grade-even", ink: INK },
  Book: { symbol: "≡", circle: "fill-grade-book", dot: "bg-grade-book", ink: INK },
  Inaccuracy: { symbol: "?!", circle: "fill-grade-inaccuracy", dot: "bg-grade-inaccuracy", ink: INK },
  Mistake: { symbol: "?", circle: "fill-grade-mistake", dot: "bg-grade-mistake", ink: INK },
  Miss: { symbol: "✕", circle: "fill-grade-miss", dot: "bg-grade-miss", ink: INK_ON_DARK },
  Blunder: { symbol: "??", circle: "fill-grade-blunder", dot: "bg-grade-blunder", ink: INK_ON_DARK },
};

// The star, tick, cross and three bars are drawn as lines, because Rubik has
// no such characters and the fallback font differs from one computer to the
// next. The rest are Rubik's own ! ? + =. Drawn in a 22 by 22 box.
function GradeSymbol({ grade, ink }: { grade: MarkGrade; ink: Ink }) {
  const line = {
    className: ink.stroke,
    fill: "none",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (grade) {
    case "Best":
      return (
        <path
          className={ink.fill}
          d="M11 5.2 L12.7 8.9 L16.6 9.3 L13.7 11.9 L14.5 15.8 L11 13.8 L7.5 15.8 L8.3 11.9 L5.4 9.3 L9.3 8.9 Z"
        />
      );
    case "Excellent":
      return <path {...line} d="M7 11.3 L9.8 14 L15 8.3" />;
    case "Book":
      return <path {...line} strokeWidth={1.7} d="M7.2 7.6 H14.8 M7.2 11 H14.8 M7.2 14.4 H14.8" />;
    case "Miss":
      return <path {...line} d="M7.8 7.8 L14.2 14.2 M14.2 7.8 L7.8 14.2" />;
    default: {
      const { symbol } = GRADE_LOOKS[grade];
      return (
        <text
          x="11"
          y="11.6"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={symbol.length > 1 ? 10.5 : 13}
          fontWeight={700}
          className={ink.fill}
        >
          {symbol}
        </text>
      );
    }
  }
}

// The mark itself, 22px by default. Hidden from screen readers: put the
// grade's name in words beside it.
export function GradeMark({
  grade,
  size = 22,
  className = "",
}: {
  grade: MarkGrade;
  size?: number;
  className?: string;
}) {
  const look = GRADE_LOOKS[grade];
  return (
    <svg
      viewBox="0 0 22 22"
      width={size}
      height={size}
      aria-hidden="true"
      data-grade={grade}
      className={`shrink-0 ${className}`}
    >
      <circle cx="11" cy="11" r="11" className={look.circle} />
      <GradeSymbol grade={grade} ink={look.ink} />
    </svg>
  );
}
