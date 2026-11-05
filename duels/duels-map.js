/* SPEEDIX — Carte des teams (onglet « Carte » de l'écran Duels).
 * Portage du prototype validé (SPEEDIX-DUELS/duels/duels.js : buildCells + drawMap + bindMap) ; seules les SOURCES de données changent :
 * nombres de Lands par team = RPC duel_map_data (base), duels en cours = duel_my_state. La disposition des cases est recalculée côté appli
 * à partir de ces nombres (AFFICHAGE uniquement, aucune règle). Appelé par duels-app.js : DuelsMap.draw(ctx). */
(function () {
  'use strict';
  var S = 24, SQ3 = Math.sqrt(3), NS = 'http://www.w3.org/2000/svg';
  var MD = { teams: [], mine: null }, st = { cells: {}, players: {}, active: [], engaged: null, pot: 0 }, me = null, selTeam = null, sideOpen = false, view = null, TC = {}, ctx = null, bound = false;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return typeof escapeHtml === 'function' ? escapeHtml(String(x == null ? '' : x)) : String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n || 0).toLocaleString('fr-FR'); };
  var teamName = function (id) { return ctx.team(id).name || '?'; };
  var teamInfo = function (id) { var t = ctx.team(id); return { color: t.color, logo: ctx.logoUrl(id) }; };
  var logo = function (id) { var u = ctx.logoUrl(id); return u ? '<img src="' + esc(u) + '" alt="">' : '<u></u>'; };
  var E = { // lectures sur l'état fourni par la base (jamais de règle)
    activeDuels: function () { return st.active; },
    scores: function (_s, d) { return { att: d.att, def: d.def }; },
    engagedDuel: function () { return st.engaged; },
    potOf: function () { return st.pot; }
  };
  /* ---------- carte hexagonale continue ---------- */
  var cart = function (q, r) { return [S * SQ3 * (q + r / 2), S * 1.5 * r]; };
  var xy = function (k) { var p = k.split(',').map(Number); return cart(p[0], p[1]); };
  function counts() { // nombres par team, calculés en base (duel_map_data) : n = toutes ses Lands, own = propriétés + étapes, loc = locations
    var c = {}; (MD.teams || []).forEach(function (t) { c[t.id] = { n: +t.n, own: +t.own, etapes: +t.etapes, loc: +t.loc }; }); return c;
  }
  function buildCells() {
    var c = counts(), T = (MD.teams || []).filter(function (t) { return c[t.id]; }).map(function (t) { return { id: t.id, n: c[t.id].n }; }).sort(function (a, b) { return (b.n - a.n) || (a.id < b.id ? -1 : 1); });
    var Rr = function (t) { return S * 1.75 * Math.sqrt(t.n / Math.PI); }, pl = [];
    T.forEach(function (t, i) {
      t.R = Rr(t); if (!i) { t.x = 0; t.y = 0; pl.push(t); return; }
      for (var rad = 0; rad < 5000; rad += 6) {
        var ok = false;
        for (var a = 0; a < 360; a += 5) {
          var x = rad * Math.cos(a * Math.PI / 180), y = rad * Math.sin(a * Math.PI / 180);
          if (pl.every(function (p) { return Math.hypot(p.x - x, p.y - y) >= (p.R + t.R) * 0.9; })) { t.x = x; t.y = y; ok = true; break; }
        }
        if (ok) break;
      }
      pl.push(t);
    });
    var RAD = 60, pairs = [];
    for (var q = -RAD; q <= RAD; q++) for (var r = -RAD; r <= RAD; r++) {
      if (Math.abs(q + r) > RAD) continue; var p = cart(q, r);
      T.forEach(function (t, i) { var d = Math.hypot(p[0] - t.x, p[1] - t.y) / t.R; if (d < 2.2) pairs.push([d, q, r, i]); });
    }
    pairs.sort(function (a, b) { return a[0] - b[0]; });
    var owner = {}, got = T.map(function () { return 0; });
    pairs.forEach(function (e) { var k = e[1] + ',' + e[2], i = e[3]; if (owner[k] || got[i] >= T[i].n) return; owner[k] = T[i].id; got[i]++; });
    st.cells = owner;
  }
  var hexPts = function (x, y, s) { var p = ''; for (var k = 0; k < 6; k++) { var a = Math.PI / 180 * (60 * k - 30); p += (x + s * Math.cos(a)).toFixed(1) + ',' + (y + s * Math.sin(a)).toFixed(1) + ' '; } return p; };

  function drawMap() {
    var svg = $('dz-map'); if (!svg) return;
    svg.innerHTML = '<defs></defs><g id="dz-g"></g>';
    var g = $('dz-g'), defs = svg.firstChild, c = counts(), E_ = function (n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); g.appendChild(e); return e; };
    var byTeam = {}; Object.keys(st.cells).forEach(function (k) { (byTeam[st.cells[k]] = byTeam[st.cells[k]] || []).push(k); });
    var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; TC = {}; var els = {};
    // Duels en cours : la team la plus petite est déplacée le temps du duel pour toucher son adversaire (frontière commune)
    var OFF = {}, BORD = [], D = SQ3 * S, shown = function (id) { var o = OFF[id] || [0, 0]; return (byTeam[id] || []).map(function (k) { var q = xy(k); return [q[0] + o[0], q[1] + o[1]]; }); };
    // Teams hors duel : écartées d'une case vide les unes des autres (carte plus lisible). On place les plus grosses d'abord ;
    // chaque team suivante prend le décalage (sur la grille) le plus proche de sa place d'origine qui la laisse à 1 case vide de toutes les autres.
    var TOUCH = [], ids = Object.keys(byTeam).sort(function (a, b) { return byTeam[b].length - byTeam[a].length; }), base = {}, cen = {}, rad = {}, duelPair = {}, MOVED = {};
    E.activeDuels(st).forEach(function (d) { duelPair[d.attackerTeam + '|' + d.defenderTeam] = duelPair[d.defenderTeam + '|' + d.attackerTeam] = 1; });
    ids.forEach(function (id) {
      base[id] = byTeam[id].map(xy); var n = base[id].length, cx_ = base[id].reduce(function (a, q) { return a + q[0]; }, 0) / n, cy_ = base[id].reduce(function (a, q) { return a + q[1]; }, 0) / n;
      cen[id] = [cx_, cy_]; rad[id] = Math.max.apply(null, base[id].map(function (q) { return Math.hypot(q[0] - cx_, q[1] - cy_); }));
    });
    var steps = [], RMAX = 40; for (var sr = -RMAX; sr <= RMAX; sr++) for (var sq = -RMAX - 7; sq <= RMAX + 7; sq++) { var sv = cart(sq, sr), sn = Math.hypot(sv[0], sv[1]); if (sn <= RMAX * D) steps.push([sv[0], sv[1], sn]); }
    steps.sort(function (a, b) { return a[2] - b[2]; });
    var GAP = 1.7 * D, clash = function (x, ox, y) {
      var oy = OFF[y], cdx = cen[x][0] + ox[0] - cen[y][0] - oy[0], cdy = cen[x][1] + ox[1] - cen[y][1] - oy[1];
      if (Math.hypot(cdx, cdy) > rad[x] + rad[y] + GAP + D) return false;
      var pa = base[x], pb = base[y];
      for (var u = 0; u < pa.length; u++) for (var v = 0; v < pb.length; v++) if (Math.hypot(pa[u][0] + ox[0] - pb[v][0] - oy[0], pa[u][1] + ox[1] - pb[v][1] - oy[1]) < GAP) return true;
      return false;
    }, placed = [];
    ids.forEach(function (id) { OFF[id] = [0, 0]; });
    // Duels : les deux teams se touchent sans se recouvrir (1 case de contact) ; on garde les contacts déjà obtenus pour les autres duels de la team.
    var dmin = function (mov, ox, y) {
      var oy = OFF[y], cdx = cen[mov][0] + ox[0] - cen[y][0] - oy[0], cdy = cen[mov][1] + ox[1] - cen[y][1] - oy[1];
      if (Math.hypot(cdx, cdy) > rad[mov] + rad[y] + 3 * D) return 1e9;
      var m = 1e9, pa = base[mov], pb = base[y];
      for (var u = 0; u < pa.length; u++) for (var v = 0; v < pb.length; v++) { var h = Math.hypot(pa[u][0] + ox[0] - pb[v][0] - oy[0], pa[u][1] + ox[1] - pb[v][1] - oy[1]); if (h < m) m = h; }
      return m;
    }, touches = function (d) { return d >= D * .99 && d <= D * 1.02; };
    var place = function (mov, anc, strict) {
      var o0 = OFF[mov];
      for (var si2 = 0; si2 < steps.length; si2++) {
        var cand = [o0[0] + steps[si2][0], o0[1] + steps[si2][1]], good = touches(dmin(mov, cand, anc));
        for (var ti = 0; ti < TOUCH.length && good && strict; ti++) { var tp = TOUCH[ti], z2 = tp[0] === mov ? tp[1] : tp[1] === mov ? tp[0] : null; if (z2 && z2 !== anc && !touches(dmin(mov, cand, z2))) good = false; }
        for (var zi = 0; zi < dids.length && good; zi++) { var z = dids[zi]; if (z === mov || z === anc) continue; var dz = dmin(mov, cand, z); if ((duelPair[mov + '|' + z] || !strict) ? dz < D * .99 : dz < GAP) good = false; }
        if (good) return cand;
      }
      return null;
    };
    var inDuel = {}; E.activeDuels(st).forEach(function (d) { inDuel[d.attackerTeam] = inDuel[d.defenderTeam] = 1; }); var dids = ids.filter(function (id) { return inDuel[id]; });
    var duelList = E.activeDuels(st).filter(function (d) { return byTeam[d.attackerTeam] && byTeam[d.defenderTeam]; });
    // on traite d'abord les duels de ta team (toujours collés), puis ceux des plus gros territoires : les petits viennent se coller autour, en chaîne
    var myT = me && st.players[me] ? st.players[me].team : null, isMy = function (z) { return z.attackerTeam === myT || z.defenderTeam === myT ? 1 : 0; };
    duelList.slice().sort(function (x, y) { return (isMy(y) - isMy(x)) || Math.max(byTeam[y.attackerTeam].length, byTeam[y.defenderTeam].length) - Math.max(byTeam[x.attackerTeam].length, byTeam[x.defenderTeam].length); }).forEach(function (d) {
      var A = d.attackerTeam, B = d.defenderTeam, big = byTeam[A].length >= byTeam[B].length ? A : B, small = big === A ? B : A;
      var pk = place(small, big, true), mv = small, an = big;
      if (!pk) { pk = place(big, small, true); mv = big; an = small; }
      if (!pk) { pk = place(small, big, false); mv = small; an = big; }
      if (pk) { OFF[mv] = pk; TOUCH.push([mv, an]); }
    });
    // puis les teams hors duel, autour des teams en duel : place libre la plus proche de leur emplacement d'origine, à 1 case vide de toutes les autres
    var placed = dids.slice();
    ids.filter(function (id) { return !inDuel[id]; }).forEach(function (id) {
      var chosen = [0, 0];
      for (var si = 0; si < steps.length; si++) {
        var ok = true, o = steps[si];
        for (var pi = 0; pi < placed.length; pi++) if (clash(id, o, placed[pi])) { ok = false; break; }
        if (ok) { chosen = [o[0], o[1]]; break; }
      }
      OFF[id] = chosen; placed.push(id);
    });
    var USED = {};
    // cases de contact : on évite celles cachées sous le blason de la team (au centre) ; si la team est trop petite, on prend toutes ses cases
    var freeOf = function (id) {
      var pts = shown(id), cx = pts.reduce(function (a, p) { return a + p[0]; }, 0) / pts.length, cy = pts.reduce(function (a, p) { return a + p[1]; }, 0) / pts.length, sz = Math.max(34, Math.min(110, 16 * Math.sqrt(pts.length) * 1.1));
      var f = pts.filter(function (p) { return Math.hypot(p[0] - cx, p[1] - cy) >= sz / 2 + S * 0.5; });
      return f.length ? f : pts;
    };
    duelList.forEach(function (d) {
      var A = d.attackerTeam, B = d.defenderTeam, pa = freeOf(A), pm = freeOf(B), best = null;
      pa.forEach(function (a) { pm.forEach(function (m) { var dd = Math.hypot(a[0] - m[0], a[1] - m[1]); if (!best || dd < best.d) best = { d: dd, a: a, m: m }; }); });
      var vt = me && st.players[me] ? st.players[me].team : null, sc = E.scores(st, d), attLead = sc.att > sc.def, col = '#f5c842'; // jaune : duel qui ne nous concerne pas
      if (vt === A || vt === B) col = ((vt === A) === attLead) ? '#2fe08a' : '#ff1fa8'; // vert : ma team mène (égalité : le défenseur mène) · rose : ma team est derrière
      var mineD = vt === A || vt === B, ca = best.a, cm = best.m;
      if (!mineD) { // duel d'autres teams : une case jaune par duel sur chaque team (le nombre de cases = le nombre de duels ouverts), sans lien
        var pick = function (team, target) {
          var u = USED[team] = USED[team] || {}, cs = freeOf(team).sort(function (p, q) { return Math.hypot(p[0] - target[0], p[1] - target[1]) - Math.hypot(q[0] - target[0], q[1] - target[1]); });
          for (var ci = 0; ci < cs.length; ci++) { var key = cs[ci][0].toFixed(1) + ',' + cs[ci][1].toFixed(1); if (!u[key]) { u[key] = 1; return cs[ci]; } }
          return cs[0];
        };
        ca = pick(A, best.m); cm = pick(B, best.a);
      }
      BORD.push({ a: ca, m: cm, col: col, A: A, B: B, mine: mineD, duel: d.id });
    });
    // cases vides en pointillés : le territoire peut grandir (partout où c'est libre + 1 rangée autour)
    var occ = []; Object.keys(byTeam).forEach(function (id) { shown(id).forEach(function (q) { occ.push(q); }); });
    var qs = Object.keys(st.cells).map(function (k) { return k.split(',').map(Number); }), q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
    qs.forEach(function (c) { q0 = Math.min(q0, c[0]); q1 = Math.max(q1, c[0]); r0 = Math.min(r0, c[1]); r1 = Math.max(r1, c[1]); });
    for (var gr = r0 - 6; gr <= r1 + 6; gr++) for (var gq = q0 - 6 - Math.ceil(r1 / 2); gq <= q1 + 6 + Math.ceil(-r0 / 2) + 6; gq++) {
      var gp = cart(gq, gr), near = 1e9, taken = false;
      for (var oi = 0; oi < occ.length; oi++) { var dd = Math.hypot(gp[0] - occ[oi][0], gp[1] - occ[oi][1]); if (dd < D * .5) { taken = true; break; } if (dd < near) near = dd; }
      if (!taken && near <= D * 1.05) E_('polygon', { points: hexPts(gp[0], gp[1], S - 2), fill: 'none', stroke: '#7d8fc4', 'stroke-opacity': .28, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
    }
    // liseret « mon territoire » : les propriétés et locations du RP qui regarde, visibles par lui seul, regroupées en un seul îlot
    var mineOutline = [], myOwn = 0, myLoc = 0, myEtape = 0;
    if (me && myT && MD.mine) { myOwn = +MD.mine.own || 0; myLoc = +MD.mine.loc || 0; myEtape = +MD.mine.etapes || 0; }
    Object.keys(byTeam).forEach(function (id) {
      var ti = teamInfo(id), pts = shown(id), cx = pts.reduce(function (a, p) { return a + p[0]; }, 0) / pts.length, cy = pts.reduce(function (a, p) { return a + p[1]; }, 0) / pts.length;
      TC[id] = { cx: cx, cy: cy, n: pts.length }; els[id] = [];
      var cc = c[id] || { own: 0, etapes: 0 }, col = ti.color || '#8895a7';
      var srt = pts.map(function (p, j) { return [Math.hypot(p[0] - cx, p[1] - cy), j]; }).sort(function (a, b) { return a[0] - b[0]; }), mineJ = {};
      if (id === myT && (myOwn || myLoc) && srt.length) {
        // îlot : ancre sur la frontière propriétés / locations, à un angle propre au RP ; on prend les cases les plus proches de l'ancre dans chaque groupe
        var hsh = 0; String(me).split('').forEach(function (ch) { hsh = (hsh * 31 + ch.charCodeAt(0)) % 3600; });
        var rb = srt[Math.max(0, Math.min(cc.own, srt.length) - 1)][0], th = hsh / 10 * Math.PI / 180, locAnchor = null, locPicked = [];
        // si l'une de MES Lands est en jeu (je l'ai misée ou on l'attaque), l'îlot se tourne vers l'adversaire : mes locations sont au bord, face à lui, et le duel s'y accroche
        var md = E.engagedDuel(st, me), mm = md && md.attackers.concat(md.defenders).filter(function (x) { return x.player === me; })[0], oppT = mm && mm.role !== 'helper' ? (md.attackerTeam === myT ? md.defenderTeam : md.attackerTeam) : null;
        if (oppT && byTeam[oppT] && myLoc) {
          var op = shown(oppT), ocx = op.reduce(function (s, q) { return s + q[0]; }, 0) / op.length, ocy = op.reduce(function (s, q) { return s + q[1]; }, 0) / op.length;
          th = Math.atan2(ocy - cy, ocx - cx); locAnchor = [cx + srt[srt.length - 1][0] * Math.cos(th), cy + srt[srt.length - 1][0] * Math.sin(th)];
        }
        var near = function (list, k, x, y, mark, colors) { list.slice().sort(function (u, v) { return Math.hypot(pts[u[1]][0] - x, pts[u[1]][1] - y) - Math.hypot(pts[v[1]][0] - x, pts[v[1]][1] - y); }).slice(0, k).forEach(function (o, n) { mineJ[o[1]] = colors[n] || colors[colors.length - 1]; if (mark) locPicked.push(o[1]); }); };
        var ax = cx + rb * Math.cos(th), ay = cy + rb * Math.sin(th);
        // îlot d'un seul tenant, sans trou : les (propriétés + locations) cases les plus proches de l'ancre, tous types confondus ; face à l'adversaire quand un de mes duels est en cours
        var aimX = locAnchor ? locAnchor[0] : ax, aimY = locAnchor ? locAnchor[1] : ay;
        near(srt, myOwn + myLoc, aimX, aimY, true, [1]);
        if (oppT && locPicked.length) { // la case de duel de mon côté = celle de mes locations la plus proche de l'adversaire
          BORD.forEach(function (bd) {
            if (bd.duel !== md.id) return;
            var mineIsA = bd.A === myT, other = mineIsA ? bd.m : bd.a, best = null;
            locPicked.forEach(function (j) { var dd = Math.hypot(pts[j][0] - other[0], pts[j][1] - other[1]); if (!best || dd < best.d) best = { d: dd, p: pts[j] }; });
            if (best) { if (mineIsA) bd.a = best.p; else bd.m = best.p; }
          });
        }
      }
      var mineCells = [], wonSet = {}, wonK = Math.min(srt.length, st.wonN[id] || 0);
      // cases gagnées : à l'EXTÉRIEUR du territoire (il a grandi), côté centre de la carte générale pour être vues dès l'ouverture
      if (wonK > 0) {
        var gcx = occ.reduce(function (a, q) { return a + q[0]; }, 0) / occ.length, gcy = occ.reduce(function (a, q) { return a + q[1]; }, 0) / occ.length, dmax = srt[srt.length - 1][0];
        var outer = srt.map(function (o, rk) { return rk; }).filter(function (rk) { return srt[rk][0] >= dmax * 0.7; }).sort(function (u, v) { return Math.hypot(pts[srt[u][1]][0] - gcx, pts[srt[u][1]][1] - gcy) - Math.hypot(pts[srt[v][1]][0] - gcx, pts[srt[v][1]][1] - gcy); });
        outer.slice(0, wonK).forEach(function (rk) { wonSet[rk] = 1; });
      }
      srt.forEach(function (o, rank) {
        var p = pts[o[1]], own = rank < cc.own, wonCell = !!wonSet[rank];
        mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
        els[id].push(E_('polygon', own ? { points: hexPts(p[0], p[1], S - 1), fill: col, stroke: '#fff', 'stroke-opacity': .55, 'stroke-width': 1.2 }
          : { points: hexPts(p[0], p[1], S - 1), fill: col, 'fill-opacity': .4, stroke: col, 'stroke-width': 2 }));
        if (wonCell) { // Land gagnée < 48 h : la case est remplie en hachures de la couleur de la team (motif SVG)
          var pid = 'dzw' + String(id).replace(/[^a-z0-9]/gi, '');
          if (!document.getElementById(pid)) {
            var pat = document.createElementNS(NS, 'pattern'); pat.id = pid; pat.setAttribute('width', 8); pat.setAttribute('height', 8); pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('patternTransform', 'rotate(45)');
            var bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', 8); bg.setAttribute('height', 8); bg.setAttribute('fill', '#0b1020'); pat.appendChild(bg);
            var ln = document.createElementNS(NS, 'rect'); ln.setAttribute('width', 4); ln.setAttribute('height', 8); ln.setAttribute('fill', col); pat.appendChild(ln);
            defs.appendChild(pat);
          }
          E_('polygon', { points: hexPts(p[0], p[1], S - 1), fill: 'url(#' + pid + ')', stroke: col, 'stroke-width': 3, 'stroke-linejoin': 'round' });
        }
        if (id === myT && mineJ[o[1]]) mineCells.push(p);
      });
      if (id === myT) mineOutline = mineCells;
    });
    if (mineOutline.length) { // un seul contour blanc autour de l'ensemble de mes Lands (calculé sur la grille hexagonale : aucun trou, aucune baie)
      var DIR = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]], inSet = {}, list = [], qr = function (p) { var r = Math.round(p[1] / (1.5 * S)); return [Math.round(p[0] / (S * SQ3) - r / 2), r]; };
      var addC = function (q, r) { var k = q + ',' + r; if (!inSet[k]) { inSet[k] = 1; list.push([q, r]); } };
      mineOutline.forEach(function (p) { var c = qr(p); addC(c[0], c[1]); });
      // creux : position vide entourée d'au moins 4 de mes cases, répété ; puis tout trou fermé
      for (var pass = 0; pass < 4; pass++) {
        var toAdd = {};
        list.forEach(function (c) { DIR.forEach(function (dv) { var q2 = c[0] + dv[0], r2 = c[1] + dv[1], k2 = q2 + ',' + r2; if (inSet[k2] || toAdd[k2]) return; var n2 = 0; DIR.forEach(function (d2) { if (inSet[(q2 + d2[0]) + ',' + (r2 + d2[1])]) n2++; }); if (n2 >= 4) toAdd[k2] = [q2, r2]; }); });
        var ks = Object.keys(toAdd); if (!ks.length) break; ks.forEach(function (k2) { addC(toAdd[k2][0], toAdd[k2][1]); });
      }
      var minQ = 1e9, maxQ = -1e9, minR = 1e9, maxR = -1e9; list.forEach(function (c) { minQ = Math.min(minQ, c[0]); maxQ = Math.max(maxQ, c[0]); minR = Math.min(minR, c[1]); maxR = Math.max(maxR, c[1]); });
      var out = {}, stack = [[minQ - 2, minR - 2]]; out[(minQ - 2) + ',' + (minR - 2)] = 1;
      while (stack.length) { var cur = stack.pop(); DIR.forEach(function (dv) { var q3 = cur[0] + dv[0], r3 = cur[1] + dv[1], k3 = q3 + ',' + r3; if (q3 < minQ - 2 || q3 > maxQ + 2 || r3 < minR - 2 || r3 > maxR + 2 || inSet[k3] || out[k3]) return; out[k3] = 1; stack.push([q3, r3]); }); }
      for (var rr = minR; rr <= maxR; rr++) for (var qq = minQ; qq <= maxQ; qq++) { var kk3 = qq + ',' + rr; if (!inSet[kk3] && !out[kk3]) addC(qq, rr); }
      var dstr = '';
      list.forEach(function (c) {
        var ctr = cart(c[0], c[1]);
        DIR.forEach(function (dv, k) {
          if (inSet[(c[0] + dv[0]) + ',' + (c[1] + dv[1])]) return; // arête partagée avec une autre de mes cases : pas de trait
          var a1 = Math.PI / 180 * (60 * k - 30), a2 = Math.PI / 180 * (60 * (k + 1) - 30);
          dstr += 'M' + (ctr[0] + S * Math.cos(a1)).toFixed(1) + ' ' + (ctr[1] + S * Math.sin(a1)).toFixed(1) + 'L' + (ctr[0] + S * Math.cos(a2)).toFixed(1) + ' ' + (ctr[1] + S * Math.sin(a2)).toFixed(1);
        });
      });
      var tc = (teamInfo(myT).color || '#8895a7').replace('#', ''), lum = tc.length === 6 ? (parseInt(tc.slice(0, 2), 16) * .299 + parseInt(tc.slice(2, 4), 16) * .587 + parseInt(tc.slice(4, 6), 16) * .114) / 255 : 0;
      var oc = lum > .72 ? '#20d0e0' : '#fff'; // team blanche : contour cyan pour rester visible
      var halo = E_('path', { d: dstr, fill: 'none', stroke: '#000', 'stroke-opacity': .65, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      var ol = E_('path', { d: dstr, fill: 'none', stroke: oc, 'stroke-width': 3.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (selTeam !== null && selTeam !== myT) { ol.style.opacity = .12; halo.style.opacity = .12; }
    }
    Object.keys(byTeam).forEach(function (id) {
      var ti = teamInfo(id), t = TC[id], sz = Math.max(34, Math.min(110, 16 * Math.sqrt(t.n) * 1.1));
      E_('circle', { cx: t.cx, cy: t.cy, r: sz / 2 + 3, fill: '#0b1020', stroke: '#fff', 'stroke-width': 3 });
      if (ti.logo) {
        var cp = document.createElementNS(NS, 'clipPath'); cp.id = 'dzc' + id; var ci = document.createElementNS(NS, 'circle'); ci.setAttribute('cx', t.cx); ci.setAttribute('cy', t.cy); ci.setAttribute('r', sz / 2); cp.appendChild(ci); defs.appendChild(cp);
        els[id].push(E_('image', { href: ti.logo, x: t.cx - sz / 2, y: t.cy - sz / 2, width: sz, height: sz, 'clip-path': 'url(#dzc' + id + ')' }));
      }
    });
    // frontière de duel : 2 cases côte à côte, contour rouge qui clignote
    BORD.forEach(function (b) {
      var dim = selTeam !== null && selTeam !== b.A && selTeam !== b.B ? .12 : 1;
      if (b.mine && Math.hypot(b.a[0] - b.m[0], b.a[1] - b.m[1]) > D * 1.1) { // cases éloignées : lien discret en pointillés (ne clignote pas)
        var ln = E_('line', { x1: b.a[0], y1: b.a[1], x2: b.m[0], y2: b.m[1], stroke: b.col, 'stroke-width': 2, 'stroke-dasharray': '6 6', 'stroke-linecap': 'round' }); ln.style.opacity = .9 * dim;
      }
      [b.a, b.m].forEach(function (q) {
        var pt = hexPts(q[0], q[1], S - 1), hot = b.col;
        E_('polygon', { points: pt, fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-linejoin': 'round' }).style.opacity = dim;
        E_('polygon', dim === 1 ? { points: pt, fill: hot, 'fill-opacity': .85, stroke: hot, 'stroke-width': 3, 'stroke-linejoin': 'round', 'class': 'dz-blink' } : { points: pt, fill: hot, 'fill-opacity': .85, stroke: hot, 'stroke-width': 3, 'stroke-linejoin': 'round', opacity: dim });
      });
    });
    if (!view) { // la carte est centrée sur le territoire de la team du RP, zoom pour tout voir
      var x0 = mnx - 90, x1 = mxx + 90, y0 = mny - 90, y1 = mxy + 90, mc = myT && byTeam[myT] ? shown(myT) : null;
      if (mc && mc.length) { var mcx = mc.reduce(function (a, q) { return a + q[0]; }, 0) / mc.length, mcy = mc.reduce(function (a, q) { return a + q[1]; }, 0) / mc.length, hx = Math.max(mcx - x0, x1 - mcx), hy = Math.max(mcy - y0, y1 - mcy); x0 = mcx - hx; x1 = mcx + hx; y0 = mcy - hy; y1 = mcy + hy; }
      var w = x1 - x0, h = y1 - y0, ar = Math.max(.5, svg.clientWidth / Math.max(1, svg.clientHeight)); view = ar > w / h ? [x0 - (h * ar - w) / 2, y0, h * ar, h] : [x0, y0 - (w / ar - h) / 2, w, w / ar];
      // zoom par défaut un peu plus rapproché (x1,8) autour du centre : la team du RP reste au milieu
      var ZD = 1.8; view = [view[0] + view[2] * (1 - 1 / ZD) / 2, view[1] + view[3] * (1 - 1 / ZD) / 2, view[2] / ZD, view[3] / ZD]; }
    svg.setAttribute('viewBox', view.join(' '));
    // surbrillance d'une team
    Object.keys(els).forEach(function (id) { els[id].forEach(function (e) { e.style.opacity = (selTeam === null || selTeam === id) ? 1 : .12; }); });
    // panneau latéral
    var mt = st.players[me].team;
    $('dz-mappot').innerHTML = '<div class="dz-pot-t">💰 CAGNOTTE ' + esc(teamName(mt)).toUpperCase() + '</div><div class="dz-pot-v">' + fmt(E.potOf(st, mt)) + ' RPC</div>';
    var head = '<div class="dz-side-h" data-toggle="1">' + (selTeam ? logo(selTeam) + '<span>' + esc(teamName(selTeam)) + '</span>' : '<span>🗺️ Teams</span>') + '<b>' + (sideOpen ? '▴' : '▾') + '</b></div>';
    $('dz-side').innerHTML = head + (sideOpen ? '<div class="dz-t' + (selTeam === null ? ' on' : '') + '" data-t="">Toutes les teams</div>' + Object.keys(byTeam).sort(function (a, b) { return byTeam[b].length - byTeam[a].length; }).map(function (id) {
      var cc = c[id] || { own: 0, loc: 0 };
      return '<div class="dz-t' + (selTeam === id ? ' on' : '') + '" data-t="' + id + '">' + logo(id) + '<span>' + esc(teamName(id)) + '</span><small>' + fmt(cc.n) + '</small></div>';
    }).join('') : '');
    $('dz-side').querySelector('.dz-side-h').onclick = function () { sideOpen = !sideOpen; drawMap(); };
    var chip = $('dz-selchip');   // le menu déroulant n'est plus affiché : la team choisie dans le Classement se retire d'un clic sur ce bouton
    if (chip) { chip.innerHTML = selTeam ? '<button>' + logo(selTeam) + '<span>' + esc(teamName(selTeam)) + '</span><b>✕</b></button>' : ''; var cb = chip.querySelector('button'); if (cb) cb.onclick = function () { selTeam = null; drawMap(); }; }
    [].forEach.call($('dz-side').querySelectorAll('.dz-t'), function (n) { n.onclick = function () { selTeam = n.dataset.t && selTeam !== n.dataset.t ? n.dataset.t : null; sideOpen = false; drawMap(); }; });
  }
  function bindMap() {
    var svg = $('dz-map'), ptrs = {}, dr = null, pinch = null;
    // zoom autour d'un point de l'écran (f < 1 = on se rapproche)
    var zoomAt = function (f, cx, cy) {
      var r = svg.getBoundingClientRect(), mx = view[0] + (cx - r.left) / r.width * view[2], my = view[1] + (cy - r.top) / r.height * view[3];
      view = [mx - (mx - view[0]) * f, my - (my - view[1]) * f, view[2] * f, view[3] * f]; svg.setAttribute('viewBox', view.join(' '));
    };
    var dist = function () { var k = Object.keys(ptrs); return Math.hypot(ptrs[k[0]][0] - ptrs[k[1]][0], ptrs[k[0]][1] - ptrs[k[1]][1]); };
    var mid = function () { var k = Object.keys(ptrs); return [(ptrs[k[0]][0] + ptrs[k[1]][0]) / 2, (ptrs[k[0]][1] + ptrs[k[1]][1]) / 2]; };
    svg.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
    svg.addEventListener('pointerdown', function (e) {
      ptrs[e.pointerId] = [e.clientX, e.clientY];
      if (Object.keys(ptrs).length === 2) { pinch = dist(); dr = null; } else dr = [e.clientX, e.clientY, view[0], view[1]];
    });
    addEventListener('pointerup', function (e) { delete ptrs[e.pointerId]; pinch = null; dr = null; var k = Object.keys(ptrs); if (k.length === 1) dr = [ptrs[k[0]][0], ptrs[k[0]][1], view[0], view[1]]; });
    addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; pinch = null; dr = null; });
    addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return; ptrs[e.pointerId] = [e.clientX, e.clientY];
      if (pinch && Object.keys(ptrs).length === 2) { var d = dist(), m2 = mid(); if (d > 4 && pinch > 4) zoomAt(pinch / d, m2[0], m2[1]); pinch = d; return; }
      if (!dr) return; var r = svg.getBoundingClientRect(); view[0] = dr[2] - (e.clientX - dr[0]) / r.width * view[2]; view[1] = dr[3] - (e.clientY - dr[1]) / r.height * view[3]; svg.setAttribute('viewBox', view.join(' '));
    });
  }

  function draw(c) {
    ctx = c; me = c.me; MD = c.mapData || { teams: [], mine: null };
    // un duel dont le temps est écoulé (en attente du règlement/Joker, 1 h) ne clignote plus sur la carte (04/11/2026)
    var active = (c.duels || []).filter(function (d) { return d.status === 'active' && !(d.end_at && new Date(d.end_at).getTime() <= Date.now()); });
    st.active = active.map(function (d) { var L = d.loss || {}; return { id: d.id, attackerTeam: d.attacker_team, defenderTeam: d.defender_team, att: L.att || 0, def: L.def || 0 }; });
    // Lands gagnées en duel depuis moins de 48 h : une case hachurée de la couleur de la team de l'équipe gagnante
    st.wonN = {};
    (c.duels || []).forEach(function (d) {
      var r = d.result || {};
      if (d.status !== 'done' || !d.end_at || Date.now() - Date.parse(d.end_at) >= 48 * 3600 * 1000) return;
      if (r.winner === 'attackers') st.wonN[d.attacker_team] = (st.wonN[d.attacker_team] || 0) + 1;
      else if (r.winner === 'defenders' && r.receiver) st.wonN[d.defender_team] = (st.wonN[d.defender_team] || 0) + 1;
    });
    st.engaged = null;
    active.forEach(function (d) {
      var ms = d.members || [];
      if (ms.some(function (m) { return m.player_id === me; })) st.engaged = { id: d.id, attackerTeam: d.attacker_team, defenderTeam: d.defender_team,
        attackers: ms.filter(function (m) { return m.side === 'att'; }).map(function (m) { return { player: m.player_id, role: m.role }; }),
        defenders: ms.filter(function (m) { return m.side === 'def'; }).map(function (m) { return { player: m.player_id, role: m.role }; }) };
    });
    st.players = {}; st.players[me] = { team: c.myTeam }; st.pot = c.pot || 0;
    buildCells();
    var svg = $('dz-map'); if (!svg) return;
    if (!bound) { bindMap(); bound = true; }
    drawMap();
  }
  window.DuelsMap = { draw: draw, reset: function () { view = null; selTeam = null; sideOpen = false; }, select: function (id) { selTeam = id || null; sideOpen = false; } };
})();
