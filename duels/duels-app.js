/* SPEEDIX — Duels de Land entre teams : écran de l'appli (branché sur les RPC de la base).
 * SOURCE UNIQUE des règles = la base (supabase/sql/2026-10-31-duels-de-land-base.sql). Ici on n'AFFICHE que ce que renvoient les fonctions
 * (duel_my_state, duel_launch, duel_join, duel_leave, duel_play_joker…) — jamais de règle recalculée côté appli.
 * Interrupteur : game_settings.duels_mode = 'off' | 'admin' | 'on'. Tant que ce n'est pas ouvert pour ce RP, le bouton DUEL est grisé. */
(function () {
  'use strict';
  var NOW_SKEW = 0, S = null, MAPDATA = null, TEAMS = {}, tab = 'duels', timer = null, inited = false, initing = false, finOpen = false;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return typeof escapeHtml === 'function' ? escapeHtml(String(x == null ? '' : x)) : String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n || 0).toLocaleString('fr-FR'); };
  var now = function () { return Date.now() + NOW_SKEW; };
  var REASONS = {
    not_logged_in: 'Connecte-toi pour jouer.', duels_off: 'Les duels ne sont pas encore ouverts.', bot: 'Tu ne peux pas lancer de duel sur cette Land.',
    land_inconnue: 'Land inconnue.', seules_les_locations_sont_en_jeu: 'Seules les Lands louées sont en jeu : les propriétés et les villes étapes sont à l\'abri.',
    land_en_pause: 'Cette Land vient de remporter un duel : elle est protégée 48 h.', pas_de_team: 'Il te faut une team pour lancer un duel.',
    land_sans_team: 'Cette Land n\'appartient à aucune team.', meme_team: 'C\'est une Land de ta propre team.', meme_famille: 'Cette Land est dans la même équipe que toi (T1 / T2) : pas de duel possible entre vous.', deja_engage: 'Tu es déjà engagé sur un duel. Un seul à la fois !',
    land_deja_en_duel: 'Cette Land est déjà en duel.', defenseur_deja_engage: 'Ce RP défend déjà un duel.', bail_arrive_a_echeance: 'Ton bail arrive à échéance, tu ne peux miser cette Land dans un duel.',
    aucune_location_a_miser: 'Il te faut au moins une Land en location à miser.', plafond_locations_atteint: 'Tu as atteint ta limite de locations (8 en Free).',
    cagnotte_insuffisante_pour_lancer: 'La cagnotte de ta team doit couvrir au moins le prix du Joker pour lancer un duel.',
    team_au_max_en_attaque: 'Ta team a déjà atteint son maximum de duels en attaque.', team_adverse_au_max_en_defense: 'Cette team défend déjà le maximum de duels.',
    mode_test_cibles_bots: 'Mode test : seules les Lands de bots peuvent être visées.', camp_complet: 'Ce camp est complet (3 RP maximum).', camp_complet_premium: 'Ce camp est complet (4 RP, le maximum avec un Premium).', pas_de_ta_team: 'Ce duel ne concerne pas ta team.',
    duel_termine: 'Le duel est terminé : les points sont figés.', duel_introuvable: 'Duel introuvable.', joker_pas_encore: 'Le Joker se joue à la fin du duel, dans l\'heure qui suit.',
    pas_capitaine: 'Seul le capitaine de la team peut jouer le Joker.', joker_deja_joue: 'Le Joker est déjà joué sur ce duel.', rien_a_eviter: 'Ton équipe n\'a pas de burn à éviter.',
    cagnotte_insuffisante: 'La cagnotte de la team est insuffisante pour ce Joker.', ne_peut_pas_quitter: 'Tu ne peux pas quitter ce duel (ta Land est en jeu).', pas_en_duel: 'Tu n\'es pas dans ce duel.', interdit: 'Action réservée.',
    prisonnier_pas_autorise: 'Seul le RP attaqué ou le capitaine peut jouer le Prisonnier.', prisonnier_deja_designe: 'Un prisonnier a déjà été désigné dans ce duel.', prisonnier_conditions: 'Les conditions du Prisonnier ne sont plus réunies.', prisonnier_cible: 'Ce RP ne peut pas être désigné.', prisonnier_ne_quitte_pas: 'Tu es prisonnier : tu ne peux plus quitter la partie.'
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
    if ((tab === 'map' || tab === 'rank') && $('dz-app') && $('dz-app').classList.contains('on')) { var mr = await supabaseClient.rpc('duel_map_data'); if (mr.data && mr.data.enabled) { MAPDATA = mr.data; await loadTeams(MAPDATA.teams.map(function (t) { return t.id; })); } }
    var ids = []; (S.duels || []).forEach(function (d) { ids.push(d.attacker_team, d.defender_team); }); ids.push(S.team_id);
    await loadTeams(ids);
    renderTeamRow(); updateBadge();
    if ($('dz-app') && $('dz-app').classList.contains('on')) render();
    showPrisonerNotice();
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
      '<div class="dz-tabs" id="dz-tabs"></div><div id="dz-pot-row"></div><div class="dz-body"><div class="dz-pane" id="p-map"><div id="dz-mapframe"><svg id="dz-map"></svg><div id="dz-mappot"></div><div id="dz-selchip"></div></div><div id="dz-side"></div></div><div class="dz-pane" id="p-rank"></div><div class="dz-pane" id="p-duels"></div><div class="dz-pane" id="p-notifs"></div><div class="dz-pane" id="p-hist"></div><div class="dz-pane" id="p-rules"></div></div>';
    document.body.appendChild(el);
    $('dz-close').onclick = close;
    $('dz-tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; if (tab === 'map' || tab === 'rank') MAPDATA = null; if (tab === 'duels') markSeen(); if (tab === 'notifs') supabaseClient.rpc('duel_mark_notifications_read'); render(); } };
    el.addEventListener('click', onAction);
  }
  function open() { shell(); $('dz-app').classList.add('on'); tab = 'map'; markSeen(); refresh().then(render); render(); }
  function close() { var e = $('dz-app'); if (e) e.classList.remove('on'); }

  // Classement des teams par nombre de Lands (propriétés + locations réunies : un seul total)
  async function paneRank() {
    if (!MAPDATA) { var mr = await supabaseClient.rpc('duel_map_data'); if (!mr.data || !mr.data.enabled) return; MAPDATA = mr.data; await loadTeams(MAPDATA.teams.map(function (t) { return t.id; })); }
    var T = (MAPDATA.teams || []).slice().sort(function (x, y) { return (y.n - x.n) || (x.id < y.id ? -1 : 1); });
    $('p-rank').innerHTML = '<div class="dz-list"><div class="dz-rank-head"><span></span><span></span><span>ÉQUIPE</span><span class="w">GAGNÉS</span><span class="l">PERDUS</span><span class="n">LANDS</span></div>' + (T.length ? T.map(function (t, i) {
      return '<div class="dz-rank-row' + (t.id === S.team_id ? ' me' : '') + '" data-rank-team="' + esc(t.id) + '"><b class="dz-rk">' + (i + 1) + '</b>' + logo(t.id) + '<span class="nm" style="color:' + esc(team(t.id).color) + '">' + esc(team(t.id).name) + '</span><b class="w">' + fmt(t.wins || 0) + '</b><b class="l">' + fmt(t.losses || 0) + '</b><b class="n">' + fmt(t.n) + '</b></div>';
    }).join('') : '<div class="dz-card dz-muted">Aucune team pour l\'instant.</div>') + '</div>';
  }

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
    var tiles = [['map', '🗺️', 'Carte', 0], ['duels', '⚔️', 'Duels', ((S.duels || []).filter(function (d) { return d.status === 'active' && (d.attacker_team === S.team_id || d.defender_team === S.team_id); })).length], ['notifs', '🔔', 'Notifs', notifN], ['hist', '🕓', 'Historique', 0], ['rank', '🏆', 'Classement', 0], ['rules', '📜', 'Règles', 0]];
    $('dz-tabs').innerHTML = tiles.map(function (t) { var cls = t[0] === 'rules' ? 'glass-gold' : tab === t[0] ? 'solid-green' : 'white'; return '<button class="tour-tile-btn ' + cls + '" data-tab="' + t[0] + '"><span class="tour-tile-border"></span><span class="tour-tile-fill"></span><span class="tour-tile-emoji">' + t[1] + '</span>' + t[2] + (t[3] ? '<b>' + t[3] + '</b>' : '') + '</button>'; }).join('');
    ['map', 'rank', 'duels', 'notifs', 'hist', 'rules'].forEach(function (t) { $('p-' + t).classList.toggle('on', t === tab); });
    renderPotRow();
    if (tab === 'map') await drawTeamMap();
    else if (tab === 'rank') await paneRank();
    else if (tab === 'duels') $('p-duels').innerHTML = paneDuels();
    else if (tab === 'hist') $('p-hist').innerHTML = paneHist();
    else if (tab === 'rules') $('p-rules').innerHTML = paneRules();
    else if (tab === 'notifs') { $('p-notifs').innerHTML = await paneNotifs(); }
  }

  function phaseOf(d) { var t = now(); return d.status !== 'active' ? 'done' : (t < Date.parse(d.end_at) ? 'fight' : 'decision'); }
  function sidePts(d, side) { return (d.members || []).filter(function (m) { return m.side === side; }).reduce(function (s, m) { return s + (m.pts || 0); }, 0); }
  function logo(id) {
    var t = team(id);
    try { if (typeof getBlasonIdx === 'function' && typeof AVAIL_BLASON_SMALL !== 'undefined') { var bi = getBlasonIdx(t); if (bi >= 0 && AVAIL_BLASON_SMALL[bi]) return '<img src="' + esc(AVAIL_BLASON_SMALL[bi]) + '" alt="">'; } } catch (e) {}
    return '<u style="display:inline-block;background:' + esc(t.color || '#334') + '"></u>';
  }
  // Flamme du burn : petit repère posé sur la barre, pile à la séparation vert / rose (comme le repère d'un tirage à la corde).
  function flame(att, def, ph) {
    if (ph !== 'fight' && ph !== 'decision') return '';
    var tot = att + def; if (!tot) return '';
    return '<span class="dz-flame" style="left:' + Math.min(97, Math.max(3, 100 * att / tot)).toFixed(1) + '%" title="Burn">🔥</span>';
  }
  function memberLine(m, prisonerId) { return '<div class="dz-mrow"><span' + (m.premium ? ' style="color:var(--gold)"' : '') + '>' + esc(m.username) + (m.premium ? '<span title="Premium" style="margin-left:.15rem;font-size:.7rem;line-height:1;display:inline-block">★</span>' : '') + (m.role === 'launcher' ? ' 🗡️' : m.role === 'holder' ? ' 🛡️' : '') + (prisonerId && m.player_id === prisonerId ? ' <span title="Prisonnier">🔒</span>' : '') + '</span><b>' + fmt(m.pts) + ' pts</b></div>'; }

  function duelCard(d) {
    var ph = phaseOf(d), L = d.loss || {}, R0 = ph === 'done' ? (d.result || {}) : {}, att = L.att != null ? L.att : R0.att != null ? R0.att : sidePts(d, 'att'), def = L.def != null ? L.def : R0.def != null ? R0.def : sidePts(d, 'def'), tot = Math.max(1, att + def);
    var meId = me(), mine = (d.members || []).filter(function (m) { return m.player_id === meId; })[0], myTeam = S.team_id;
    var cd = ph === 'fight' ? '⏳ ' + cdown(Date.parse(d.end_at) - now()) : ph === 'decision' ? '🏳️ Joker possible : ' + cdown(Date.parse(d.resolve_at) - now()) : '🏆 ' + esc(team(R0.winner === 'attackers' ? d.attacker_team : d.defender_team).name);
    var attMembers = (d.members || []).filter(function (m) { return m.side === 'att'; }), defMembers = (d.members || []).filter(function (m) { return m.side === 'def'; });
    var canJoin = ph === 'fight' && !mine && ((myTeam === d.attacker_team && attMembers.length < sideCap(attMembers)) || (myTeam === d.defender_team && defMembers.length < sideCap(defMembers))) && !(S.duels || []).some(function (x) { return x.status === 'active' && (x.members || []).some(function (m) { return m.player_id === meId; }); });
    var canLeave = ph === 'fight' && mine && mine.role === 'helper';
    var mySide = mine ? mine.side : (myTeam === d.attacker_team ? 'att' : myTeam === d.defender_team ? 'def' : null), isOurs = !!mySide, winning = isOurs ? (mySide === 'att' ? att > def : def >= att) : false;   // égalité : la défense l'emporte
    var h = '<div class="dz-card' + (isOurs ? ' mine ' + (winning ? 'win' : 'lose') : '') + '"><div class="dz-row"><span class="dz-tag ' + (ph === 'fight' || ph === 'decision' ? 'fight' : 'done') + '">' + (ph === 'fight' ? 'EN COURS' : ph === 'decision' ? 'SCORE FINAL' : 'TERMINÉ') + '</span><span class="dz-muted">Land n°' + d.stake_idx + ' vs n°' + d.target_idx + '</span></div>' +
      '<div class="dz-vs" style="margin-top:8px">' + logo(d.attacker_team) + '<div class="mid"><span class="l" style="color:' + esc(team(d.attacker_team).color) + '">' + esc(team(d.attacker_team).name) + '</span><span class="x">⚔️</span><span class="r" style="color:' + esc(team(d.defender_team).color) + '">' + esc(team(d.defender_team).name) + '</span></div>' + logo(d.defender_team) + '</div>' +
      '<div class="dz-barwrap">' + flame(att, def, ph) + '<div class="dz-bar"><i style="width:' + (att + def ? 100 * att / tot : 50) + '%;background:' + (att === def ? (att ? '#ff4d9d' : '#555a6b') : att > def ? '#2fe08a' : '#ff4d9d') + '"></i><i style="width:' + (att + def ? 100 * def / tot : 50) + '%;background:' + (att === def ? (att ? '#2fe08a' : '#555a6b') : def > att ? '#2fe08a' : '#ff4d9d') + '"></i></div></div>' +
      '<div class="dz-sc"><span>' + fmt(att) + '</span><span class="dz-muted" style="align-self:center">' + cd + '</span><span>' + fmt(def) + '</span></div>' +
      '<div class="dz-members"><div>' + attMembers.map(function (m) { return memberLine(m, d.prisoner_id); }).join('') + '</div><div>' + defMembers.map(function (m) { return memberLine(m, d.prisoner_id); }).join('') + '</div></div>';
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
      if (ph === 'fight' && d.prisoner_avail) cells += '<div class="dz-joincell" style="grid-column:2;grid-row:2"><button class="dz-btn dz-violet dz-prison" data-prison="' + d.id + '">🔒 Prisonnier</button></div>';   // MIROIR de _duel_prisoner_ok (base) : l\'appli n\'affiche que le verdict du serveur
      if (cells) h += '<div class="dz-losses">' + cells + '</div>';
    }
    return h + '</div>';
  }
  function paneDuels() {
    // Ordre : 1) le duel où JE suis engagé (cadre vert / rouge), 2) les duels de MA team, 3) tous les autres ; dans chaque groupe, ceux qui finissent le plus tôt d'abord
    var meId = me(), myT = S.team_id;
    var grp = function (d) { if ((d.members || []).some(function (m) { return m.player_id === meId; })) return 0; return d.attacker_team === myT || d.defender_team === myT ? 1 : 2; };
    var act = (S.duels || []).filter(function (d) { return d.status === 'active'; }).sort(function (x, y) { return (grp(x) - grp(y)) || (Date.parse(x.end_at) - Date.parse(y.end_at)); });
    // Duels terminés de la période (toutes les teams, filtrés sur period_start : remise à zéro à la rotation ; l'onglet Historique garde TOUS les duels de ma team) : tuile repliable sous les duels en cours
    var fin = (S.duels || []).filter(function (d) { return d.status === 'done' && (!S.period_start || Date.parse(d.resolve_at || d.end_at) >= Date.parse(S.period_start)); }).sort(function (x, y) { return Date.parse(y.end_at) - Date.parse(x.end_at); });
    return '<div class="dz-list">' + (act.length ? act.map(duelCard).join('') : '<div class="dz-card dz-muted">Aucun duel en cours. Pour en lancer un, tombe sur la Land d\'une autre team pendant ton Tour.</div>') +
      (fin.length ? '<div class="dz-fin' + (finOpen ? ' open' : '') + '"><button type="button" class="dz-fin-btn" data-fin="1"><span>✅ Duels terminés</span><b>' + fin.length + '</b></button>' + (finOpen ? fin.map(duelCard).join('') : '') + '</div>' : '') + '</div>';
  }
  function paneHist() {
    var done = (S.duels || []).filter(function (d) { return d.status === 'done' && (d.attacker_team === S.team_id || d.defender_team === S.team_id); });   // historique = MA team seulement (la tuile « Duels terminés » du mur montre ceux de toutes les teams)
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
      ['🔒 Le Prisonnier', ['Après 24 h, si la défense compte 30 % d\'écart de points avec l\'attaque et 100 pts / RP, elle peut faire prisonnier un RP adverse.', 'Les pts du prisonnier désigné sont alors bloqués sur les 24 dernières heures.', 'Un seul prisonnier par duel.']],
      ['🏳️ Joker', ['Pour éviter le burn, le capitaine peut poser un Joker.', 'Prix progressif du Joker : 1 000, 1 500 puis 2 000 RPC × nombre de RP.', 'En compensation, les RP du duel gagnant reçoivent des NYX offerts par le jeu en proportion de l\'écart de points.', '300 pts minimum / RP dans le duel pour les gagner.']]
    ];
    return '<div class="dz-list dz-rules-page">' + R.map(function (r) { return '<div class="rules-section"><h3>' + r[0] + '</h3><ul class="dz-rules">' + r[1].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>';
  }
  /* ---------- actions ---------- */
  function askJoker(id) {
    var d = (S.duels || []).filter(function (x) { return x.id === +id; })[0], burn = d && d.loss ? d.loss.paid : 0;
    var m = document.createElement('div'); m.id = 'dz-modal';
    m.innerHTML = '<div class="dz-modal-box"><div style="font-size:15px;line-height:1.5">Joue ton Joker (<b class="dz-yel">' + fmt(S.joker_price) + ' RPC</b>) pour éviter le burn de ta cagnotte (<b class="dz-yel">− ' + fmt(burn) + ' RPC</b>).</div><div class="dz-row" style="margin-top:16px;gap:10px"><button class="dz-btn" style="flex:1;text-transform:uppercase" data-cancel="1">Annuler</button><button class="dz-btn green" style="flex:1" data-confirmjoker="' + id + '">Jouer</button></div></div>';
    $('dz-app').appendChild(m);
  }
  /* ---------- Le Prisonnier ---------- */
  var PRISON_SVG = '<svg width="150" height="70" viewBox="0 0 150 70" style="display:block;margin:8px auto 12px"><defs><linearGradient id="dzpg" x1="0" x2="1"><stop offset="0" stop-color="#5b6078"/><stop offset=".5" stop-color="#c9cde0"/><stop offset="1" stop-color="#4a4f66"/></linearGradient><linearGradient id="dzph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9cde0"/><stop offset="1" stop-color="#4a4f66"/></linearGradient></defs><rect x="1" y="1" width="148" height="68" rx="14" fill="#07090f" stroke="#8a90a8" stroke-width="3"/>' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="' + (18 + i * 20) + '" y="8" width="7" height="54" rx="3" fill="url(#dzpg)"/>'; }).join('') + '<rect x="8" y="20" width="134" height="6" rx="3" fill="url(#dzph)"/><rect x="8" y="44" width="134" height="6" rx="3" fill="url(#dzph)"/></svg>';
  var prisonSel = null;
  function askPrisoner(id) {
    var old = $('dz-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'dz-modal';
    m.innerHTML = '<div class="dz-modal-box dz-duelc dz-prisonbox"><div class="dz-duelc-t">LE PRISONNIER</div>' + PRISON_SVG + '<div class="dz-duelc-msg" style="text-align:left">Ta team est attaquée et répond aux conditions suivantes :<div style="margin:6px 0 0 4px">▻ <b>+30 % d\'écart de points après 24 h</b><br>▻ <b>100 pts réalisés / RP</b></div><br>Tu peux faire prisonnier un RP adverse et bloquer ses points pour les 24 dernières heures !<br><br>Pour activer cette défense, ta team doit payer <b class="dz-yel">' + fmt(S.prisoner_price) + ' RPC</b> et choisir ensuite son prisonnier.</div><div class="dz-row" style="margin-top:16px;gap:10px"><button class="dz-btn" style="flex:1;text-transform:uppercase" data-cancel="1">Annuler</button><button class="dz-btn green" style="flex:1" data-prison-pay="' + id + '">Payer</button></div></div>';
    $('dz-app').appendChild(m);
  }
  function pickPrisoner(id, pid) {
    var d = (S.duels || []).filter(function (x) { return x.id === +id; })[0]; if (!d) return;
    prisonSel = { duel: +id, pid: pid || null };
    var rows = (d.members || []).filter(function (x) { return x.side === 'att'; }).map(function (x) {
      return '<button class="dz-prison-row' + (x.player_id === pid ? ' on' : '') + '" data-prison-pick="' + x.player_id + '"><span>' + (x.player_id === pid ? '◉' : '○') + ' &nbsp;' + esc(x.username) + '</span><b>' + fmt(x.pts) + ' pts</b></button>';
    }).join('');
    var m = $('dz-modal') || document.createElement('div'); m.id = 'dz-modal';
    m.innerHTML = '<div class="dz-modal-box dz-duelc dz-prisonbox"><div class="dz-duelc-t">LE PRISONNIER</div><div class="dz-duelc-msg" style="margin-bottom:12px">Choisis le RP que tu souhaites bloquer.</div>' + rows + '<div class="dz-row" style="margin-top:14px"><button class="dz-btn green" style="flex:1"' + (pid ? '' : ' disabled') + ' data-prison-go="' + id + '">Valider</button></div></div>';
    if (!m.parentNode) $('dz-app').appendChild(m);
  }
  // Écran du prisonnier : montré une seule fois (par appareil) dès que l'appli apprend qu'il est bloqué
  function showPrisonerNotice() {
    try {
      var meId = me(); if (!meId || !S || !S.duels) return;
      var d = S.duels.filter(function (x) { return x.status === 'active' && x.prisoner_id === meId; })[0]; if (!d) return;
      var key = 'dz-prisoner-seen-' + d.id; if (localStorage.getItem(key) || $('dz-prison-modal')) return;
      localStorage.setItem(key, '1');
      var m = document.createElement('div'); m.id = 'dz-prison-modal';
      m.innerHTML = '<div class="dz-modal-box dz-duelc dz-prisonbox" style="position:relative"><button class="dz-closex" id="dz-prison-x" title="Fermer" style="position:absolute;top:8px;right:8px;width:32px;height:32px;transform:none"></button><div class="dz-duelc-t">TU ES PRISONNIER</div>' + PRISON_SVG + '<div class="dz-duelc-msg" style="text-align:left">Tes points sont bloqués pour les 24 dernières heures du duel.<br><br>Tu ne peux plus quitter la partie.</div></div>';
      document.body.appendChild(m);
      m.onclick = function (e) { if (e.target === m || e.target.id === 'dz-prison-x') m.remove(); };
    } catch (e) { /* stockage indisponible : on n'affiche rien plutôt que de boucler */ }
  }
  async function onAction(e) {
    var rk = e.target.closest('[data-rank-team]');
    if (rk) { tab = 'map'; if (window.DuelsMap) DuelsMap.select(rk.dataset.rankTeam); render(); return; }   // clic sur une team du classement = on la montre sur la carte
    var b = e.target.closest('button'); if (!b) return; var r;
    if (b.dataset.fin) { finOpen = !finOpen; $('p-duels').innerHTML = paneDuels(); return; }   // tuile « Duels terminés » : l'état ouvert/fermé survit aux rafraîchissements
    if (b.dataset.cancel) { var m = $('dz-modal'); if (m) m.remove(); return; }
    if (b.dataset.prison) { askPrisoner(b.dataset.prison); return; }
    if (b.dataset.prisonPay) { pickPrisoner(b.dataset.prisonPay, null); return; }
    if (b.dataset.prisonPick) { pickPrisoner(prisonSel && prisonSel.duel, b.dataset.prisonPick); return; }
    if (b.dataset.join) r = await supabaseClient.rpc('duel_join', { p_duel: +b.dataset.join });
    else if (b.dataset.leave) r = await supabaseClient.rpc('duel_leave', { p_duel: +b.dataset.leave });
    else if (b.dataset.prisonGo) { if (!prisonSel || !prisonSel.pid) return; var m3 = $('dz-modal'); if (m3) m3.remove(); r = await supabaseClient.rpc('duel_play_prisoner', { p_duel: +b.dataset.prisonGo, p_target: prisonSel.pid }); prisonSel = null; }
    else if (b.dataset.joker) { askJoker(b.dataset.joker); return; }
    else if (b.dataset.confirmjoker) { var m2 = $('dz-modal'); if (m2) m2.remove(); r = await supabaseClient.rpc('duel_play_joker', { p_duel: +b.dataset.confirmjoker }); }
    else return;
    var res = r && r.data; if (r && r.error) { toast('Erreur, réessaie.', true); return; }
    if (res && res.ok === false) toast(REASONS[res.error] || res.error, true); else toast('C\'est fait !');
    await refresh();
  }

  /* ---------- journal de la cagnotte : uniquement les défaites (burn), les Jokers et les versements mensuels ---------- */
  async function openPot(pot) {
    var tid = S && S.team_id; if (!tid) return;   // cagnotte de la FAMILLE de team (T1 + T2)
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
  // Fenêtre de confirmation avant de lancer un duel : épées croisées + message clair (promesse : true = lancer, false = annuler)
  var SWORDS = '<svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true" style="filter:drop-shadow(0 0 8px rgba(228,84,255,.75))"><defs><linearGradient id="dzbl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dfe3f2"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#aeb6d2"/></linearGradient></defs>' +
    ['45', '-45'].map(function (ang) { return '<g transform="rotate(' + ang + ' 32 32)"><path d="M32 3 L36.5 38 L27.5 38 Z" fill="url(#dzbl)" stroke="#e454ff" stroke-width="1.2" stroke-linejoin="round"/><rect x="20" y="38" width="24" height="4.5" rx="2" fill="#e454ff"/><rect x="29.5" y="42.5" width="5" height="12" rx="2" fill="#7a4fd0" stroke="#e454ff" stroke-width="1"/><circle cx="32" cy="57" r="3.2" fill="#e454ff"/></g>'; }).join('') + '</svg>';
  function confirmDuel(name) {
    return new Promise(function (resolve) {
      var old = $('dz-modal'); if (old) old.remove();
      var m = document.createElement('div'); m.id = 'dz-modal';
      m.innerHTML = '<div class="dz-modal-box dz-duelc"><div class="dz-duelc-img">' + SWORDS + '</div><div class="dz-duelc-t">DUEL</div><div class="dz-duelc-msg">Tu es sur le point de défier <b>' + esc(name || 'ce RP') + '</b> dans le but de lui prendre sa Land. En contrepartie, tu mets en jeu une de tes Lands en location. Veux-tu faire un duel avec ce RP ?</div><div class="dz-row" style="margin-top:16px;gap:10px"><button class="dz-btn" style="flex:1;text-transform:uppercase" id="dzc-no">Annuler</button><button class="dz-btn green" style="flex:1;text-transform:uppercase" id="dzc-yes">Lancer</button></div></div>';
      document.body.appendChild(m);
      var done = function (v) { m.remove(); resolve(v); };
      $('dzc-no').onclick = function () { done(false); }; $('dzc-yes').onclick = function () { done(true); };
      m.onclick = function (e) { if (e.target === m) done(false); };
    });
  }

  async function launch(idx, name) {
    if (!(S && S.enabled)) { toast('Les duels ne sont pas encore ouverts.', true); return; }
    var chk = await supabaseClient.rpc('duel_can_launch', { p_idx: idx });
    if (chk.error || !chk.data) { toast('Erreur, réessaie.', true); return; }
    if (chk.data.ok === false) { toast(REASONS[chk.data.error] || chk.data.error, true); return; }
    if (!name) { // nom du RP visé : repli si l'appelant ne l'a pas fourni
      var h = await supabaseClient.from('tour_lands').select('holder_id').eq('idx', idx).maybeSingle();
      if (h.data && h.data.holder_id) { var pl = await supabaseClient.from('players').select('username').eq('id', h.data.holder_id).maybeSingle(); if (pl.data) name = pl.data.username; }
    }
    if (!(await confirmDuel(name))) return;
    var r = await supabaseClient.rpc('duel_launch', { p_idx: idx });
    if (r.error || !r.data) { toast('Erreur, réessaie.', true); return; }
    if (r.data.ok === false) { toast(REASONS[r.data.error] || r.data.error, true); return; }
    if (window.Tour && Tour.closeRentModal) Tour.closeRentModal();
    await refresh(); open();
  }

  window.Duels = { openPot: openPot, init: init, open: open, close: close, launch: launch, refresh: refresh, renderTeamRow: renderTeamRow, updateBadge: updateBadge, enabled: function () { return !!(S && S.enabled); } };
})();
