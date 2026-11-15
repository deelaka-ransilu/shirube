// Keeps the floating bottom navigation from covering the last rows of a list.
// On the one-screen pages the cards run down behind the dock and fade out. A list that ends down there
// gets "under-dock", which adds space at the end of the list so its last row can scroll clear of the dock.
// On pages that scroll as a whole the page keeps its own space at the end, so nothing is marked there.
export function watchDock(page) {
  let queued = false;

  function mark() {
    queued = false;
    const oneScreen = getComputedStyle(page).overflowY === 'hidden';
    page.classList.toggle('dock-flush', oneScreen);
    const dockTop = window.innerHeight - 100; // the dock starts about 80px above the window bottom
    for (const box of page.querySelectorAll('.scroll-wrap, .found-detail')) {
      box.classList.toggle('under-dock', oneScreen && box.getBoundingClientRect().bottom > dockTop);
    }
  }

  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(mark);
  };

  // Pages redraw their whole content, so look again after every change and when the window size changes.
  new MutationObserver(queue).observe(page, { childList: true, subtree: true });
  window.addEventListener('resize', queue);
  queue();
}
