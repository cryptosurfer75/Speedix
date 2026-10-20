/* Mur 3D des médailles gagnées (ORDINATEUR seulement) — chargé à la demande depuis le bouton « Vue 3D » de l'Historique.
   UN SEUL moteur WebGL partagé pour toutes les médailles ; rendu À LA DEMANDE : on ne dessine que lorsque quelque chose bouge
   (médaille survolée, défilement, nouvelle médaille construite). Au repos : aucun calcul. Les médailles sont construites
   seulement quand elles entrent à l'écran, par petits morceaux (une par image). Dépend de medal3d-v3.js (Medal3D._int). */
(function(){
  var I = Medal3D._int, S = 3.5;
  async function buildModel(b){
    var crest = await I.loadImg(b.image);
    var rc = b.ribbonColors || ['#c15aff', '#3d0a52'], ov = Object.assign({}, b, {ribbonColors: rc});
    var hex = !!b.hexBadge;
    var ribImg = hex ? null : await I.loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(I.ribbonSVG(ov)));
    var cw = Math.round(100 * S), ch = Math.round(I.VBH * S);
    var imgY = hex ? 3 : (ov.medalImgY != null ? ov.medalImgY : 14), imgW = hex ? 100 : (ov.medalImgW != null ? ov.medalImgW : 96), imgH = hex ? 100 : (ov.medalImgH != null ? ov.medalImgH : 94);
    var imgX = (100 - imgW) / 2, k = Math.min(imgW / crest.width, imgH / crest.height), dw = crest.width * k, dh = crest.height * k, dx = imgX + (imgW - dw) / 2;
    function mk(draw){ var c = document.createElement('canvas'); c.width = cw; c.height = ch; draw(c.getContext('2d')); var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 2; return [c, t]; }
    var cm = mk(function(g){ g.drawImage(crest, dx * S, (imgY + I.PADT) * S, dw * S, dh * S); });
    var mm = I.buildMedal(cm[0], cm[1], I.W, I.H, hex ? 0.25 : 0.20);
    var inner = new THREE.Group(); inner.add(mm); var mr = null;
    if (!hex) {
      var cr = mk(function(g){ g.drawImage(ribImg, 0, 0, cw, ch); });
      var mid = new THREE.Color(rc[0]).lerp(new THREE.Color(rc[1]), 0.5);
      mr = I.buildMedal(cr[0], cr[1], I.W, I.H, 0.07, {poly: I.ribbonGeom(ov), sideColor: mid, z: -0.05}); inner.add(mr);
    }
    var bbOf = function(m){ m.geometry.computeBoundingBox(); var bb = m.geometry.boundingBox.clone(); bb.translate(m.position); return bb; };
    var bb = mr ? bbOf(mm).union(bbOf(mr)) : bbOf(mm), c3 = bb.getCenter(new THREE.Vector3());
    inner.position.set(-c3.x, -c3.y, -c3.z);
    var group = new THREE.Group(); group.add(inner);
    var scene = new THREE.Scene(); scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    var key = new THREE.DirectionalLight(0xffffff, 0.6); key.position.set(2, 3, 5); scene.add(key);
    var rim = new THREE.DirectionalLight(0xffe2a0, 0.5); rim.position.set(-4, -1, -2); scene.add(rim);
    return {scene: scene, group: group, bw: bb.max.x - bb.min.x, bh: bb.max.y - bb.min.y, ang: 0.28, hover: false};
  }

  // list : badges (déjà décorés, .medal=true, GAGNÉS) ; opts.onPick(b) ; opts.onClose() ; opts.stats(fn) pour mesurer
  function open(list, opts){
    opts = opts || {};
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:#0c0f1a;display:flex;flex-direction:column;color:#e8ecf5;font-family:Bebas Neue,system-ui,sans-serif';
    ov.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;letter-spacing:.12em;font-size:20px;background:#0c0f1a;position:relative;z-index:3"><span>' + (opts.title || 'MES MÉDAILLES') + ' · ' + list.length + '</span><button id="w3-x" aria-label="Fermer" style="width:36px;height:36px;border:none;background:url(icon-close-x.webp) center/contain no-repeat;color:transparent;cursor:pointer;padding:0">✕</button></div>'
      + '<div id="w3-grid" style="flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px 10px;padding:10px 18px 40px;align-content:start"></div>';
    document.body.appendChild(ov);
    var grid = ov.querySelector('#w3-grid'), tiles = [];
    list.forEach(function(b, i){
      var d = document.createElement('div'); d.style.cssText = 'cursor:pointer;text-align:center';
      var tile = document.createElement('div'); tile.style.cssText = 'width:100%;aspect-ratio:0.86';
      var nm = document.createElement('div'); nm.style.cssText = 'font-size:14px;letter-spacing:.08em;margin-top:2px;opacity:.9;line-height:1.1'; nm.textContent = (b.name || '').toUpperCase();
      d.appendChild(tile); d.appendChild(nm); grid.appendChild(d); tiles.push(tile);
      d.addEventListener('mouseenter', function(){ var m = models[i]; if (m && m.scene) { m.hover = true; need = true; } });
      d.addEventListener('mouseleave', function(){ var m = models[i]; if (m && m.scene) { m.hover = false; need = true; } });
      d.addEventListener('click', function(){ if (opts.onPick) opts.onPick(b, i); });
    });
    var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputEncoding = THREE.sRGBEncoding; renderer.setClearColor(0x000000, 0); renderer.autoClear = false;
    var cv = renderer.domElement; cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2'; ov.appendChild(cv);
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50); camera.position.z = 6.4;
    var visH = 2 * camera.position.z * Math.tan(16 * Math.PI / 180);
    var models = new Array(list.length), building = false, disposed = false, raf = 0, need = true, st = {frames: 0, drawn: 0};
    function resize(){ renderer.setSize(innerWidth, innerHeight, true); cv.style.width = '100vw'; cv.style.height = '100vh'; need = true; }
    resize(); addEventListener('resize', resize); grid.addEventListener('scroll', function(){ need = true; });
    async function pump(vis){
      if (building) return;
      var idx = vis.find(function(i){ return !models[i]; }); if (idx == null) return;
      building = true;
      try { models[idx] = await buildModel(list[idx]); } catch (e) { models[idx] = {err: true}; }
      building = false; need = true;
    }
    (function loop(now){
      if (disposed) return; raf = requestAnimationFrame(loop);
      st.frames++;
      if (document.hidden) return;
      var clip = grid.getBoundingClientRect(), vis = [], anim = false;
      for (var i = 0; i < tiles.length; i++) {
        var r = tiles[i].getBoundingClientRect();
        if (r.bottom < clip.top || r.top > clip.bottom || r.width < 4) continue;
        vis.push(i);
        var m = models[i]; if (!m || !m.scene) continue;
        var target = m.hover ? Math.sin(now / 800) * 0.55 : 0.28;                 // survol : la médaille se balance ; sinon pose fixe
        var d = target - m.ang; if (Math.abs(d) > 0.002) { m.ang += d * (m.hover ? 0.2 : 0.12); anim = true; } else if (m.hover) anim = true;
      }
      pump(vis);
      if (!need && !anim) return;                                                  // rien ne bouge → aucun dessin
      need = false; st.drawn++;
      renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
      var H = innerHeight;
      vis.forEach(function(i){
        var m = models[i]; if (!m || !m.scene) return;
        var r = tiles[i].getBoundingClientRect(), asp = r.width / r.height; camera.aspect = asp; camera.updateProjectionMatrix();
        var vw = visH * asp, fit = Math.min(0.92 * vw / m.bw, 0.9 * visH / m.bh, 1.5);
        m.group.scale.setScalar(fit); m.group.rotation.y = m.ang; m.group.rotation.x = 0;
        var x = r.left, y = H - r.bottom;
        var sx = Math.max(x, clip.left), sy = Math.max(H - Math.min(r.bottom, clip.bottom), 0), ex = Math.min(x + r.width, clip.right), ey = Math.min(H - Math.max(r.top, clip.top), H);
        if (ex <= sx || ey <= sy) return;
        renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(sx, sy, ex - sx, ey - sy); renderer.render(m.scene, camera);
      });
    })(performance.now());
    function close(){
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); removeEventListener('resize', resize);
      models.forEach(function(m){ if (!m || !m.scene) return; m.scene.traverse(function(o){ if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(mt){ if (mt.map) mt.map.dispose(); mt.dispose(); }); }); });
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {} ov.remove(); if (opts.onClose) opts.onClose();
    }
    ov.querySelector('#w3-x').onclick = close;
    ov.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); }); document.addEventListener('keydown', function esc(e){ if (disposed) { document.removeEventListener('keydown', esc); return; } if (e.key === 'Escape') close(); });
    return {close: close, stats: st};
  }
  Medal3D.wall = {open: open};
})();
