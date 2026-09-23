// Metrics carousel: horizontal scroll that loops endlessly in both directions.
(function () {
  const track = document.querySelector('.metrics-track');
  const pager = document.querySelector('.pager');
  if (!track) return;

  const originals = Array.from(track.children);
  const count = originals.length;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Put a full copy of the cards on each side so there is always something to scroll into.
  const clone = (card) => {
    const copy = card.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    return copy;
  };
  originals.forEach((card) => track.append(clone(card)));
  originals.slice().reverse().forEach((card) => track.prepend(clone(card)));

  // One dot per metric.
  const dots = originals.map((_, i) => {
    const dot = document.createElement('span');
    dot.addEventListener('click', () => goTo(i));
    pager.append(dot);
    return dot;
  });

  const padding = () => parseFloat(getComputedStyle(track).paddingLeft);
  const step = () => originals[1].offsetLeft - originals[0].offsetLeft;
  const setWidth = () => step() * count;
  const startOf = (i) => originals[i].offsetLeft - (track.clientWidth - originals[i].offsetWidth) / 2;

  function jump(left) {
    track.style.scrollSnapType = 'none';
    track.scrollLeft = left;
    track.offsetHeight; // force layout so the jump lands before snapping is restored
    track.style.scrollSnapType = '';
  }

  // Once scrolling settles inside a copy, jump silently to the same card in the middle set.
  function recenter() {
    const start = startOf(0);
    const width = setWidth();
    let left = track.scrollLeft;
    while (left < start - step() / 2) left += width;
    while (left >= start + width - step() / 2) left -= width;
    if (Math.abs(left - track.scrollLeft) > 1) jump(left);
  }

  function currentIndex() {
    const i = Math.round((track.scrollLeft - startOf(0)) / step());
    return ((i % count) + count) % count;
  }

  function updateDots() {
    const active = currentIndex();
    dots.forEach((dot, i) => dot.classList.toggle('active', i === active));
    Array.from(track.children).forEach((card, i) => {
      card.classList.toggle('active', i % count === (active + count) % count);
    });
  }

  function goTo(i) {
    track.scrollTo({ left: startOf(i), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function move(direction) {
    track.scrollBy({ left: direction * step(), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  document.querySelector('.metrics-arrow.prev').addEventListener('click', () => move(-1));
  document.querySelector('.metrics-arrow.next').addEventListener('click', () => move(1));

  let settleTimer;
  track.addEventListener('scroll', () => {
    updateDots();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(recenter, 150);
  }, { passive: true });

  jump(startOf(0));
  updateDots();
  window.addEventListener('resize', () => { jump(startOf(currentIndex())); });
})();
