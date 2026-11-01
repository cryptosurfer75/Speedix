/* SPEEDIX — Duels de Land entre teams : écran de l'appli (branché sur les RPC de la base).
 * SOURCE UNIQUE des règles = la base (supabase/sql/2026-10-31-duels-de-land-base.sql). Ici on n'AFFICHE que ce que renvoient les fonctions
 * (duel_my_state, duel_launch, duel_join, duel_leave, duel_play_joker…) — jamais de règle recalculée côté appli.
 * Interrupteur : game_settings.duels_mode = 'off' | 'admin' | 'on'. Tant que ce n'est pas ouvert pour ce RP, le bouton DUEL est grisé. */
(function () {
  'use strict';
  var NOW_SKEW = 0, S = null, MAPDATA = null, TEAMS = {}, tab = 'duels', timer = null, inited = false, initing = false;
  var ADMIN_UID = '0cba7ec2-3d9d-4b08-9b51-280aa0c05a28';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return typeof escapeHtml === 'function' ? escapeHtml(String(x == null ? '' : x)) : String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n || 0).toLocaleString('fr-FR'); };
  var now = function () { return Date.now() + NOW_SKEW; };
  var REASONS = {
    not_logged_in: 'Connecte-toi pour jouer.', duels_off: 'Les duels ne sont pas encore ouverts.', bot: 'Tu ne peux pas lancer de duel sur cette Land.',
    land_inconnue: 'Land inconnue.', seules_les_locations_sont_en_jeu: 'Seules les Lands louées sont en jeu : les propriétés et les villes étapes sont à l\'abri.',
    land_en_pause: 'Cette Land vient de remporter un duel : elle est protégée 48 h.', pas_de_team: 'Il te faut une team pour lancer un duel.',
    land_sans_team: 'Cette Land n\'appartient à aucune team.', meme_team: 'C\'est une Land de ta propre team.', deja_engage: 'Tu es déjà engagé sur un duel. Un seul à la fois !',
    land_deja_en_duel: 'Cette Land est déjà en duel.', defenseur_deja_engage: 'Ce RP défend déjà un duel.', bail_arrive_a_echeance: 'Ton bail arrive à échéance, tu ne peux miser cette Land dans un duel.',
    aucune_location_a_miser: 'Il te faut au moins une Land en location à miser.', plafond_locations_atteint: 'Tu as atteint ta limite de locations (8 en Free).',
    cagnotte_insuffisante_pour_lancer: 'La cagnotte de ta team doit couvrir au moins le prix du Joker pour lancer un duel.',
    team_au_max_en_attaque: 'Ta team a déjà atteint son maximum de duels en attaque.', team_adverse_au_max_en_defense: 'Cette team défend déjà le maximum de duels.',
    mode_test_cibles_bots: 'Mode test : seules les Lands de bots peuvent être visées.', camp_complet: 'Ce camp est complet (3 RP maximum).', camp_complet_premium: 'Ce camp est complet (4 RP, le maximum avec un Premium).', pas_de_ta_team: 'Ce duel ne concerne pas ta team.',
    duel_termine: 'Le duel est terminé : les points sont figés.', duel_introuvable: 'Duel introuvable.', joker_pas_encore: 'Le Joker se joue à la fin du duel, dans l\'heure qui suit.',
    pas_capitaine: 'Seul le capitaine de la team peut jouer le Joker.', joker_deja_joue: 'Le Joker est déjà joué sur ce duel.', rien_a_eviter: 'Ton équipe n\'a pas de burn à éviter.',
    cagnotte_insuffisante: 'La cagnotte de la team est insuffisante pour ce Joker.', ne_peut_pas_quitter: 'Tu ne peux pas quitter ce duel (ta Land est en jeu).', pas_en_duel: 'Tu n\'es pas dans ce duel.', interdit: 'Action réservée.'
  };
  function toast(msg, bad) {
    var d = document.createElement('div'); d.className = 'dz-toast' + (bad ? ' bad' : ''); d.textContent = msg; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3800);
  }
  function cdown(ms) { ms = Math.max(0, ms); var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h + ' h ' + (m < 10 ? '0' : '') + m + ' min'; }
  function fmtDate(t) { return new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function me() { return currentUser && currentUser.id; }
  // MIROIR de _duel_side_cap (base) : 3 RP par camp, 4 si le camp compte un Premium (ou si moi, qui rejoins, je le suis)
  function sideCap(members) { return (typeof isPremium === 'function' && isPremium()) || members.some(function (m) { return m.premium; }) ? 4 : 3; }
  function team(id) { return TEAMS[id] || { name: '—', color: '#f5c842', blason_index: null }; }

  async function loadTeams(ids) {
    var need = ids.filter(function (i) { return i && !TEAMS[i]; }); if (!need.length) return;
    var r = await supabaseClient.from('teams').select('id,name,color,blason_index').in('id', need);
    (r.data || []).forEach(function (t) { TEAMS[t.id] = t; });
  }
  async function refresh() {
    var r = await supabaseClient.rpc('duel_my_state');
    if (r.error || !r.data) { S = { enabled: false }; renderTeamRow(); updateBadge(); return S; }
    S = r.data; if (S.now) NOW_SKEW = Date.parse(S.now) - Date.now();
    if (tab === 'map' && $('dz-app') && $('dz-app').classList.contains('on')) { var mr = await supabaseClient.rpc('duel_map_data'); if (mr.data && mr.data.enabled) { MAPDATA = mr.data; await loadTeams(MAPDATA.teams.map(function (t) { return t.id; })); } }
    var ids = []; (S.duels || []).forEach(function (d) { ids.push(d.attacker_team, d.defender_team); }); ids.push(S.team_id);
    await loadTeams(ids);
    renderTeamRow(); updateBadge();
    if ($('dz-app') && $('dz-app').classList.contains('on')) render();
    return S;
  }
  async function init() {
    if (inited || initing || !currentUser) return; initing = true;
    try { await refresh(); inited = true; } catch (e) { console.warn('[duels] init', e); }
    initing = false;
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState !== 'hidden') refresh(); }, 60000);
  }

  /* ---------- tuile DUEL de la page SPEEDIX Tour (à côté de la CAGNOTTE du Tour) ---------- */
  function renderTeamRow() {
    var host = $('tour-duel-tile'); if (!host) return;
    var tid = window.__myTeamId;
    if (!tid) { host.style.display = 'none'; return; }
    var on = !!(S && S.enabled);
    host.style.display = ''; host.style.opacity = on ? '1' : '.4'; host.style.cursor = on ? 'pointer' : 'not-allowed';
    host.title = on ? '' : 'Bientôt disponible';
    host.onclick = on ? function () { open(); } : null;
  }
  // cagnotte de la team : affichée dans l'écran Duel (clic = journal des mouvements)
  function renderPotRow() {
    var host = $('dz-pot-row'); if (!host || !S) return;
    host.innerHTML = '<div class="dz-pot" id="dz-pot-tile" title="Voir les mouvements"><small>💰 CAGNOTTE DE LA TEAM</small><b>' + fmt(S.pot) + ' RPC</b></div>';
    var t = $('dz-pot-tile'); if (t) t.onclick = function () { openPot(S.pot); };
  }

  /* ---------- pastille rouge sur la tuile SPEEDIX TOUR de la Player Card (un duel lancé sur MA Land, pas encore vu) ---------- */
  function seenKey() { return 'duels_seen_' + (me() || 'anon'); }
  function getSeen() { try { return JSON.parse(localStorage.getItem(seenKey()) || '[]'); } catch (e) { return []; } }
  function markSeen() {
    if (!S || !S.duels) return; var seen = getSeen();
    S.duels.forEach(function (d) { if (d.status === 'active' && isMyLandTargeted(d) && seen.indexOf(d.id) < 0) seen.push(d.id); });
    try { localStorage.setItem(seenKey(), JSON.stringify(seen.slice(-60))); } catch (e) {}
    updateBadge();
  }
  function isMyLandTargeted(d) { return (d.members || []).some(function (m) { return m.player_id === me() && m.role === 'holder'; }); }
  function updateBadge() {
    var host = document.querySelector('[data-tuto-target="lands"]'), wrap = host && host.parentElement; if (!wrap) return;
    var b = $('duel-tour-badge');
    if (!b) { b = document.createElement('div'); b.id = 'duel-tour-badge'; b.style.cssText = "display:none;position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#ff4444;border:2px solid #020408;box-sizing:border-box;font-size:.55rem;font-weight:700;color:#fff;font-family:'Space Mono',monospace;align-items:center;justify-content:center;pointer-events:none"; wrap.appendChild(b); }
    var seen = getSeen(), n = ((S && S.duels) || []).filter(function (d) { return d.status === 'active' && isMyLandTargeted(d) && seen.indexOf(d.id) < 0; }).length;
    b.textContent = n > 9 ? '9+' : n;
    if (typeof _setBadgeBlink === 'function') _setBadgeBlink('duel-tour-badge', n > 0, '#ff4444', 'flex'); else b.style.display = n > 0 ? 'flex' : 'none';
  }

  /* ---------- écran ---------- */
  function shell() {
    if ($('dz-app')) return;
    var el = document.createElement('div'); el.id = 'dz-app';
    el.innerHTML = '<div class="dz-head"><div class="dz-head-row"><div style="width:40px;flex-shrink:0"></div><div class="dz-head-title"><img src="league-title-chevron-left.webp" alt=""><div class="dz-ttl">DUEL <span style="color:#f5c842">TEAM</span></div><img src="league-title-chevron-right.webp" alt=""></div><button class="dz-closex" id="dz-close" title="Fermer"></button></div><div class="dz-head-line"></div></div>' +
      '<div class="dz-tabs" id="dz-tabs"></div><div id="dz-pot-row"></div><div class="dz-body"><div class="dz-pane" id="p-map"><div id="dz-mapframe"><svg id="dz-map"></svg><div id="dz-mappot"></div><div id="dz-zoom"><button data-z="in" aria-label="Zoom avant">+</button><button data-z="out" aria-label="Zoom arrière">−</button></div></div><div id="dz-side"></div></div><div class="dz-pane" id="p-duels"></div><div class="dz-pane" id="p-notifs"></div><div class="dz-pane" id="p-hist"></div><div class="dz-pane" id="p-rules"></div><div class="dz-pane" id="p-dev"></div></div>';
    document.body.appendChild(el);
    $('dz-close').onclick = close;
    $('dz-tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; if (tab === 'map') MAPDATA = null; if (tab === 'duels') markSeen(); if (tab === 'notifs') supabaseClient.rpc('duel_mark_notifications_read'); render(); } };
    el.addEventListener('click', onAction);
  }
  function open() { shell(); $('dz-app').classList.add('on'); tab = 'duels'; markSeen(); refresh().then(render); render(); }
  function close() { var e = $('dz-app'); if (e) e.classList.remove('on'); }

  // Carte des teams : données = duel_map_data ; dessin = duels-map.js (disposition calculée côté appli, affichage seulement)
  async function drawTeamMap() {
    if (!window.DuelsMap) return;
    if (!MAPDATA) { var mr = await supabaseClient.rpc('duel_map_data'); if (!mr.data || !mr.data.enabled) return; MAPDATA = mr.data; await loadTeams(MAPDATA.teams.map(function (t) { return t.id; })); }
    DuelsMap.draw({
      me: me(), myTeam: S.team_id, pot: S.pot, duels: S.duels || [], mapData: MAPDATA, team: team,
      logoUrl: function (id) { var t = team(id); try { if (typeof getBlasonIdx === 'function' && typeof AVAIL_BLASON_SMALL !== 'undefined') { var bi = getBlasonIdx(t); if (bi >= 0 && AVAIL_BLASON_SMALL[bi]) return AVAIL_BLASON_SMALL[bi]; } } catch (e) {} return ''; }
    });
  }

  async function render() {
    if (!$('dz-app') || !S) return;
    var notifN = window.__duelUnread || 0;
    var tiles = [['map', '🗺️', 'Carte', 0], ['duels', '⚔️', 'Duels', ((S.duels || []).filter(function (d) { return d.status === 'active'; })).length], ['notifs', '🔔', 'Notifs', notifN], ['hist', '🕓', 'Historique', 0]];
    if (me() === ADMIN_UID) tiles.push(['dev', '🧪', 'Test', 0]);   // Test à gauche, Règles toujours à droite
    tiles.push(['rules', '📜', 'Règles', 0]);
    $('dz-tabs').innerHTML = tiles.map(function (t) { var cls = t[0] === 'rules' ? 'glass-gold' : tab === t[0] ? 'solid-green' : 'white'; return '<button class="tour-tile-btn ' + cls + '" data-tab="' + t[0] + '"><span class="tour-tile-border"></span><span class="tour-tile-fill"></span><span class="tour-tile-emoji">' + t[1] + '</span>' + t[2] + (t[3] ? '<b>' + t[3] + '</b>' : '') + '</button>'; }).join('');
    ['map', 'duels', 'notifs', 'hist', 'rules', 'dev'].forEach(function (t) { $('p-' + t).classList.toggle('on', t === tab); });
    renderPotRow();
    if (tab === 'map') await drawTeamMap();
    else if (tab === 'duels') $('p-duels').innerHTML = paneDuels();
    else if (tab === 'hist') $('p-hist').innerHTML = paneHist();
    else if (tab === 'rules') $('p-rules').innerHTML = paneRules();
    else if (tab === 'dev') $('p-dev').innerHTML = paneDev();
    else if (tab === 'notifs') { $('p-notifs').innerHTML = await paneNotifs(); }
  }

  function phaseOf(d) { var t = now(); return d.status !== 'active' ? 'done' : (t < Date.parse(d.end_at) ? 'fight' : 'decision'); }
  function sidePts(d, side) { return (d.members || []).filter(function (m) { return m.side === side; }).reduce(function (s, m) { return s + (m.pts || 0); }, 0); }
  function logo(id) {
    var t = team(id);
    try { if (typeof getBlasonIdx === 'function' && typeof AVAIL_BLASON_SMALL !== 'undefined') { var bi = getBlasonIdx(t); if (bi >= 0 && AVAIL_BLASON_SMALL[bi]) return '<img src="' + esc(AVAIL_BLASON_SMALL[bi]) + '" alt="">'; } } catch (e) {}
    return '<u style="display:inline-block;background:' + esc(t.color || '#334') + '"></u>';
  }
  function memberLine(m) { return '<div class="dz-mrow"><span>' + esc(m.username) + (m.role === 'launcher' ? ' 🗡️' : m.role === 'holder' ? ' 🛡️' : '') + '</span><b>' + fmt(m.pts) + ' pts</b></div>'; }

  function duelCard(d) {
    var ph = phaseOf(d), L = d.loss || {}, att = L.att != null ? L.att : sidePts(d, 'att'), def = L.def != null ? L.def : sidePts(d, 'def'), tot = Math.max(1, att + def);
    var meId = me(), mine = (d.members || []).filter(function (m) { return m.player_id === meId; })[0], myTeam = S.team_id;
    var cd = ph === 'fight' ? '⏳ ' + cdown(Date.parse(d.end_at) - now()) : ph === 'decision' ? '🏳️ Joker possible : ' + cdown(Date.parse(d.resolve_at) - now()) : '';
    var attMembers = (d.members || []).filter(function (m) { return m.side === 'att'; }), defMembers = (d.members || []).filter(function (m) { return m.side === 'def'; });
    var canJoin = ph === 'fight' && !mine && ((myTeam === d.attacker_team && attMembers.length < sideCap(attMembers)) || (myTeam === d.defender_team && defMembers.length < sideCap(defMembers))) && !(S.duels || []).some(function (x) { return x.status === 'active' && (x.members || []).some(function (m) { return m.player_id === meId; }); });
    var canLeave = ph === 'fight' && mine && mine.role === 'helper';
    var h = '<div class="dz-card' + (mine ? ' mine' : '') + '"><div class="dz-row"><span class="dz-tag ' + (ph === 'fight' || ph === 'decision' ? 'fight' : 'done') + '">' + (ph === 'fight' ? 'EN COURS' : ph === 'decision' ? 'SCORE FINAL' : 'TERMINÉ') + '</span><span class="dz-muted">Land n°' + d.stake_idx + ' vs n°' + d.target_idx + '</span></div>' +
      '<div class="dz-vs" style="margin-top:8px">' + logo(d.attacker_team) + '<div class="mid"><span class="l" style="color:' + esc(team(d.attacker_team).color) + '">' + esc(team(d.attacker_team).name) + '</span><span class="x">⚔️</span><span class="r" style="color:' + esc(team(d.defender_team).color) + '">' + esc(team(d.defender_team).name) + '</span></div>' + logo(d.defender_team) + '</div>' +
      '<div class="dz-bar"><i style="width:' + (att + def ? 100 * att / tot : 50) + '%;background:' + (att === def ? (att ? '#ff4d9d' : '#555a6b') : att > def ? '#2fe08a' : '#ff4d9d') + '"></i><i style="width:' + (att + def ? 100 * def / tot : 50) + '%;background:' + (att === def ? (att ? '#2fe08a' : '#555a6b') : def > att ? '#2fe08a' : '#ff4d9d') + '"></i></div>' +
      '<div class="dz-sc"><span>' + fmt(att) + '</span><span class="dz-muted" style="align-self:center">' + cd + '</span><span>' + fmt(def) + '</span></div>' +
      '<div class="dz-members"><div>' + attMembers.map(memberLine).join('') + '</div><div>' + defMembers.map(memberLine).join('') + '</div></div>';
    if (ph !== 'done') {
      var cells = '', burnCol = 0, delta = L.delta || 0;
      if (delta > 0) {
        var loserIsAtt = L.loser_team === d.attacker_team; burnCol = loserIsAtt ? 1 : 2;
        var jk = '';
        if (ph === 'decision' && S.is_captain && L.loser_team === myTeam && !L.joker) jk = '<button class="dz-btn green" style="margin-top:8px;width:100%" data-joker="' + d.id + '">Joker · ' + fmt(S.joker_price) + ' RPC</button>';
        var body = L.joker ? '<div class="dz-loss-t">🏳️ Joker joué</div><div class="dz-muted">0 RPC brûlé (' + fmt(d.joker_price) + ' RPC dépensés)</div>'
          : '<div class="dz-loss-t">🔥 burn <span class="dz-yel">' + fmt(L.raw) + ' RPC</span></div><div class="dz-muted">' + fmt(delta) + ' pts × 20 RPC</div>';
        cells += '<div class="dz-loss" style="grid-column:' + burnCol + '">' + body + jk + '</div>';
      }
      var btn = canJoin ? '<button class="dz-btn green" data-join="' + d.id + '">Rejoindre le duel</button>' : canLeave ? '<button class="dz-btn green" data-leave="' + d.id + '">Quitter</button>' : '';
      if (btn) cells += '<div class="dz-joincell" style="grid-column:' + (burnCol === 1 ? 2 : 1) + ';grid-row:1">' + btn + '</div>';
      if (cells) h += '<div class="dz-losses">' + cells + '</div>';
    }
    return h + '</div>';
  }
  function paneDuels() {
    var act = (S.duels || []).filter(function (d) { return d.status === 'active'; }).sort(function (a, b) { var ma = (a.members || []).some(function (m) { return m.player_id === me(); }), mb = (b.members || []).some(function (m) { return m.player_id === me(); }); return (mb ? 1 : 0) - (ma ? 1 : 0); });
    return '<div class="dz-list">' + (act.length ? act.map(duelCard).join('') : '<div class="dz-card dz-muted">Aucun duel en cours. Pour en lancer un, tombe sur la Land d\'une autre team pendant ton Tour.</div>') + '</div>';
  }
  function paneHist() {
    var done = (S.duels || []).filter(function (d) { return d.status === 'done'; });
    if (!done.length) return '<div class="dz-list"><div class="dz-card dz-muted">Aucun duel terminé pour l\'instant.</div></div>';
    return '<div class="dz-list">' + done.map(function (d) {
      var r = d.result || {}, pen = r.penalty || {}, myT = S.team_id, att = d.attacker_team === myT, won = (r.winner === 'attackers') === att, lines = '';
      if (pen.delta && pen.loser_team === myT) lines += '<div class="dz-loss">' + (pen.joker ? '<div class="dz-loss-t">🏳️ Joker joué</div><div class="dz-muted">0 RPC brûlé (' + fmt(d.joker_price) + ' RPC dépensés)</div>' : '<div class="dz-loss-t">🔥 burn <span class="dz-yel">' + fmt(pen.paid) + ' RPC</span></div><div class="dz-muted">' + fmt(pen.delta) + ' pts d\'écart × 20 RPC</div>') + '</div>';
      var gain = (r.nyx || []).filter(function (x) { return x.player === me(); });
      if (gain.length) lines += '<div class="dz-loss"><div class="dz-loss-t">🎁 Joker adverse</div><div class="dz-muted">+' + gain[0].nyx + ' NYX</div></div>';
      return '<div class="dz-card"><div class="dz-row"><span class="dz-tag ' + (won ? 'done' : 'fight') + '">' + (won ? 'VICTOIRE' : 'DÉFAITE') + '</span><span class="dz-muted">Land n°' + d.stake_idx + ' vs n°' + d.target_idx + ' · ' + fmtDate(d.resolve_at) + '</span></div>' +
        '<div class="dz-vs" style="margin-top:8px">' + logo(d.attacker_team) + '<div class="mid"><span class="l" style="color:' + esc(team(d.attacker_team).color) + '">' + esc(team(d.attacker_team).name) + '</span><span class="x">⚔️</span><span class="r" style="color:' + esc(team(d.defender_team).color) + '">' + esc(team(d.defender_team).name) + '</span></div>' + logo(d.defender_team) + '</div>' +
        '<div class="dz-sc"><span>' + fmt(r.att) + '</span><span></span><span>' + fmt(r.def) + '</span></div>' + (lines ? '<div class="dz-losses" style="grid-template-columns:1fr">' + lines + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  async function paneNotifs() {
    var r = await supabaseClient.from('duel_notifications').select('kind,text,created_at,read_at').eq('player_id', me()).order('created_at', { ascending: false }).limit(40);
    var ns = r.data || []; window.__duelUnread = 0;
    return '<div class="dz-list">' + (ns.length ? ns.map(function (n) { return '<div class="dz-notif ' + esc(n.kind) + '">' + esc(n.text) + '<small>' + fmtDate(n.created_at) + '</small></div>'; }).join('') : '<div class="dz-card dz-muted">Aucune notification.</div>') + '</div>';
  }
  function paneRules() {
    var R = [
      ['⚔️ Tu peux lancer un duel si :', ['Tu tombes sur la Land d\'une autre team', 'Tu as au moins une Land en location', 'Tu n\'as pas atteint ta limite de locations (8 en Free)', 'La cagnotte couvre au moins le prix du Joker']],
      ['⏱️ Déroulé', ['72 h pour gagner le duel.', 'Seuls les points gagnés au départ du duel comptent.', 'Les 2 Lands mises en jeu sont verrouillées.', 'Une Land ne peut être attaquée à nouveau qu\'après une pause de 48 h.', 'Pas de duel sur les Lands en propriété.']],
      ['👥 Les équipes', ['3 RP maximum par duel + 1 Premium.', 'Un RP ne peut jouer qu\'un duel à la fois.', 'Un RP libre peut rejoindre un duel comme renfort.', 'Un RP peut quitter le duel mais il abandonne ses points.', 'Dans une team, les duels sont limités par trios de RP disponibles.']],
      ['🏆 Résultat', ['Attaque gagnante : la Land attaquée va au RP qui a lancé le duel.', 'Défense gagnante : le RP gagne la Land du RP adverse. S\'il a atteint sa limite de locations (8 en Free) elle va à un RP Premium de sa team.<br>Si personne ne peut la recevoir, elle est remise en jeu.', 'Égalité : le défenseur gagne.']],
      ['💰 Cagnotte de la team', ['La cagnotte est alimentée par 20 % des RPC des RP qui composent la team.', 'Elle paie les défaites et le Joker.']],
      ['💸 Défaite', ['La Land mise en jeu change de team.', '20 RPC par point d\'écart sont brûlés dans la cagnotte de la team perdante.', 'Le burn ne peut pas dépasser 15 % de la cagnotte totale.']],
      ['🏳️ Joker', ['Pour éviter le burn, le capitaine peut poser un Joker.', 'Prix progressif du Joker : 1 000, 1 500 puis 2 000 RPC × nombre de RP.', 'En compensation, les RP du duel gagnant reçoivent des NYX en proportion de l\'écart de points.', '300 pts minimum / RP dans le duel pour les gagner.']]
    ];
    return '<div class="dz-list dz-rules-page">' + R.map(function (r) { return '<div class="rules-section"><h3>' + r[0] + '</h3><ul class="dz-rules">' + r[1].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>';
  }
  function paneDev() {
    var mine = (S.duels || []).filter(function (d) { return d.status === 'active'; });
    var opts = []; mine.forEach(function (d) { (d.members || []).forEach(function (m) { opts.push('<option value="' + d.id + '|' + m.player_id + '">' + esc(m.username) + ' (duel n°' + d.id + ')</option>'); }); });
    return '<div class="dz-list"><div class="dz-dev"><b>🧪 Outils de test (mode admin)</b><div class="dz-muted">Tout est simulé : rien n\'est écrit dans les courses ni dans les portefeuilles.</div>' +
      '<div>Lancer un duel sur la Land n° <input id="dev-land" type="number" value="8" style="width:80px"> <button class="dz-btn" data-testlaunch="1">Lancer</button> <span class="dz-muted">(Land d\'un bot Rhinos pour le test)</span></div>' +
      '<div>Alimenter la cagnotte de ma team : <input id="dev-fund" type="number" value="100000" style="width:110px"> <button class="dz-btn" data-fund="1">Ajouter</button></div>' +
      '<div>Points simulés : <select id="dev-who">' + opts.join('') + '</select> <input id="dev-pts" type="number" value="300" style="width:80px"> <button class="dz-btn" data-addpts="1">Ajouter</button></div>' +
      '<div class="dz-muted">Mode : ' + (S.enabled ? 'ouvert pour toi' : 'fermé') + ' · durée du duel en mode test : 60 min.</div></div></div>';
  }

  /* ---------- actions ---------- */
  function askJoker(id) {
    var d = (S.duels || []).filter(function (x) { return x.id === +id; })[0], burn = d && d.loss ? d.loss.paid : 0;
    var m = document.createElement('div'); m.id = 'dz-modal';
    m.innerHTML = '<div class="dz-modal-box"><div style="font-size:15px;line-height:1.5">Joue ton Joker (<b class="dz-yel">' + fmt(S.joker_price) + ' RPC</b>) pour éviter le burn de ta cagnotte (<b class="dz-yel">− ' + fmt(burn) + ' RPC</b>).</div><div class="dz-row" style="margin-top:16px;gap:10px"><button class="dz-btn" style="flex:1;text-transform:uppercase" data-cancel="1">Annuler</button><button class="dz-btn green" style="flex:1" data-confirmjoker="' + id + '">Jouer</button></div></div>';
    $('dz-app').appendChild(m);
  }
  async function onAction(e) {
    var b = e.target.closest('button'); if (!b) return; var r;
    if (b.dataset.cancel) { var m = $('dz-modal'); if (m) m.remove(); return; }
    if (b.dataset.join) r = await supabaseClient.rpc('duel_join', { p_duel: +b.dataset.join });
    else if (b.dataset.leave) r = await supabaseClient.rpc('duel_leave', { p_duel: +b.dataset.leave });
    else if (b.dataset.joker) { askJoker(b.dataset.joker); return; }
    else if (b.dataset.confirmjoker) { var m2 = $('dz-modal'); if (m2) m2.remove(); r = await supabaseClient.rpc('duel_play_joker', { p_duel: +b.dataset.confirmjoker }); }
    else if (b.dataset.testlaunch) r = await supabaseClient.rpc('duel_launch', { p_idx: +($('dev-land').value || 0) });
    else if (b.dataset.fund) r = await supabaseClient.rpc('duel_admin_fund_pot', { p_amount: +($('dev-fund').value || 0) });
    else if (b.dataset.addpts) { var v = $('dev-who').value.split('|'); r = await supabaseClient.rpc('duel_admin_add_points', { p_duel: +v[0], p_player: v[1], p_pts: +($('dev-pts').value || 0) }); }
    else return;
    var res = r && r.data; if (r && r.error) { toast('Erreur, réessaie.', true); return; }
    if (res && res.ok === false) toast(REASONS[res.error] || res.error, true); else toast('C\'est fait !');
    await refresh();
  }

  /* ---------- journal de la cagnotte : uniquement les défaites (burn), les Jokers et les versements mensuels ---------- */
  async function openPot(pot) {
    var tid = window.__myTeamId; if (!tid) return;
    var old = $('dz-pot-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'dz-pot-modal';
    m.innerHTML = '<div class="dz-modal-box dz-pot-box"><button class="dz-closex" id="dz-pot-x" title="Fermer" style="position:absolute;top:8px;right:8px;width:32px;height:32px"></button><div class="dz-modal-t">💰 Cagnotte de la team</div><div class="dz-pot-total">' + fmt(pot) + ' RPC</div><div id="dz-pot-list" class="dz-muted">Chargement…</div></div>';
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m || e.target.id === 'dz-pot-x') m.remove(); };
    var r = await supabaseClient.from('team_pot_tx').select('delta,reason,duel_id,created_at').eq('team_id', tid).neq('reason', 'Test admin').order('created_at', { ascending: false }).limit(100);
    var rows = r.data || [], ids = rows.map(function (x) { return x.duel_id; }).filter(function (x) { return x; }), duels = {};
    if (ids.length) { var dr = await supabaseClient.from('duels').select('id,attacker_team,defender_team').in('id', ids); (dr.data || []).forEach(function (d) { duels[d.id] = d; }); await loadTeams((dr.data || []).reduce(function (a, d) { return a.concat([d.attacker_team, d.defender_team]); }, [])); }
    var list = $('dz-pot-list'); if (!list) return;
    if (!rows.length) { list.textContent = 'Aucun mouvement pour l\'instant.'; return; }
    list.className = ''; list.innerHTML = rows.map(function (x) {
      var d = duels[x.duel_id], other = d ? team(d.attacker_team === tid ? d.defender_team : d.attacker_team).name : '', label;
      if (x.reason === 'Burn de défaite') label = 'Défaite ' + other;
      else if (x.reason === 'Joker') label = 'Joker ' + other;
      else label = 'Crédit ' + new Date(x.created_at).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'Europe/Paris' });
      var pos = x.delta > 0;
      return '<div class="dz-pot-row"><span>' + esc(label) + '</span><b style="color:' + (pos ? '#2ddb80' : '#ff6fae') + '">' + (pos ? '+ ' : '− ') + fmt(Math.abs(x.delta)) + ' RPC</b></div>';
    }).join('');
  }

  /* ---------- lancer un duel depuis la case atterrie (fenêtre « Case occupée » du Tour) ---------- */
  async function launch(idx) {
    if (!(S && S.enabled)) { toast('Les duels ne sont pas encore ouverts.', true); return; }
    var chk = await supabaseClient.rpc('duel_can_launch', { p_idx: idx });
    if (chk.error || !chk.data) { toast('Erreur, réessaie.', true); return; }
    if (chk.data.ok === false) { toast(REASONS[chk.data.error] || chk.data.error, true); return; }
    if (typeof askConfirm === 'function') {
      var ok = await askConfirm('Tu mises ta Land n°' + chk.data.stake + ' contre celle-ci.\nLe duel dure 72 h : les 2 Lands sont verrouillées.', { title: 'Lancer un duel ?', emoji: '⚔️', success: true, okLabel: 'Lancer', cancelLabel: 'Annuler' });
      if (!ok) return;
    }
    var r = await supabaseClient.rpc('duel_launch', { p_idx: idx });
    if (r.error || !r.data) { toast('Erreur, réessaie.', true); return; }
    if (r.data.ok === false) { toast(REASONS[r.data.error] || r.data.error, true); return; }
    if (window.Tour && Tour.closeRentModal) Tour.closeRentModal();
    await refresh(); open();
  }

  window.Duels = { openPot: openPot, init: init, open: open, close: close, launch: launch, refresh: refresh, renderTeamRow: renderTeamRow, updateBadge: updateBadge, enabled: function () { return !!(S && S.enabled); } };
})();
