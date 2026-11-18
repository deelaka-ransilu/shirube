// Moves the black "current page" pill behind the top nav so it glides to the active tab.
// The router marks the active link with aria-current="page"; this only reads that attribute.

const nav = document.querySelector('.tabs');
const pill = nav?.querySelector('.nav-pill');

function place() {
  if (!nav || !pill) return;
  const current = nav.querySelector('a[aria-current="page"]');
  if (!current) {
    pill.style.opacity = '0';
    return;
  }
  pill.style.opacity = '1';
  pill.style.width = `${current.offsetWidth}px`;
  pill.style.transform = `translateX(${current.offsetLeft}px)`;
}

if (nav && pill) {
  // First placement has no transition; the glide starts after the first frame.
  place();
  requestAnimationFrame(() => pill.classList.add('ready'));
  new MutationObserver(place).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  window.addEventListener('resize', place);
  // The label opens with a transition, so measure again when it settles.
  nav.addEventListener('transitionend', place);
}
