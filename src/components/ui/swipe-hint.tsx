// A one-line note under a chart that scrolls sideways on phones. The charts
// keep a readable size there instead of shrinking their labels, so only the
// first minutes fit on screen, and phones hide scrollbars: without this note
// nothing says the rest of the game is there. Hidden once the chart fits.
export function SwipeHint() {
  return (
    <p className="text-note text-faint md:hidden">
      Swipe the chart sideways to see the whole game →
    </p>
  );
}
