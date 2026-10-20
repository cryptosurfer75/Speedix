/* Module 3D des médailles (production, 2026-10-20) — chargé À LA DEMANDE par _med3dAttach (index.html), jamais au démarrage.
   Three.js r128 hébergé dans vendor/ (pas de CDN). Anciennement : TEST LOCAL — fonctions de rendu copiées de test-medaille-3d-reveal.html
   API : Medal3D.mount(el, badge, {reveal:true|false}) → {dispose(), replay()}   (badge = objet déjà passé par _decorateBadgeWithCityCrest) */
(function(){
  var PADT = 12, VBH = 118 + PADT;
  var H = 3.6 * VBH / 118, W = 3.6 * 100 / 118, DEPTH = 0.13;
  var tp = null;
  function loadThree(){ if (window.THREE) return Promise.resolve(); if (!tp) tp = new Promise(function(ok, ko){ var s = document.createElement('script'); s.src = 'vendor/three-r128.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); return tp; }
  var loadImg = function(src){ return new Promise(function(ok, ko){ var i = new Image(); i.onload = function(){ ok(i); }; i.onerror = ko; i.src = src; }); };
function ribbonGeom(b){
  const rr=b.ribbonRise||0, rl=b.ribbonLen!=null?b.ribbonLen:29, rhw=b.ribbonHalf!=null?b.ribbonHalf:21, rx0=50-rhw, rx1=50+rhw;
  if (b.ribbonPts) return b.ribbonPts.trim().split(/\s+/).map(p => p.split(',').map(Number));
  // En 3D le ruban ne dépasse jamais au-dessus du cadre (y < 0) : ribbonRise « remonte » le ruban pour qu'il touche le blason en 2D,
  // mais ici son haut est ramené à y = 0 (comme les autres médailles) ; le point de contact avec le blason (le bas) ne bouge pas.
  var top = Math.max(0 - rr, 0);
  return b.ribbonFlat ? [[rx0,top],[rx1,top],[rx1,rl-rr],[rx0,rl-rr]] : [[rx0,top],[rx1,top],[rx1,29-rr],[50,21-rr],[rx0,29-rr]];
}
function ribbonSVG(b){
  const rc=b.ribbonColors, rhw=b.ribbonHalf!=null?b.ribbonHalf:21, rx0=50-rhw, rx1=50+rhw;
  const ribPts = ribbonGeom(b).map(p => p.join(',')).join(' ');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 '+(-PADT)+' 100 '+VBH+'" width="1200" height="'+(12*VBH)+'">'
   +'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="'+rc[0]+'"/><stop offset="100%" stop-color="'+rc[1]+'"/></linearGradient>'
   +'<clipPath id="c"><polygon points="'+ribPts+'"/></clipPath>'
   +'<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.5"/></filter></defs>'
   +'<g filter="url(#s)"><polygon points="'+ribPts+'" fill="url(#g)"/><g clip-path="url(#c)">'
   +(b.ribbonBands?b.ribbonBands.map((bc,bi,ba)=>{const bw=(rx1-rx0)/ba.length;return '<rect x="'+(rx0+bi*bw)+'" y="-2" width="'+(bw+0.2)+'" height="40" fill="'+bc+'"/>';}).join(''):'')
   +'<rect x="'+(rx0+1.4)+'" y="-2" width="2.6" height="36" fill="'+rc[1]+'"/>'
   +'<rect x="'+(rx0+4)+'" y="-2" width="2.6" height="36" fill="#fff" opacity="0.92"/>'
   +'<rect x="'+(rx1-6.6)+'" y="-2" width="2.6" height="36" fill="#fff" opacity="0.92"/>'
   +'<rect x="'+(rx1-4)+'" y="-2" width="2.6" height="36" fill="'+rc[1]+'"/>'
   +'</g></g></svg>';
}

/* ===== Silhouette : masque d'opacité → contour (Moore) → simplifié (Douglas-Peucker) ===== */
function silhouette(canvas){
  const w = 480, h = Math.round(w * canvas.height / canvas.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(canvas, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 90 ? 1 : 0;
  // combler les trous intérieurs
  const out = new Uint8Array(w * h), st = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * w + x; if (m[i] || out[i]) return; out[i] = 1; st.push(i); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  for (let i = 0; i < w * h; i++) m[i] = out[i] ? 0 : 1;
  // composantes : on les garde TOUTES (sauf poussières) — un bandeau séparé du blason par un liseré transparent doit rester
  const lab = new Int32Array(w * h), sizes = [0]; let L = 0;
  for (let s0 = 0; s0 < w * h; s0++) { if (!m[s0] || lab[s0]) continue; L++; let n = 0; const q = [s0]; lab[s0] = L;
    while (q.length) { const i = q.pop(); n++; const x = i % w; for (const j of [i-1, i+1, i-w, i+w]) { if (j < 0 || j >= w*h) continue; if ((j === i-1 && x === 0) || (j === i+1 && x === w-1)) continue; if (m[j] && !lab[j]) { lab[j] = L; q.push(j); } } }
    sizes[L] = n; }
  const maxN = Math.max.apply(null, sizes);
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  function rdp(a, eps) {
    if (a.length < 3) return a;
    let dmax = 0, ix = 0; const A = a[0], B = a[a.length - 1];
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < a.length - 1; i++) { const dist = Math.abs(dy * a[i][0] - dx * a[i][1] + B[0] * A[1] - B[1] * A[0]) / len; if (dist > dmax) { dmax = dist; ix = i; } }
    if (dmax > eps) { const l = rdp(a.slice(0, ix + 1), eps), r = rdp(a.slice(ix), eps); return l.slice(0, -1).concat(r); }
    return [A, B];
  }
  function trace(l) {
    const inM = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === l;
    let sx = -1, sy = -1; for (let i = 0; i < w * h && sx < 0; i++) if (lab[i] === l) { sx = i % w; sy = (i / w) | 0; }
    let p = [sx, sy], b = 4; const pts = [];
    for (let guard = 0; guard < 60000; guard++) {
      pts.push(p); let moved = false;
      for (let k = 0; k < 8; k++) {
        const dd = (b + 1 + k) % 8, nx = p[0] + dirs[dd][0], ny = p[1] + dirs[dd][1];
        if (inM(nx, ny)) { const pd = (b + k) % 8, bx = p[0] + dirs[pd][0] - nx, by = p[1] + dirs[pd][1] - ny; b = dirs.findIndex(v => v[0] === bx && v[1] === by); p = [nx, ny]; moved = true; break; }
      }
      if (!moved || (p[0] === sx && p[1] === sy)) break;
    }
    if (pts.length < 8) return null;
    let far = 0, fd = -1; pts.forEach((q, i) => { const dd2 = (q[0]-pts[0][0])**2 + (q[1]-pts[0][1])**2; if (dd2 > fd) { fd = dd2; far = i; } });
    const h1 = rdp(pts.slice(0, far + 1), 0.5), h2 = rdp(pts.slice(far).concat([pts[0]]), 0.5);
    const r = h1.slice(0, -1).concat(h2.slice(0, -1));
    return r.length >= 3 ? r : null;
  }
  const contours = [];
  for (let l = 1; l <= L; l++) { if (sizes[l] < maxN * 0.01 || sizes[l] < 60) continue; const t = trace(l); if (t) contours.push(t); }
  return {contours, w, h};
}

/* ===== Objet extrudé : capot avant (image), tranche + dos ===== */
function buildMedal(canvas, tex, W, H, depth, opt) {
  let shape;
  if (opt && opt.poly) shape = new THREE.Shape(opt.poly.map(p => new THREE.Vector2((p[0] / 100 - 0.5) * W, (0.5 - (p[1] + PADT) / VBH) * H)));
  else { const s = silhouette(canvas); shape = s.contours.map(pts => new THREE.Shape(pts.map(p => new THREE.Vector2((p[0] / s.w - 0.5) * W, (0.5 - p[1] / s.h) * H)))); }
  const geo0 = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelOffset: -0.02, bevelSegments: 3, curveSegments: 1});
  const g = geo0.index ? geo0.toNonIndexed() : geo0;
  const pos = g.attributes.position.array, n = pos.length / 9;
  const buckets = [[], [], []];
  for (let t = 0; t < n; t++) {
    const o = t * 9, ax = pos[o], ay = pos[o+1], az = pos[o+2], bx = pos[o+3], by = pos[o+4], bz = pos[o+5], cx = pos[o+6], cy = pos[o+7], cz = pos[o+8];
    const ux = bx-ax, uy = by-ay, uz = bz-az, vx = cx-ax, vy = cy-ay, vz = cz-az;
    let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx; const l = Math.hypot(nx, ny, nz) || 1; nz /= l;
    const zmean = (az + bz + cz) / 3;
    buckets[nz > 0.9 && zmean > depth * 0.5 ? 0 : (nz < -0.9 && zmean < depth * 0.5 ? 1 : 2)].push(t);
  }
  const order = [].concat(buckets[0], buckets[1], buckets[2]);
  const np = new Float32Array(order.length * 9), uv = new Float32Array(order.length * 6);
  order.forEach((t, k) => {
    for (let i = 0; i < 9; i++) np[k * 9 + i] = pos[t * 9 + i];
    for (let v = 0; v < 3; v++) { uv[k * 6 + v * 2] = np[k * 9 + v * 3] / W + 0.5; uv[k * 6 + v * 2 + 1] = np[k * 9 + v * 3 + 1] / H + 0.5; }
  });
  for (let kk = buckets[0].length; kk < buckets[0].length + buckets[1].length; kk++) for (let vv = 0; vv < 3; vv++) uv[kk * 6 + vv * 2] = 1 - uv[kk * 6 + vv * 2];   // dos : texte non miroir
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(np, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.computeVertexNormals();
  let off = 0; [0, 1, 2].forEach(i => { const c = buckets[i].length * 3; geo.addGroup(off, c, i); off += c; });
  const front = new THREE.MeshStandardMaterial({map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide});
  let mats;
  if (opt && opt.sideColor) { const m = new THREE.MeshStandardMaterial({color: opt.sideColor, emissive: opt.sideColor, emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide}); mats = [front, m, m]; }
  else { mats = [front, new THREE.MeshStandardMaterial({color: 0xb08a3a, emissive: 0x3a2a0c, metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide}), new THREE.MeshStandardMaterial({color: 0xd9b25a, emissive: 0x4a3510, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide})]; }
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.z = (opt && opt.z != null) ? opt.z : -depth / 2;
  mesh.userData.front = front;
  return mesh;
}


  function engraveTextures(rp, sub){
    var cw = 1200, ch = 12 * VBH;
    function base(bump){
      var c = document.createElement('canvas'); c.width = cw; c.height = ch; var g = c.getContext('2d');
      if (bump) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, cw, ch); }
      else { var gr = g.createLinearGradient(0, 0, cw, ch); gr.addColorStop(0, '#e6c36a'); gr.addColorStop(0.5, '#c9a24b'); gr.addColorStop(1, '#a98332'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
             g.globalAlpha = 0.07; for (var i = 0; i < 1400; i++) { g.fillStyle = (i % 2 ? '#fff' : '#000'); g.fillRect(Math.random() * cw, Math.random() * ch, 90 * Math.random() + 20, 2); } g.globalAlpha = 1; }
      return [c, g];
    }
    var m = base(false), bm = base(true);
    function line(txt, y, size, fontFace, color, bumpDepth){
      [m, bm].forEach(function(p, idx){
        var g = p[1]; g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
        var fs = size; g.font = '700 ' + fs + 'px ' + fontFace; var w = g.measureText(txt).width, maxW = 11 * 56; if (w > maxW) { fs = Math.floor(fs * maxW / w); g.font = '700 ' + fs + 'px ' + fontFace; }
        if (idx === 0) { g.fillStyle = color; g.fillText(txt, 600, y); }   // reflet bas + creux sombre
        else { g.fillStyle = '#9a9a9a'; g.fillText(txt, 600, y); }
        g.restore();
      });
    }
    var font = 'Bebas Neue, Impact, sans-serif';
    var cy = (61 + PADT) * 12;
    var INK = '#150d02', INK2 = '#1d1203';                       // brun très foncé : gravure patinée, contraste fort sur l'or
    line('SPEEDIX LEAGUE', cy - 335, 78, font, INK2, '#222');
    line('RP', cy - 170, 165, font, INK, '#000');                // plus petit + plus bas que le filet du dessus (cy - 262)
    line(rp, cy + 40, 180, font, INK, '#000');
    line(sub, cy + 225, 74, font, INK2, '#222');
    // filets : un sous « SPEEDIX LEAGUE », un sous le nom de la médaille — loin des lettres
    [m, bm].forEach(function(p, idx){ var g = p[1]; g.fillStyle = idx === 0 ? INK2 : '#333'; g.fillRect(250, cy - 268, 700, 7); g.fillRect(250, cy + 300, 700, 7); });
    var tm = new THREE.CanvasTexture(m[0]); tm.encoding = THREE.sRGBEncoding; tm.anisotropy = 4;
    var tb = new THREE.CanvasTexture(bm[0]); tb.anisotropy = 4;
    return {map: tm, bump: tb};
  }

  var easeOutBack = function(x){ var c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  var easeOutCubic = function(x){ return 1 - Math.pow(1 - x, 3); };

  async function mount(el, b, opt){
    opt = opt || {};
    await loadThree();
    var w = el.clientWidth || 260, h = el.clientHeight || 300;
    var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency || 4) <= 4 ? 1.5 : 2)); renderer.outputEncoding = THREE.sRGBEncoding; renderer.setSize(w, h);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
    el.innerHTML = ''; el.appendChild(renderer.domElement);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 50); camera.position.z = 6.4;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    var key = new THREE.DirectionalLight(0xffffff, 0.6); key.position.set(2, 3, 5); scene.add(key);
    var rim = new THREE.DirectionalLight(0xffe2a0, 0.5); rim.position.set(-4, -1, -2); scene.add(rim);
    var glint = new THREE.PointLight(0xffffff, 0.9, 14); glint.position.set(0, 0, 3); scene.add(glint);
    var group = new THREE.Group(), inner = new THREE.Group(); group.add(inner); scene.add(group);
    var fitK = 1, fronts = [], halo = null, disposed = false, raf = 0;
    var crest = await loadImg(b.image);
    var rc = b.ribbonColors || ['#c15aff', '#3d0a52'];
    var ov = Object.assign({}, b, {ribbonColors: rc});
    var ribImg = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ribbonSVG(ov)));
    if (disposed) return null;
    var S = 12;
    var imgY = ov.medalImgY != null ? ov.medalImgY : 14, imgW = ov.medalImgW != null ? ov.medalImgW : 96, imgH = ov.medalImgH != null ? ov.medalImgH : 94;
    var imgX = (100 - imgW) / 2, k = Math.min(imgW / crest.width, imgH / crest.height);
    var dw = crest.width * k, dh = crest.height * k, dx = imgX + (imgW - dw) / 2, dy = imgY;
    var mk = function(draw){ var c = document.createElement('canvas'); c.width = 1200; c.height = 12 * VBH; draw(c.getContext('2d')); var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return [c, t]; };
    var cm = mk(function(g){ g.drawImage(crest, dx * S, (dy + PADT) * S, dw * S, dh * S); });
    var meshMedal = buildMedal(cm[0], cm[1], W, H, DEPTH); inner.add(meshMedal);
    var cr = mk(function(g){ g.drawImage(ribImg, 0, 0, 1200, 12 * VBH); });
    var mid = new THREE.Color(rc[0]).lerp(new THREE.Color(rc[1]), 0.5);
    var meshRib = buildMedal(cr[0], cr[1], W, H, 0.07, {poly: ribbonGeom(ov), sideColor: mid, z: -0.05}); inner.add(meshRib);
    fronts = [meshMedal.userData.front, meshRib.userData.front];
    if (opt.engrave) {
      var et = engraveTextures(String(opt.engrave.rp || 'RP').toUpperCase(), String(opt.engrave.sub || '').toUpperCase());
      meshMedal.material[1] = new THREE.MeshStandardMaterial({map: et.map, bumpMap: et.bump, bumpScale: 1.2, emissive: 0x1d1304, emissiveIntensity: 0.2, metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide});
    }
    var bbOf = function(m){ m.geometry.computeBoundingBox(); var bb = m.geometry.boundingBox.clone(); bb.translate(m.position); return bb; };
    var bb = bbOf(meshMedal).union(bbOf(meshRib)), c3 = bb.getCenter(new THREE.Vector3());
    var visH = 2 * camera.position.z * Math.tan(16 * Math.PI / 180), visW = visH * camera.aspect;
    fitK = Math.min(0.9 * visW / (bb.max.x - bb.min.x), 0.88 * visH / (bb.max.y - bb.min.y), 1.5);
    inner.position.set(-c3.x, -c3.y, -c3.z);
    var hc = document.createElement('canvas'); hc.width = hc.height = 256; var hg = hc.getContext('2d');
    var gr = hg.createRadialGradient(128, 128, 8, 128, 128, 128); gr.addColorStop(0, rc[0] + 'cc'); gr.addColorStop(0.5, rc[0] + '44'); gr.addColorStop(1, rc[0] + '00');
    hg.fillStyle = gr; hg.fillRect(0, 0, 256, 256);
    var ht = new THREE.CanvasTexture(hc); ht.encoding = THREE.sRGBEncoding;
    halo = new THREE.Sprite(new THREE.SpriteMaterial({map: ht, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false}));
    halo.scale.set(visW * 1.25, visW * 1.25, 1); halo.position.z = -0.6; scene.add(halo);

    var rotY = 0, rotX = 0, tY = 0, tX = 0, dragging = false, lx = 0, ly = 0, auto = true, revealing = !!opt.reveal, t0 = performance.now();
    var replay = function(){ t0 = performance.now(); revealing = true; auto = true; tY = tX = rotY = rotX = 0; };
    var el2 = renderer.domElement;
    var flipTarget = 0, flipCur = 0, downX = 0, downY = 0, downT = 0, moved = false;
    el2.addEventListener('pointerdown', function(e){ dragging = true; moved = false; downX = lx = e.clientX; downY = ly = e.clientY; downT = performance.now(); });
    var up = function(){
      if (dragging && !moved && performance.now() - downT < 400 && !revealing) {            // simple tape : on retourne la médaille
        flipTarget = flipTarget ? 0 : Math.PI; tY = 0; tX = 0; auto = true;
        if (hintEl) { hintEl.remove(); hintEl = null; }
      }
      dragging = false; el2.style.cursor = 'grab';
    };
    var hintEl = null;
    if (opt.hint) { hintEl = document.createElement('div'); hintEl.textContent = opt.hint; hintEl.style.cssText = 'position:absolute;left:0;right:0;bottom:2px;text-align:center;font:11px/1 system-ui,sans-serif;letter-spacing:.06em;color:rgba(200,208,225,.55);pointer-events:none'; el.appendChild(hintEl); }
    window.addEventListener('pointerup', up);
    el2.addEventListener('pointermove', function(e){
      var r = el2.getBoundingClientRect(); glint.position.x = ((e.clientX - r.left) / r.width - .5) * 6; glint.position.y = -((e.clientY - r.top) / r.height - .5) * 6;
      if (!dragging) return;
      if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 7) { moved = true; auto = false; el2.style.cursor = 'grabbing'; }
      if (!moved) return;
      tY += (e.clientX - lx) * 0.012; tX += (e.clientY - ly) * 0.008; lx = e.clientX; ly = e.clientY;
      tX = Math.max(-0.8, Math.min(0.8, tX)); tY = Math.max(-0.9, Math.min(0.9, tY));
    });
    (function loop(now){
      if (disposed) return;
      if (!el2.isConnected) { dispose(); return; }
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      var e = (now - t0) / 1000, spin = 0, sc = 1, startSway = revealing ? 5.4 : 0;
      if (revealing) {
        sc = e < 3.6 ? 0.2 + 0.8 * easeOutBack(Math.min(e / 3.6, 1)) : 1;
        spin = e < 5.4 ? (1 - easeOutCubic(e / 5.4)) * (-Math.PI * 3) : 0;
        var flash = Math.exp(-Math.pow((e - 5.4) / 0.35, 2));
        fronts.forEach(function(f){ f.emissiveIntensity = 0.9 + 1.5 * flash; });
        halo.material.opacity = Math.min(Math.max((e - 3.6) / 1.8, 0), 1) * (0.55 + 0.1 * Math.sin(now / 400));
        if (e > 8) revealing = false;
      } else { halo.material.opacity = 0.45 + 0.08 * Math.sin(now / 500); }
      if (auto && e > startSway) { tY = Math.sin((now - t0 - startSway * 1000) / 1000) * 0.5 * Math.min((e - startSway) / 1.2, 1); tX = Math.sin(now / 1700) * 0.12; }
      rotY += (tY - rotY) * 0.12; rotX += (tX - rotX) * 0.12;
      flipCur += (flipTarget - flipCur) * 0.14;
      group.rotation.y = rotY + spin + flipCur; group.rotation.x = rotX; group.scale.setScalar(sc * fitK);
      renderer.render(scene, camera);
    })(performance.now());
    function dispose(){
      disposed = true; cancelAnimationFrame(raf); window.removeEventListener('pointerup', up);
      scene.traverse(function(o){ if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){ if (m.map) m.map.dispose(); m.dispose(); }); });
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {} if (el2.parentNode) el2.parentNode.removeChild(el2);
    }
    return {dispose: dispose, replay: replay, setAngle: function(a){ auto = false; revealing = false; tY = a; tX = 0; }};
  }
  window.Medal3D = {mount: mount};
})();
