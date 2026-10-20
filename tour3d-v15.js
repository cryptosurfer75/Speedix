/* Tour 3D (2026-10-20) — pion argenté qui saute de case en case + case/tour qui se soulève à l'arrivée.
   Chargé À LA DEMANDE par le Tour (cf _tour3dInit dans index.html), jamais au démarrage. Repli : si WebGL/Three.js
   indisponible, Tour3D.active reste false et le Tour garde son pion plat d'origine.
   API : Tour3D.init(map, marker) → Promise<bool> ; Tour3D.setHop(0..1) ; Tour3D.landing(lat,lng,{big,name}) → durée (ms) */
(function(){
  var T = null;           // THREE
  var st = {active: false, lift: 0, map: null, marker: null, lastHop: 0, glow: false, e: 0, holdUntil: 0, lastT: 0, wait: false, waitT: 0, seenModal: false};   // e = 0 (pion rentré dans la case) … 1 (pion sorti)

  function loadThree(){
    if (window.THREE) return Promise.resolve();
    return new Promise(function(ok, ko){ var s = document.createElement('script'); s.src = 'vendor/three-r128.min.js'; s.onload = ok; s.onerror = function(){ ko(new Error('three')); }; document.head.appendChild(s); });
  }
  function glOk(){ try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } }

  /* ───────── Pion ───────── */
  var ring1 = null, ring2 = null;
  var restDot = null, PW = 64, PH = 84, pawnCv = null, pawnR = null, pawnScene = null, pawnCam = null, pawn = null, shadow = null;
  function buildPawn(){
    pawnCv = document.createElement('canvas'); pawnCv.width = PW * 2; pawnCv.height = PH * 2; pawnCv.style.cssText = 'width:' + PW + 'px;height:' + PH + 'px;display:block;pointer-events:none;filter:none;transition:filter .35s';
    pawnR = new T.WebGLRenderer({canvas: pawnCv, alpha: true, antialias: true}); pawnR.setPixelRatio(1); pawnR.setSize(PW * 2, PH * 2, false); pawnR.outputEncoding = T.sRGBEncoding; pawnR.setClearColor(0, 0);
    restDot = document.createElement('div'); restDot.style.cssText = 'position:absolute;left:' + (PW / 2) + 'px;top:' + (PH - 10) + 'px;transform:translate(-50%,-50%);box-sizing:content-box;width:12px;height:12px;border-radius:50%;background:#d32020;border:2px solid #fff;box-shadow:0 0 0 3px rgba(211,32,32,.3),0 0 8px 2px rgba(211,32,32,.65);pointer-events:none';
    pawnScene = new T.Scene(); pawnCam = new T.PerspectiveCamera(28, PW / PH, 0.1, 50); pawnCam.position.set(0, 2.2, 8.2); pawnCam.lookAt(0, 1.55, 0);
    pawnScene.add(new T.AmbientLight(0xffffff, 0.4)); var key = new T.DirectionalLight(0xffffff, 0.75); key.position.set(2, 4, 4); pawnScene.add(key); var rim = new T.DirectionalLight(0xdfe8ff, 0.7); rim.position.set(-3, 2, -3); pawnScene.add(rim);
    var prof = [[0, 0], [0.62, 0], [0.66, 0.06], [0.6, 0.2], [0.42, 0.28], [0.3, 0.55], [0.24, 0.95], [0.3, 1.05], [0.42, 1.12], [0.3, 1.22], [0.32, 1.45], [0.34, 1.7], [0.28, 1.92], [0.16, 2.06], [0, 2.1]].map(function(p){ return new T.Vector2(p[0], p[1]); });
    pawn = new T.Group(); pawn.scale.setScalar(0.82);
    pawn.add(new T.Mesh(new T.LatheGeometry(prof, 36), new T.MeshLambertMaterial({color: 0xd32020, emissive: 0x4a0808})));
    var band = new T.Mesh(new T.TorusGeometry(0.46, 0.05, 10, 36), new T.MeshLambertMaterial({color: 0x9c1414, emissive: 0x300505})); band.rotation.x = Math.PI / 2; band.position.y = 0.3; pawn.add(band);
    pawnScene.add(pawn);
    // Anneau lumineux cyan qui pulse au sol + onde qui s'élargit (repère visible sur n'importe quelle couleur de case)
    ring1 = new T.Mesh(new T.TorusGeometry(0.78, 0.075, 10, 48), new T.MeshBasicMaterial({color: 0xff3b3b, transparent: true, opacity: 0.95, depthWrite: false})); ring1.rotation.x = Math.PI / 2 - 0.75; ring1.position.y = 0.03; pawnScene.add(ring1);
    ring2 = new T.Mesh(new T.TorusGeometry(0.78, 0.045, 10, 48), new T.MeshBasicMaterial({color: 0xff9a9a, transparent: true, opacity: 0, depthWrite: false})); ring2.rotation.x = Math.PI / 2 - 0.75; ring2.position.y = 0.03; pawnScene.add(ring2);
    shadow = new T.Mesh(new T.CircleGeometry(0.8, 28), new T.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false})); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.02; pawnScene.add(shadow);
  }
  function pawnIcon(){ return L.divIcon({className: '', html: '<div class="t3-pawn-slot" style="position:relative;width:' + PW + 'px;height:' + PH + 'px"></div>', iconSize: [PW, PH], iconAnchor: [PW / 2, PH - 10]}); }
  function mountPawn(){
    var el = st.marker && st.marker.getElement && st.marker.getElement(); if (!el) return;
    var slot = el.querySelector('.t3-pawn-slot'); if (slot && !slot.contains(pawnCv)) { slot.innerHTML = ''; slot.appendChild(pawnCv); slot.appendChild(restDot); }
  }

  /* ───────── Pions des amis : image fixe du même pion, dans la couleur choisie ───────── */
  var friendImgs = {};
  function pawnImg(rgb){
    if (!st.active || !pawn) return null;
    if (friendImgs[rgb]) return friendImgs[rgb];
    var c = String(rgb).split(',').map(Number), body = pawn.children[0].material, band = pawn.children[1].material;
    var keep = {b: body.color.getHex(), be: body.emissive.getHex(), a: band.color.getHex(), ae: band.emissive.getHex(), ry: pawn.rotation.y, py: pawn.position.y, sy: pawn.scale.y, r1: ring1.visible, r2: ring2.visible, sh: shadow.visible};
    // couleurs sRGB (celles des pastilles de choix) converties en linéaire : le rendu final correspond exactement à la pastille
    var base = new T.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();
    body.color.copy(base).multiplyScalar(0.95); body.emissive.setRGB(0, 0, 0);
    band.color.copy(base).multiplyScalar(0.55); band.emissive.setRGB(0, 0, 0);
    pawn.rotation.y = 0.5; pawn.position.y = 0.05; pawn.scale.setScalar(0.82); ring1.visible = ring2.visible = shadow.visible = false;
    pawnR.render(pawnScene, pawnCam); var url = pawnCv.toDataURL('image/png');
    body.color.setHex(keep.b); body.emissive.setHex(keep.be); band.color.setHex(keep.a); band.emissive.setHex(keep.ae);
    pawn.rotation.y = keep.ry; pawn.position.y = keep.py; pawn.scale.y = keep.sy; ring1.visible = keep.r1; ring2.visible = keep.r2; shadow.visible = keep.sh;
    friendImgs[rgb] = url; return url;
  }
  // Ami : rond de sa couleur au repos ; son pion sort (classe fp-on sur .friend-pawn, posée/retirée par le Tour) quand l'ami vient de bouger, et rentre 10 s après que le RP est revenu sur la carte.
  function friendIcon(pid, rgb, up){
    var url = pawnImg(rgb); if (!url) return null;
    var img = '<img class="fp-img" src="' + url + '" style="position:absolute;left:' + (7 - PW / 2) + 'px;top:' + (7 - (PH - 10)) + 'px;width:' + PW + 'px;height:' + PH + 'px;display:block;pointer-events:none;transform-origin:50% ' + (PH - 10) + 'px;transform:scaleY(0)">';
    return L.divIcon({className: '', html: '<div class="friend-pawn' + (up ? ' fp-on' : '') + '" data-pid="' + pid + '" style="--fc:' + rgb + ';position:relative;width:14px;height:14px"><div class="friend-marker fp-dot" style="position:absolute;left:0;top:0"></div>' + img + '</div>', iconSize: [14, 14], iconAnchor: [7, 7]});
  }

  /* ───────── Arrivée (case qui se soulève / tour d'étape) ───────── */
  var AW = 80, AH = 120, arrWrap = null, arrCv = null, arrR = null, arrScene = null, arrCam = null, tower = null, towerMat = null, arrBan = null, arrMarker = null;
  var arr = {t0: 0, h: 1, total: 3, big: false};
  function buildArrival(){
    arrWrap = document.createElement('div'); arrWrap.className = 't3-arr'; arrWrap.style.cssText = 'position:relative;width:150px;height:170px;pointer-events:none';
    arrCv = document.createElement('canvas'); arrCv.width = AW * 2; arrCv.height = AH * 2; arrCv.style.cssText = 'position:absolute;left:35px;top:0;width:' + AW + 'px;height:' + AH + 'px'; arrWrap.appendChild(arrCv);
    arrBan = document.createElement('div'); arrBan.style.cssText = 'position:absolute;left:-10px;right:-10px;top:118px;text-align:center;transform:scale(0);opacity:0;transition:transform .45s cubic-bezier(.2,1.5,.4,1),opacity .3s';
    arrBan.innerHTML = '<div style="background:rgba(245,200,66,.85);clip-path:polygon(9px 0,calc(100% - 9px) 0,100% 9px,100% calc(100% - 9px),calc(100% - 9px) 100%,9px 100%,0 calc(100% - 9px),0 9px);padding:1.5px;filter:drop-shadow(0 0 10px rgba(245,200,66,.6))"><div style="background:#0c0f1a;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px);padding:5px 12px"><div class="t3-bt" style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;letter-spacing:4px;color:#fff;line-height:1;white-space:nowrap"></div></div></div>';
    arrWrap.appendChild(arrBan);
    arrR = new T.WebGLRenderer({canvas: arrCv, alpha: true, antialias: true}); arrR.setPixelRatio(1); arrR.setSize(AW * 2, AH * 2, false); arrR.outputEncoding = T.sRGBEncoding; arrR.setClearColor(0, 0);
    arrScene = new T.Scene(); arrCam = new T.PerspectiveCamera(28, AW / AH, 0.1, 50); arrCam.position.set(0, 2.4, 9); arrCam.lookAt(0, 1.2, 0);
    arrScene.add(new T.AmbientLight(0xffffff, 0.5)); var al = new T.DirectionalLight(0xffffff, 1); al.position.set(2, 4, 5); arrScene.add(al);
    towerMat = new T.MeshPhongMaterial({color: 0xf5c842, specular: 0xffffff, shininess: 80, emissive: 0x6b4a00});
    tower = new T.Group(); var tb = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 2.2, 6), towerMat); tb.position.y = 1.1; tower.add(tb);
    var cap = new T.Mesh(new T.CylinderGeometry(0.8, 0.7, 0.28, 6), towerMat); cap.position.y = 2.3; tower.add(cap);
    arrScene.add(tower); tower.scale.y = 0.001; tower.visible = false;
    arrMarker = L.marker([0, 0], {icon: L.divIcon({className: '', html: '<div class="t3-arr-slot"></div>', iconSize: [150, 170], iconAnchor: [75, 100]}), zIndexOffset: 800, interactive: false, opacity: 0}).addTo(st.map);
  }
  function mountArr(){
    var el = arrMarker && arrMarker.getElement && arrMarker.getElement(); if (!el) return;
    var slot = el.querySelector('.t3-arr-slot'); if (slot && !slot.contains(arrWrap)) { slot.innerHTML = ''; slot.appendChild(arrWrap); }
  }
  var easeBack = function(x){ var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function landing(lat, lng, o){
    if (!st.active) return 0;
    o = o || {}; var big = !!o.big;
    arr.big = big; arr.h = big ? 1 : 0.34; arr.total = big ? 3.0 : 1.1;
    towerMat.color.set(big ? 0xf5c842 : 0x9db4ff); towerMat.emissive.set(big ? 0x6b4a00 : 0x1b2a66);
    arrMarker.setLatLng([lat, lng]); arrMarker.setOpacity(1); mountArr();
    arrBan.querySelector('.t3-bt').textContent = String(o.name || '').toUpperCase();
    arr.t0 = performance.now(); tower.visible = true;
    if (big) {
      var host = arrWrap;
      for (var k = 0; k < 16; k++) {
        (function(k){ var d = document.createElement('span'); var a = Math.PI * 2 * k / 16, r = 46 + Math.random() * 34;
          d.style.cssText = 'position:absolute;left:75px;top:60px;width:6px;height:6px;border-radius:50%;background:#f5c842;box-shadow:0 0 6px #f5c842;opacity:0;--dx:' + (Math.cos(a) * r) + 'px;--dy:' + (Math.sin(a) * r - 14) + 'px;animation:t3spk .9s ease-out ' + (0.9 + Math.random() * 0.25) + 's forwards';
          host.appendChild(d); setTimeout(function(){ d.remove(); }, 2400); })(k);
      }
      setTimeout(function(){ arrBan.style.transform = 'scale(1)'; arrBan.style.opacity = '1'; }, 1000);
      setTimeout(function(){ arrBan.style.transform = 'scale(0)'; arrBan.style.opacity = '0'; }, 2700);
    }
    st.wait = true; st.waitT = performance.now(); st.seenModal = false;
    st.holdUntil = performance.now() + Math.round(arr.total * 1000) + 100;   // le pion reste sorti jusqu'à l'ouverture de la fenêtre de la case
    return Math.round(arr.total * 1000) + 100;     // le Tour ouvre la fenêtre de la case après cette durée
  }

  /* ───────── Boucle de rendu ───────── */
  function loop(now){
    requestAnimationFrame(loop);
    if (document.hidden || !st.active) return;
    if (pawnCv && pawnCv.offsetParent !== null) {
      // Le pion n'existe qu'en déplacement : il sort de la case au départ, saute, reste le temps de l'arrivée, puis rentre.
      var tn = performance.now(), dt = st.lastT ? Math.min(0.1, (tn - st.lastT) / 1000) : 0; st.lastT = tn;
      // Mon pion reste sorti jusqu'à la fermeture de la fenêtre de la case (ou 15 s max si aucune ne s'ouvre), puis redevient un rond rouge.
      if (st.wait) {
        var mo = !!document.querySelector('.modal.open'); if (mo) st.seenModal = true;
        if ((st.seenModal && !mo) || (tn - st.waitT) > 15000) st.wait = false;
      }
      var want = ((tn - st.lastHop) < 450 || tn < st.holdUntil || st.wait) ? 1 : 0;
      st.e = want ? Math.min(1, st.e + dt / 0.4) : Math.max(0, st.e - dt / 0.35);
      restDot.style.opacity = String(Math.max(0, 1 - st.e * 4));
      if (st.e < 0.01) { pawnCv.style.visibility = 'hidden'; return; }
      pawnCv.style.visibility = 'visible';
      var grow = want ? easeBack(st.e) : st.e * st.e; pawn.scale.set(0.82, 0.82 * Math.max(0.001, grow), 0.82);
      var lift = st.lift;
      pawn.rotation.y = now / 1400; pawn.position.y = lift * 0.75 + 0.05 + Math.sin(now / 420) * 0.03;
      var s = 1 - lift * 0.18; shadow.scale.set(s, s, 1); shadow.material.opacity = (performance.now() - st.lastHop) < 250 ? 0.45 - lift * 0.25 : 0;   // ombre au sol seulement pendant les sauts
      var moving = (performance.now() - st.lastHop) < 250;
      if (moving !== st.glow) { st.glow = moving; pawnCv.style.filter = moving ? 'drop-shadow(0 0 5px #ff3b3b) drop-shadow(0 0 10px rgba(255,59,59,.55))' : 'none'; }
      if (moving) {
        var pulse = 1 + Math.sin(now / 380) * 0.06; ring1.scale.set(pulse, pulse, pulse); ring1.material.opacity = 0.75 + Math.sin(now / 380) * 0.2;
        var ph = (now % 1500) / 1500; ring2.scale.set(0.85 + ph * 0.7, 0.85 + ph * 0.7, 1); ring2.material.opacity = (1 - ph) * 0.8;
      } else { ring1.scale.set(1, 1, 1); ring1.material.opacity = 0; ring2.material.opacity = 0; }
      pawnR.render(pawnScene, pawnCam);
    } else if (pawnCv) { mountPawn(); }
    if (arr.t0) {
      var e = (performance.now() - arr.t0) / 1000, up = arr.big ? 0.8 : 0.45, T0 = arr.total;
      var k = e < up ? easeBack(e / up) : (e < T0 ? 1 : Math.max(0, 1 - (e - T0) / 0.5));
      // la case se rétracte en entier (hauteur ET largeur) puis disparaît : plus de couvercle plat qui reste
      var kw = e < T0 ? 1 : Math.max(0, k);
      tower.visible = k > 0.03; tower.scale.set(kw, Math.max(0.001, k * arr.h), kw); tower.rotation.y = e * 1.2; arrR.render(arrScene, arrCam);
      if (e > T0 + 0.5) { arr.t0 = 0; tower.visible = false; tower.scale.set(1, 0.001, 1); arrR.render(arrScene, arrCam); arrMarker.setOpacity(0); }
    }
  }

  function init(map, marker){
    if (st.active) return Promise.resolve(true);
    if (!glOk()) return Promise.resolve(false);
    return loadThree().then(function(){
      T = window.THREE; st.map = map; st.marker = marker;
      var css = document.createElement('style'); css.textContent = '.fp-img{transition:transform .45s cubic-bezier(.2,1.5,.4,1)}.fp-dot{transition:opacity .25s}.fp-on .fp-img{transform:scaleY(1) !important}.fp-on .fp-dot{opacity:0}@keyframes t3spk{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.3)}}'; document.head.appendChild(css);
      buildPawn(); buildArrival();
      marker.setIcon(pawnIcon()); st.active = true;
      map.on('zoomend moveend', function(){ mountPawn(); mountArr(); });
      setTimeout(mountPawn, 50);
      requestAnimationFrame(loop);
      return true;
    }).catch(function(e){ console.warn('[Tour3D] indisponible', e); return false; });
  }

  window.Tour3D = {
    init: init, landing: landing, pawnImg: pawnImg, friendIcon: friendIcon,
    setHop: function(v){ st.lift = v; st.lastHop = performance.now(); },
    get active(){ return st.active; }
  };
})();
