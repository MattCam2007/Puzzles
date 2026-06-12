/* Preview carousel: swipe/drag between 2048, Sudoku and Kakuro slides. */

export function initPreviewCarousel() {
  const slidesEl = document.getElementById('tpSlides');
  const dotsEl = document.getElementById('tpDots');
  if (!slidesEl || !dotsEl) return;

  // Inject Sudoku and Kakuro slides
  slidesEl.appendChild(createSudokuSlide());
  slidesEl.appendChild(createKakuroSlide());

  const dots = [...dotsEl.querySelectorAll('.tp-dot')];
  let current = 0;
  const total = 3;
  let startX = 0;
  let dragDelta = 0;
  let dragging = false;

  function goTo(idx) {
    current = Math.max(0, Math.min(total - 1, idx));
    slidesEl.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
    slidesEl.style.transform = `translateX(${-current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function dragStart(x) {
    startX = x;
    dragDelta = 0;
    dragging = true;
  }

  function dragMove(x) {
    if (!dragging) return;
    dragDelta = x - startX;
    slidesEl.style.transition = 'none';
    slidesEl.style.transform = `translateX(calc(${-current * 100}% + ${dragDelta}px))`;
  }

  function dragEnd() {
    if (!dragging) return;
    dragging = false;
    if (dragDelta < -40) goTo(current + 1);
    else if (dragDelta > 40) goTo(current - 1);
    else goTo(current);
    dragDelta = 0;
  }

  // Touch events
  slidesEl.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientX), {
    passive: true,
  });
  slidesEl.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      dragMove(e.touches[0].clientX);
    },
    { passive: false },
  );
  slidesEl.addEventListener('touchend', dragEnd, { passive: true });

  // Mouse events (drag on desktop)
  slidesEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragStart(e.clientX);
  });
  window.addEventListener('mousemove', (e) => dragMove(e.clientX));
  window.addEventListener('mouseup', dragEnd);

  // Dot clicks
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
}

function createSudokuSlide() {
  // Classic "given" digits — empties are 0
  const PUZZLE = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];
  const SEL_R = 4;
  const SEL_C = 4; // highlighted cell

  const slide = document.createElement('div');
  slide.className = 'tp-slide tp-wrap';
  slide.innerHTML = `
    <div class="tp-header">
      <div class="tp-title">Sudoku</div>
      <div class="tp-scores">
        <div class="tp-score"><div class="tp-score-lbl">TIME</div><div class="tp-score-val">3:45</div></div>
      </div>
    </div>`;

  const grid = document.createElement('div');
  grid.className = 'tp-sudoku-grid';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'tp-sudoku-cell';
      if (c % 3 === 0 && c > 0) cell.classList.add('tp-box-left');
      if (r % 3 === 0 && r > 0) cell.classList.add('tp-box-top');
      if (PUZZLE[r][c]) {
        cell.textContent = PUZZLE[r][c];
        cell.classList.add('tp-given');
      }
      if (r === SEL_R && c === SEL_C) cell.classList.add('tp-selected');
      grid.appendChild(cell);
    }
  }
  slide.appendChild(grid);

  const numpad = document.createElement('div');
  numpad.className = 'tp-numpad';
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('div');
    btn.className = 'tp-numpad-btn';
    btn.textContent = n;
    numpad.appendChild(btn);
  }
  slide.appendChild(numpad);

  const texts = document.createElement('div');
  texts.className = 'tp-texts';
  texts.innerHTML = `
    <span class="tp-text-primary">Primary</span>
    <span class="tp-text-muted">Muted</span>
    <span class="tp-text-dim">Dim text</span>`;
  slide.appendChild(texts);

  return slide;
}

function createKakuroSlide() {
  // null = black, {d,a} = clue (d=down sum, a=across sum, 0 = not shown), {v} = answer cell
  const LAYOUT = [
    [null, null, { d: 14, a: 0 }, { d: 7, a: 0 }, null],
    [null, { d: 0, a: 16 }, { v: '9' }, { v: '7' }, null],
    [{ d: 7, a: 0 }, { d: 0, a: 7 }, { v: '4' }, { v: '3' }, null],
    [{ d: 0, a: 6 }, { v: '4' }, { v: '2' }, null, null],
  ];
  // grid columns = 5
  const COLS = 5;

  const slide = document.createElement('div');
  slide.className = 'tp-slide tp-wrap';
  slide.innerHTML = `
    <div class="tp-header">
      <div class="tp-title">Kakuro</div>
      <div class="tp-scores">
        <div class="tp-score"><div class="tp-score-lbl">LEFT</div><div class="tp-score-val">12</div></div>
      </div>
    </div>`;

  const grid = document.createElement('div');
  grid.className = 'tp-kakuro-grid';
  grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

  LAYOUT.forEach((row) => {
    row.forEach((cell) => {
      const el = document.createElement('div');
      el.className = 'tp-kakuro-cell';
      if (cell === null) {
        el.classList.add('tp-kakuro-black');
      } else if (cell.v !== undefined) {
        el.classList.add('tp-kakuro-answer');
        el.textContent = cell.v;
      } else {
        el.classList.add('tp-kakuro-clue');
        if (cell.d) {
          const dn = document.createElement('span');
          dn.className = 'tp-kakuro-num-down';
          dn.textContent = cell.d;
          el.appendChild(dn);
        }
        if (cell.a) {
          const ac = document.createElement('span');
          ac.className = 'tp-kakuro-num-across';
          ac.textContent = cell.a;
          el.appendChild(ac);
        }
      }
      grid.appendChild(el);
    });
  });

  slide.appendChild(grid);

  // Filler row so the slide height roughly matches 2048/Sudoku
  const filler = document.createElement('div');
  filler.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  filler.innerHTML = `
    <button class="tp-btn-accent" style="flex:1">New puzzle</button>
    <button class="tp-btn-ghost">Hint</button>`;
  slide.appendChild(filler);

  const texts = document.createElement('div');
  texts.className = 'tp-texts';
  texts.innerHTML = `
    <span class="tp-text-primary">Primary</span>
    <span class="tp-text-muted">Muted</span>
    <span class="tp-text-dim">Dim text</span>`;
  slide.appendChild(texts);

  return slide;
}
