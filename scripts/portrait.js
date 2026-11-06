/*
  Folding paper portrait.

  The hero photo is cut into a low-poly mesh of triangles and drawn on a canvas.
  Each triangle is lit by its angle, so the sheet reads as creased paper. The
  sheet crumples towards a ball as the "fold" amount goes from 0 to 1.

  What drives the fold:
  - scrolling down through the hero
  - pressing and holding the portrait
  - hand control (optional): a fist folds it, an open hand unfolds it.
    Hand tracking runs in the browser with MediaPipe; video never leaves the device.
*/
(() => {
  const figure = document.querySelector(".hero-figure");
  const img = figure && figure.querySelector("img");
  const hero = document.querySelector(".hero");
  if (!figure || !img || !hero) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  canvas.className = "portrait-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", img.alt);

  /* ---------- Mesh ---------- */

  const COLS = 9;
  const ROWS = 11;
  const SHEET_ASPECT = 5 / 4; // height / width, matches the CSS aspect ratio
  const INSET = 0.05; // room around the sheet so tilting never clips it

  // Small seeded random so the facets look the same on every visit.
  let seed = 20180101;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const CENTER_X = 0.5;
  const CENTER_Y = 0.42; // crumple towards the face, not the middle of the sheet

  const verts = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const edgeX = c === 0 || c === COLS;
      const edgeY = r === 0 || r === ROWS;
      let x = c / COLS;
      let y = r / ROWS;
      // Jitter points so the facets look hand-cut, but keep the outline straight.
      if (!edgeX) x += (rand() - 0.5) * 0.7 / COLS;
      if (!edgeY) y += (rand() - 0.5) * 0.7 / ROWS;

      const dx = x - CENTER_X;
      const dy = y - CENTER_Y;
      const squeeze = 0.34 + rand() * 0.08;
      verts.push({
        x,
        y,
        relief: rand() * 2 - 1, // gentle creases while the sheet is flat
        cx: CENTER_X + dx * squeeze + (rand() - 0.5) * 0.035,
        cy: CENTER_Y + dy * squeeze + (rand() - 0.5) * 0.035,
        cz: (rand() - 0.5) * 0.28,
        // Edges start folding before the middle does.
        lag: 1 - Math.min(1, Math.hypot(dx, dy * SHEET_ASPECT) / 0.75),
        sx: 0,
        sy: 0,
        X: 0,
        Y: 0,
        Z: 0,
      });
    }
  }

  const tris = [];
  const at = (r, c) => r * (COLS + 1) + c;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = at(r, c);
      const b = at(r, c + 1);
      const d = at(r + 1, c);
      const e = at(r + 1, c + 1);
      if (rand() < 0.5) tris.push([a, b, e], [a, e, d]);
      else tris.push([a, b, d], [b, e, d]);
    }
  }
  const order = tris.map((_, i) => i);
  const depth = new Float32Array(tris.length);

  /* ---------- Texture: the photo cropped to 4:5 and mirrored ---------- */

  let texture = null;
  let W = 0; // canvas size in device pixels
  let H = 0;
  let sheetW = 0;
  let sheetH = 0;
  let originX = 0;
  let originY = 0;

  function buildTexture() {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw) return false;
    const cropH = Math.min(nh, nw * SHEET_ASPECT);
    const cropY = (nh - cropH) * 0.2;
    texture = document.createElement("canvas");
    texture.width = Math.round(sheetW);
    texture.height = Math.round(sheetH);
    const t = texture.getContext("2d");
    // Mirrored so the portrait faces the headline.
    t.translate(texture.width, 0);
    t.scale(-1, 1);
    t.drawImage(img, 0, cropY, nw, cropH, 0, 0, texture.width, texture.height);
    return true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    if (!w) return false;
    W = Math.round(w * dpr);
    H = Math.round(w * SHEET_ASPECT * dpr);
    canvas.width = W;
    canvas.height = H;
    sheetW = W * (1 - INSET * 2);
    sheetH = H * (1 - INSET * 2);
    originX = W * INSET;
    originY = H * INSET;
    return buildTexture();
  }

  /* ---------- Rendering ---------- */

  const light = (() => {
    const l = [-0.45, -0.65, 0.95];
    const n = Math.hypot(...l);
    return l.map((v) => v / n);
  })();
  const flatShade = light[2];
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  function render(fold, tiltX, tiltY) {
    if (!texture) return;
    const focal = sheetW * 2.4;
    const midX = originX + sheetW / 2;
    const midY = originY + sheetH * CENTER_Y;
    const turnY = tiltX * 0.16 + fold * 0.35;
    const turnX = -tiltY * 0.12 + fold * 0.12;
    const cosY = Math.cos(turnY);
    const sinY = Math.sin(turnY);
    const cosX = Math.cos(turnX);
    const sinX = Math.sin(turnX);

    for (const v of verts) {
      const t = smooth(clamp01(fold * 1.7 - v.lag * 0.7));
      const x = (v.x + (v.cx - v.x) * t) * sheetW + originX - midX;
      const y = (v.y + (v.cy - v.y) * t) * sheetH + originY - midY;
      const z = (v.relief * 0.007 * (1 - t) + v.cz * t) * sheetW;
      // Turn around the vertical axis, then the horizontal one.
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const y1 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;
      const k = focal / (focal - z2);
      v.X = x1;
      v.Y = y1;
      v.Z = z2;
      v.sx = midX + x1 * k;
      v.sy = midY + y1 * k;
    }

    // Painter's order: farthest triangles first.
    for (let i = 0; i < tris.length; i++) {
      const [a, b, c] = tris[i];
      depth[i] = verts[a].Z + verts[b].Z + verts[c].Z;
    }
    order.sort((i, j) => depth[i] - depth[j]);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, W / 900);

    for (const i of order) drawTriangle(tris[i]);
  }

  function drawTriangle([ia, ib, ic]) {
    const a = verts[ia];
    const b = verts[ib];
    const c = verts[ic];

    // Facing: a mesh triangle wound the other way on screen shows its back.
    const area = (b.sx - a.sx) * (c.sy - a.sy) - (b.sy - a.sy) * (c.sx - a.sx);
    if (Math.abs(area) < 0.5) return;
    const back = area < 0;

    // Light from the triangle's real angle in 3D.
    const ux = b.X - a.X, uy = b.Y - a.Y, uz = b.Z - a.Z;
    const vx = c.X - a.X, vy = c.Y - a.Y, vz = c.Z - a.Z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const shade = nx * light[0] + ny * light[1] + nz * light[2] - flatShade;

    // Grow the clip by a hair so neighbouring triangles leave no seams.
    const mx = (a.sx + b.sx + c.sx) / 3;
    const my = (a.sy + b.sy + c.sy) / 3;
    const grow = (p) => {
      const dx = p.sx - mx;
      const dy = p.sy - my;
      const d = Math.hypot(dx, dy) || 1;
      return [p.sx + (dx / d) * 0.7, p.sy + (dy / d) * 0.7];
    };
    const [ax, ay] = grow(a);
    const [bx, by] = grow(b);
    const [cx, cy] = grow(c);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.clip();

    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);

    if (back) {
      // The back of the paper: plain, warm and darker.
      ctx.fillStyle = "#2b211c";
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    } else {
      // Map the triangle's place on the flat photo onto its place on screen.
      const s0x = a.x * sheetW, s0y = a.y * sheetH;
      const s1x = b.x * sheetW, s1y = b.y * sheetH;
      const s2x = c.x * sheetW, s2y = c.y * sheetH;
      const d0x = a.sx, d0y = a.sy;
      const den = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y);
      if (den) {
        const m11 = ((b.sx - d0x) * (s2y - s0y) - (c.sx - d0x) * (s1y - s0y)) / den;
        const m12 = ((b.sy - d0y) * (s2y - s0y) - (c.sy - d0y) * (s1y - s0y)) / den;
        const m21 = ((c.sx - d0x) * (s1x - s0x) - (b.sx - d0x) * (s2x - s0x)) / den;
        const m22 = ((c.sy - d0y) * (s1x - s0x) - (b.sy - d0y) * (s2x - s0x)) / den;
        ctx.setTransform(m11, m12, m21, m22, d0x - m11 * s0x - m21 * s0y, d0y - m12 * s0x - m22 * s0y);
        // Only copy the part of the photo under this triangle.
        const pad = 2;
        const sx = Math.max(0, Math.min(s0x, s1x, s2x) - pad);
        const sy = Math.max(0, Math.min(s0y, s1y, s2y) - pad);
        const sw = Math.min(texture.width, Math.max(s0x, s1x, s2x) + pad) - sx;
        const sh = Math.min(texture.height, Math.max(s0y, s1y, s2y) + pad) - sy;
        if (sw > 0 && sh > 0) ctx.drawImage(texture, sx, sy, sw, sh, sx, sy, sw, sh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }

    // Facet light and shadow.
    const amount = Math.min(0.5, Math.abs(shade) * 1.3 + (back ? 0.05 : 0));
    if (amount > 0.01) {
      ctx.fillStyle = shade > 0 ? `rgba(255,236,220,${amount * 0.35})` : `rgba(10,6,4,${amount})`;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }
    ctx.restore();

    // A faint crease along each edge.
    ctx.strokeStyle = shade > 0 ? "rgba(255,240,225,0.04)" : "rgba(0,0,0,0.1)";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.closePath();
    ctx.stroke();
  }

  /* ---------- State and input ---------- */

  const state = {
    fold: 0, foldTarget: 0,
    tiltX: 0, tiltY: 0, tiltXTarget: 0, tiltYTarget: 0,
    held: false,
    hand: false, // hand control is driving the fold
    drawn: null,
    visible: true,
  };

  function scrollFold() {
    if (reduceMotion) return 0;
    const top = hero.getBoundingClientRect().top;
    return clamp01(-top / (hero.offsetHeight * 0.6));
  }

  function tick() {
    if (!state.hand) state.foldTarget = state.held ? 1 : scrollFold();
    const ease = reduceMotion ? 1 : 0.12;
    state.fold += (state.foldTarget - state.fold) * (reduceMotion ? 1 : 0.06);
    state.tiltX += (state.tiltXTarget - state.tiltX) * ease;
    state.tiltY += (state.tiltYTarget - state.tiltY) * ease;

    const key = `${state.fold.toFixed(3)}|${state.tiltX.toFixed(3)}|${state.tiltY.toFixed(3)}`;
    if (key !== state.drawn) {
      render(state.fold, state.tiltX, state.tiltY);
      state.drawn = key;
    }
    if (state.visible) requestAnimationFrame(tick);
    else looping = false;
  }

  // One animation loop at a time.
  let looping = false;
  function wake() {
    if (looping) return;
    looping = true;
    requestAnimationFrame(tick);
  }

  function start() {
    // The canvas has to be on the page before it can be measured.
    figure.insertBefore(canvas, img);
    figure.classList.add("is-live");
    if (!resize()) {
      canvas.remove();
      figure.classList.remove("is-live");
      return;
    }
    state.drawn = null;
    wake();

    new ResizeObserver(() => {
      if (resize()) {
        state.drawn = null;
        if (!state.visible) render(state.fold, state.tiltX, state.tiltY);
      }
    }).observe(figure);

    // Rest while the hero is off screen.
    new IntersectionObserver(([entry]) => {
      const was = state.visible;
      state.visible = entry.isIntersecting || state.hand;
      if (state.visible && !was) wake();
    }).observe(hero);

    if (finePointer && !reduceMotion) {
      hero.addEventListener("pointermove", (e) => {
        if (state.hand) return;
        state.tiltXTarget = (e.clientX / innerWidth) * 2 - 1;
        state.tiltYTarget = (e.clientY / innerHeight) * 2 - 1;
      });
      hero.addEventListener("pointerleave", () => {
        if (state.hand) return;
        state.tiltXTarget = 0;
        state.tiltYTarget = 0;
      });
    }

    canvas.addEventListener("pointerdown", () => { state.held = true; });
    addEventListener("pointerup", () => { state.held = false; });
    addEventListener("pointercancel", () => { state.held = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    setUpHandControl();
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener("load", start, { once: true });

  /* ---------- Hand control ---------- */

  function setUpHandControl() {
    const ui = document.querySelector(".hand-ui");
    const dialog = document.querySelector(".hand-consent");
    if (!ui || !dialog || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

    const toggle = ui.querySelector(".hand-toggle");
    const label = toggle.querySelector(".hand-toggle-label");
    const hint = ui.querySelector(".hand-hint");
    const cam = ui.querySelector(".hand-cam");
    const video = cam.querySelector("video");
    const overlay = cam.querySelector("canvas");
    const octx = overlay.getContext("2d");
    const idleHint = hint.textContent;

    const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
    const MODEL =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
    const BONES = [
      [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
      [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
    ];

    let stream = null;
    let landmarker = null;
    let running = false;
    let lastVideoTime = -1;
    let lastSeen = 0;

    ui.hidden = false;

    toggle.addEventListener("click", () => {
      if (running) stop();
      else dialog.showModal();
    });

    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "ok") begin();
      else toggle.focus();
    });

    async function loadLandmarker() {
      const vision = await import(`${VISION}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 1,
      });
      try {
        return await vision.HandLandmarker.createFromOptions(files, options("GPU"));
      } catch {
        return await vision.HandLandmarker.createFromOptions(files, options("CPU"));
      }
    }

    async function begin() {
      toggle.disabled = true;
      hint.textContent = "Starting your camera…";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
      } catch {
        hint.textContent = "Camera access was blocked. You can still scroll, or press and hold the portrait.";
        toggle.disabled = false;
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      cam.hidden = false;

      if (!landmarker) {
        hint.textContent = "Loading hand tracking…";
        try {
          landmarker = await loadLandmarker();
        } catch {
          hint.textContent = "Hand tracking couldn't load. You can still scroll, or press and hold the portrait.";
          stop(true);
          return;
        }
      }
      if (!stream) return; // stopped while loading

      running = true;
      state.hand = true;
      state.visible = true;
      wake();
      toggle.disabled = false;
      toggle.setAttribute("aria-pressed", "true");
      label.textContent = "Turn off camera";
      hint.textContent = "Raise your hand in front of the camera.";
      lastSeen = performance.now();
      requestAnimationFrame(track);
    }

    function stop(keepHint) {
      running = false;
      state.hand = false;
      state.tiltXTarget = 0;
      state.tiltYTarget = 0;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
      cam.hidden = true;
      toggle.disabled = false;
      toggle.setAttribute("aria-pressed", "false");
      label.textContent = "Try hand control";
      if (!keepHint) hint.textContent = idleHint;
      wake();
    }

    // Turn the camera off when the visitor leaves the page.
    addEventListener("pagehide", () => running && stop());

    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

    function track() {
      if (!running) return;
      const now = performance.now();
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, now);
        const hand = result.landmarks && result.landmarks[0];
        drawHand(hand);
        if (hand) {
          lastSeen = now;
          // Open hand: fingertips sit far from the wrist compared with the palm.
          const palm = dist(hand[0], hand[9]) || 0.001;
          const reach = [8, 12, 16, 20].reduce((sum, i) => sum + dist(hand[i], hand[0]), 0) / 4 / palm;
          state.foldTarget = clamp01((1.75 - reach) / 0.65);
          // The camera image is mirrored for the visitor, so flip x.
          state.tiltXTarget = Math.max(-1, Math.min(1, (1 - hand[9].x) * 2 - 1));
          state.tiltYTarget = Math.max(-1, Math.min(1, hand[9].y * 2 - 1));
          hint.textContent = "Make a fist to fold it. Open your hand to unfold it.";
        } else if (now - lastSeen > 1500) {
          state.foldTarget = 0;
          hint.textContent = "Raise your hand in front of the camera.";
        }
      }
      requestAnimationFrame(track);
    }

    function drawHand(hand) {
      const w = (overlay.width = overlay.clientWidth * 2);
      const h = (overlay.height = overlay.clientHeight * 2);
      octx.clearRect(0, 0, w, h);
      if (!hand) return;
      octx.lineWidth = 3;
      octx.lineCap = "round";
      octx.strokeStyle = "rgba(240,149,106,0.95)";
      octx.beginPath();
      for (const [p, q] of BONES) {
        octx.moveTo(hand[p].x * w, hand[p].y * h);
        octx.lineTo(hand[q].x * w, hand[q].y * h);
      }
      octx.stroke();
      octx.fillStyle = "#fff";
      for (const p of hand) {
        octx.beginPath();
        octx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
        octx.fill();
      }
    }
  }
})();
