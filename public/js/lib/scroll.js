// A scroll box with no scrollbar: a soft fade (and, for lists, a "N more" pill) says there is more below.
// wrap = element with class "scroll-wrap" holding a ".scroller" (and optionally a ".more-pill").
// rowSelector = what to count as one item for the pill.
// Call it on nodes that are recreated on every redraw, so listeners go away with the old nodes.
export function bindScroll(wrap, rowSelector = '.found-item') {
  const box = wrap?.querySelector('.scroller');
  if (!box) return;
  const pill = wrap.querySelector('.more-pill');
  const update = () => {
    const more = box.scrollHeight - box.scrollTop - box.clientHeight > 4;
    wrap.classList.toggle('has-more', more);
    if (!pill) return;
    let n = 0;
    if (more) for (const row of box.querySelectorAll(rowSelector)) if (row.offsetTop - box.scrollTop >= box.clientHeight - 8) n++;
    pill.hidden = !more || n === 0;
    pill.textContent = `▾ ${n} more`;
  };
  box.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(box);
  update();
}
