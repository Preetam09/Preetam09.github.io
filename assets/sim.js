/* Crowd-navigation demo: pedestrians wander between random spots; each person's next
   1.6 s is predicted with a straight line; the robot steers toward its goal while keeping
   clear of those predicted positions. Click or tap to move the goal. */
(function () {
  "use strict";
  var cv = document.getElementById("demo");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var C = {};
  function readColors() {
    var css = getComputedStyle(document.documentElement);
    function tok(name, fallback) { return css.getPropertyValue(name).trim() || fallback; }
    C = {
      card: tok("--card", "#ffffff"), ink: tok("--ink", "#15202b"), muted: tok("--muted", "#5b6876"),
      line: tok("--line", "#dce3ea"), accent: tok("--accent", "#1458c4"), warm: tok("--warm", "#d4500f")
    };
  }
  readColors();
  var M = 40, HORIZON = 1.6, SAFE = 46, PED_R = 7;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, peds = [], robot = null, goal = null, trail = [];
  var reached = 0, minPass = Infinity, lastUser = -1e9, hitAt = -1, simT = 0;
  var running = !reduce, visible = true, last = 0, showPred = true;

  var crowdEl = document.getElementById("crowd"), crowdOut = document.getElementById("crowd-n");
  var predEl = document.getElementById("preds"), playEl = document.getElementById("play");
  var tG = document.getElementById("t-goals"), tM = document.getElementById("t-min"), tS = document.getElementById("t-speed");
  var crowd = crowdEl ? parseInt(crowdEl.value, 10) : 18;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function waypoint(p) { p.tx = rand(0.04, 0.96) * W; p.ty = rand(0.06, 0.94) * H; }
  function spawn() {
    var p = { x: rand(0.03, 0.97) * W, y: rand(0.05, 0.95) * H, sp: rand(26, 46), ph: rand(0, 6.28), vx: 0, vy: 0 };
    waypoint(p);
    var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.vx = dx / d * p.sp; p.vy = dy / d * p.sp;
    return p;
  }
  function setCrowd(n) {
    while (peds.length < n) peds.push(spawn());
    while (peds.length > n) peds.pop();
  }
  function newGoal() {
    var g = null;
    for (var i = 0; i < 24; i++) {
      g = { x: rand(0.1, 0.9) * W, y: rand(0.14, 0.86) * H };
      if (Math.hypot(g.x - robot.x, g.y - robot.y) > Math.min(W, H) * 0.5) break;
    }
    goal = g;
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    if (!r.width) return;
    var ow = W || r.width, oh = H || r.height;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (robot) {
      var sx = W / ow, sy = H / oh;
      robot.x *= sx; robot.y *= sy; goal.x *= sx; goal.y *= sy;
      peds.forEach(function (p) { p.x *= sx; p.y *= sy; p.tx *= sx; p.ty *= sy; });
      trail = [];
    }
    draw();   // resizing clears the canvas, so always repaint
  }

  function step(dt) {
    simT += dt;
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i], dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < 18) { waypoint(p); p.sp = rand(26, 46); continue; }
      var wob = Math.sin(simT * 1.3 + p.ph) * 5;
      var fx = dx / d * p.sp - dy / d * wob, fy = dy / d * p.sp + dx / d * wob;
      for (var j = 0; j < peds.length; j++) {
        if (i === j) continue;
        var ox = p.x - peds[j].x, oy = p.y - peds[j].y, od = Math.hypot(ox, oy);
        if (od > 0 && od < 24) { fx += ox / od * (24 - od) * 3; fy += oy / od * (24 - od) * 3; }
      }
      var rx = p.x - robot.x, ry = p.y - robot.y, rd = Math.hypot(rx, ry);
      if (rd > 0 && rd < 28) { fx += rx / rd * (28 - rd) * 2; fy += ry / rd * (28 - rd) * 2; }
      p.vx += (fx - p.vx) * Math.min(1, 2.2 * dt);
      p.vy += (fy - p.vy) * Math.min(1, 2.2 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) peds[i] = spawn();
    }
    var gx = goal.x - robot.x, gy = goal.y - robot.y, gd = Math.hypot(gx, gy);
    var spd = Math.min(robot.max, gd * 1.4);
    var ax = gd > 1 ? gx / gd * spd : 0, ay = gd > 1 ? gy / gd * spd : 0;
    for (var k = 0; k < peds.length; k++) {
      var q = peds[k];
      for (var s = 0; s <= 4; s++) {
        var t = s * HORIZON / 4;
        var ex = robot.x + robot.vx * t - (q.x + q.vx * t), ey = robot.y + robot.vy * t - (q.y + q.vy * t), ed = Math.hypot(ex, ey);
        if (ed > 0.01 && ed < SAFE) {
          var m = (SAFE - ed) / SAFE * 210 * (1 - t / (HORIZON * 1.4));
          ax += ex / ed * m; ay += ey / ed * m;
        }
      }
    }
    var wl = 22;
    if (robot.x < wl) ax += (wl - robot.x) * 8;
    if (robot.x > W - wl) ax -= (robot.x - W + wl) * 8;
    if (robot.y < wl) ay += (wl - robot.y) * 8;
    if (robot.y > H - wl) ay -= (robot.y - H + wl) * 8;
    robot.vx += (ax - robot.vx) * Math.min(1, 3 * dt);
    robot.vy += (ay - robot.vy) * Math.min(1, 3 * dt);
    var v = Math.hypot(robot.vx, robot.vy), cap = robot.max * 1.15;
    if (v > cap) { robot.vx *= cap / v; robot.vy *= cap / v; }
    robot.x += robot.vx * dt; robot.y += robot.vy * dt;
    if (v > 2) robot.h = Math.atan2(robot.vy, robot.vx);
    var lp = trail[trail.length - 1];
    if (!lp || Math.hypot(lp[0] - robot.x, lp[1] - robot.y) > 6) { trail.push([robot.x, robot.y]); if (trail.length > 80) trail.shift(); }
    for (var n = 0; n < peds.length; n++) {
      var pp = peds[n];
      if (pp.x > 0 && pp.x < W && pp.y > 0 && pp.y < H) minPass = Math.min(minPass, Math.hypot(pp.x - robot.x, pp.y - robot.y));
    }
    if (gd < 10 && hitAt < 0) { reached++; hitAt = simT; }
    if (hitAt >= 0 && simT - hitAt > 1.2) { hitAt = -1; if (performance.now() - lastUser > 2500) newGoal(); }
  }

  function draw() {
    if (!robot) return;
    ctx.fillStyle = C.card; ctx.fillRect(0, 0, W, H);
    // 1 m floor grid
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath();
    for (var x = M; x < W; x += M) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (var y = M; y < H; y += M) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
    // robot's trail and straight line to goal
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.globalAlpha = 0.25; ctx.beginPath();
    trail.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke(); ctx.globalAlpha = 1;
    // predictions
    if (showPred) {
      ctx.strokeStyle = C.warm; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      peds.forEach(function (p) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * HORIZON, p.y + p.vy * HORIZON); ctx.stroke(); });
      ctx.setLineDash([]); ctx.fillStyle = C.warm;
      peds.forEach(function (p) {
        for (var s = 1; s <= 4; s++) {
          var t = s * HORIZON / 4; ctx.globalAlpha = 0.85 - s * 0.16;
          ctx.beginPath(); ctx.arc(p.x + p.vx * t, p.y + p.vy * t, 2.4, 0, 6.283); ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }
    // pedestrians
    peds.forEach(function (p) {
      var a = Math.atan2(p.vy, p.vx);
      ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, PED_R, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3); ctx.lineTo(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11); ctx.stroke();
    });
    // goal
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(goal.x, goal.y, 10, 0, 6.283); ctx.stroke();
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(goal.x, goal.y, 3, 0, 6.283); ctx.fill();
    ctx.font = "500 12px 'JetBrains Mono', monospace"; ctx.fillText("goal", goal.x + 15, goal.y + 4);
    // robot with its safety radius
    ctx.setLineDash([3, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(robot.x, robot.y, SAFE / 2, 0, 6.283); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(robot.x, robot.y, 10, 0, 6.283); ctx.fill();
    ctx.strokeStyle = C.card; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(robot.x, robot.y); ctx.lineTo(robot.x + Math.cos(robot.h) * 8, robot.y + Math.sin(robot.h) * 8); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.fillText("robot", robot.x + 15, robot.y - 14);
    // scale bar
    ctx.strokeStyle = C.muted; ctx.lineWidth = 2; ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(14, H - 16); ctx.lineTo(14 + M, H - 16);
    ctx.moveTo(14, H - 21); ctx.lineTo(14, H - 11); ctx.moveTo(14 + M, H - 21); ctx.lineTo(14 + M, H - 11); ctx.stroke();
    ctx.fillStyle = C.muted; ctx.fillText("1 m", 20 + M, H - 12);
  }

  var lastTel = 0;
  function tel(now, force) {
    if (!tG || (!force && now - lastTel < 250)) return;
    lastTel = now;
    tG.textContent = reached;
    tM.textContent = isFinite(minPass) ? (minPass / M).toFixed(2) + " m" : "–";
    tS.textContent = (Math.hypot(robot.vx, robot.vy) / M).toFixed(2) + " m/s";
  }
  function frame(now) {
    if (!running || !visible) { last = 0; return; }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    step(dt); draw(); tel(now);
    requestAnimationFrame(frame);
  }
  function start() { if (running && visible) { last = 0; requestAnimationFrame(frame); } }

  resize();
  robot = { x: W * 0.12, y: H * 0.5, vx: 0, vy: 0, h: 0, max: 62 };
  goal = { x: W * 0.86, y: H * 0.45 };
  setCrowd(crowd);
  for (var i = 0; i < 90; i++) step(1 / 30);   // warm up so the first frame already shows motion and predictions
  minPass = Infinity;
  draw(); tel(0, true);
  if (playEl) playEl.textContent = running ? "Pause" : "Play";

  cv.addEventListener("click", function (e) {
    var r = cv.getBoundingClientRect();
    goal = { x: e.clientX - r.left, y: e.clientY - r.top };
    hitAt = -1; lastUser = performance.now();
    if (!running) draw();
  });
  if (crowdEl) crowdEl.addEventListener("input", function () {
    crowd = parseInt(crowdEl.value, 10);
    if (crowdOut) crowdOut.textContent = crowd;
    setCrowd(crowd);
    if (!running) draw();
  });
  if (predEl) predEl.addEventListener("change", function () { showPred = predEl.checked; if (!running) draw(); });
  if (playEl) playEl.addEventListener("click", function () {
    running = !running; playEl.textContent = running ? "Pause" : "Play"; start();
  });
  window.addEventListener("themechange", function () { readColors(); draw(); });
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(cv); else window.addEventListener("resize", resize);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { var was = visible; visible = en[0].isIntersecting; if (visible && !was) start(); }).observe(cv);
  }
  start();
})();
