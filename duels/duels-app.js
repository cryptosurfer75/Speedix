/* SPEEDIX — Duels de Land entre teams : écran de l'appli (branché sur les RPC de la base).
 * SOURCE UNIQUE des règles = la base (supabase/sql/2026-10-31-duels-de-land-base.sql). Ici on n'AFFICHE que ce que renvoient les fonctions
 * (duel_my_state, duel_launch, duel_join, duel_leave, duel_play_joker…) — jamais de règle recalculée côté appli.
 * Interrupteur : game_settings.duels_mode = 'off' | 'admin' | 'on'. Tant que ce n'est pas ouvert pour ce RP, le bouton DUEL est grisé. */
(function () {
  'use strict';
  var NOW_SKEW = 0, handOrder = null, handSig = '', CARDS = null, cardsMissing = false, cardSel = null, S = null, MAPDATA = null, TEAMS = {}, tab = 'duels', timer = null, inited = false, initing = false, finOpen = false;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return typeof escapeHtml === 'function' ? escapeHtml(String(x == null ? '' : x)) : String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n || 0).toLocaleString(LOC()); };
  var now = function () { return Date.now() + NOW_SKEW; };
  var dzT = window.dzT || function (s) { return s; }, LOC = function () { return (typeof SPEEDIX_LANG !== 'undefined' && SPEEDIX_LANG === 'en') ? 'en-GB' : 'fr-FR'; };
  var REASONS = {
    not_logged_in: dzT('Connecte-toi pour jouer.'), duels_off: dzT('Les duels ne sont pas encore ouverts.'), bot: dzT('Tu ne peux pas lancer de duel sur cette Land.'),
    land_inconnue: dzT('Land inconnue.'), seules_les_locations_sont_en_jeu: dzT('Seules les Lands louées sont en jeu : les propriétés et les villes étapes sont à l\'abri.'),
    land_en_pause: dzT('Cette Land vient de remporter un duel : elle est protégée 48 h.'), pas_de_team: dzT('Il te faut une team pour lancer un duel.'),
    land_sans_team: dzT('Cette Land n\'appartient à aucune team.'), meme_team: dzT('C\'est une Land de ta propre team.'), meme_famille: dzT('Cette Land est dans la même équipe que toi (T1 / T2) : pas de duel possible entre vous.'), deja_engage: dzT('Tu es déjà engagé sur un duel. Un seul à la fois !'),
    land_deja_en_duel: dzT('Cette Land est déjà en duel.'), defenseur_deja_engage: dzT('Ce RP défend déjà un duel.'), defenseur_en_infirmerie: dzT('Ce RP est en infirmerie : on ne peut pas tirer sur l\'ambulance, attaque impossible.'), bail_arrive_a_echeance: dzT('Ton bail arrive à échéance, tu ne peux miser cette Land dans un duel.'),
    aucune_location_a_miser: dzT('Il te faut au moins une Land en location à miser.'), plafond_locations_atteint: dzT('Tu as atteint ta limite de locations (8 en Free).'),
    cagnotte_insuffisante_pour_lancer: dzT('La cagnotte de ta team doit couvrir au moins le prix du Joker pour lancer un duel.'),
    team_au_max_en_attaque: dzT('Ta team a déjà atteint son maximum de duels en attaque.'), team_adverse_au_max_en_defense: dzT('Cette team défend déjà le maximum de duels.'),
    mode_test_cibles_bots: dzT('Mode test : seules les Lands de bots peuvent être visées.'), camp_complet: dzT('Ce camp est complet.'), camp_complet_premium: dzT('Ce camp est complet.'), pas_de_ta_team: dzT('Ce duel ne concerne pas ta team.'),
    duel_termine: dzT('Le duel est terminé : les points sont figés.'), duel_introuvable: dzT('Duel introuvable.'), joker_pas_encore: dzT('Le Joker se joue à la fin du duel, dans l\'heure qui suit.'),
    pas_capitaine: dzT('Seul le capitaine de la team peut jouer le Joker.'), joker_deja_joue: dzT('Le Joker est déjà joué sur ce duel.'), rien_a_eviter: dzT('Ton équipe n\'a pas de burn à éviter.'),
    cagnotte_insuffisante: dzT('La cagnotte de la team est insuffisante pour ce Joker.'), ne_peut_pas_quitter: dzT('Tu ne peux pas quitter ce duel (ta Land est en jeu).'), pas_en_duel: dzT('Tu n\'es pas dans ce duel.'), interdit: dzT('Action réservée.'),
    prisonnier_ne_quitte_pas: dzT('Tu es bloqué par la carte Prison : tu ne peux pas quitter le duel.')
  };
  // Cartes de duel (messages renvoyés par duel_play_card)
  REASONS.cartes_off = dzT('Les cartes ne sont pas encore ouvertes.'); REASONS.carte_introuvable = dzT('Cette carte n\'est plus dans ton stock.');
  REASONS.carte_deja_jouee_par_toi = dzT('Tu as déjà joué une carte dans ce duel.'); REASONS.carte_deja_jouee_equipe = dzT('Ton équipe a déjà joué cette carte dans ce duel.');
  REASONS.chronos_deja_jouee = dzT('Chronos a déjà été jouée dans ce duel.'); REASONS.flash_hors_delai = dzT('Flash : jouable seulement dans les 24 premières heures.');
  REASONS.cible_requise = dzT('Choisis le RP adverse à bloquer.'); REASONS.cible_invalide = dzT('Ce RP ne peut pas être bloqué.'); REASONS.cible_seule = dzT('Tu ne peux pas bloquer le seul RP de l\'équipe adverse.');
  function toast(msg, bad) {
    var d = document.createElement('div'); d.className = 'dz-toast' + (bad ? ' bad' : ''); d.textContent = msg; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3800);
  }
  function cdown(ms) { ms = Math.max(0, ms); var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h + ' h ' + (m < 10 ? '0' : '') + m + ' min'; }
  function fmtDate(t) { return new Date(t).toLocaleString(LOC(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function me() { return currentUser && currentUser.id; }
  // MIROIR de _duel_side_cap (base) : 3 RP par camp, 4 si le camp compte un Premium (ou si moi, qui rejoins, je le suis)
  function sideCap(members, d, side) { var base = (typeof isPremium === 'function' && isPremium()) || members.some(function (m) { return m.premium; }) ? 4 : 3; var helps = (d && d.plays || []).filter(function (p) { return p.card === 'help' && members.concat(d.members || []).some(function (m) { return m.player_id === p.player_id && m.side === side; }); }).length; return base + helps; }
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
    await loadCards();
    renderTeamRow(); updateBadge();
    if ($('dz-app') && $('dz-app').classList.contains('on')) render();
    showWheel();
    return S;
  }
  async function init() {
    if (inited || initing || !currentUser) return; initing = true;
    try { await refresh(); inited = true; } catch (e) { console.warn('[duels] init', e); }
    initing = false;
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState !== 'hidden') refresh(); }, 60000);
    setInterval(function () { document.querySelectorAll('[data-cd-until]').forEach(function (e) { e.textContent = cdHMS(Date.parse(e.dataset.cdUntil) - now()); }); }, 1000);   // comptes à rebours Prison en direct
  }

  /* ---------- tuile DUEL de la page SPEEDIX Tour (à côté de la CAGNOTTE du Tour) ---------- */
  function renderTeamRow() {
    var host = $('tour-duel-tile'); if (!host) return;
    var tid = window.__myTeamId;
    if (!tid) { host.style.display = 'none'; return; }
    var on = !!(S && S.enabled);
    host.style.display = ''; host.style.opacity = on ? '1' : '.4'; host.style.cursor = on ? 'pointer' : 'not-allowed';
    host.title = on ? '' : dzT('Bientôt disponible');
    host.onclick = on ? function () { open(); } : null;
  }
  // cagnotte de la team : affichée dans l'écran Duel (clic = journal des mouvements)
  function renderPotRow() {
    var host = $('dz-pot-row'); if (!host || !S) return;
    host.innerHTML = '<div class="dz-pot" id="dz-pot-tile" title="' + dzT('Voir les mouvements') + '"><small>💰 ' + dzT('CAGNOTTE DE LA TEAM') + '</small><b>' + fmt(S.pot) + ' RPC</b></div>';
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
    // La tuile Tour est enveloppée dans un cadre biseauté (clip-path) : une pastille posée DANS ce cadre est rognée au coin (cas vu le 11/11/2026). On l'ancre sur le conteneur NON clippé juste au-dessus, comme les pastilles Feed/Cash Run.
    if (wrap.id === 'tab-lands-outer' && wrap.parentElement) wrap = wrap.parentElement;
    var b = $('duel-tour-badge');
    if (!b) { b = document.createElement('div'); b.id = 'duel-tour-badge'; b.style.cssText = "display:none;position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#ff4444;border:2px solid #020408;box-sizing:border-box;font-size:.55rem;font-weight:700;color:#fff;font-family:'Space Mono',monospace;align-items:center;justify-content:center;pointer-events:none"; wrap.appendChild(b); }
    var seen = getSeen(), n = ((S && S.duels) || []).filter(function (d) { return d.status === 'active' && isMyLandTargeted(d) && seen.indexOf(d.id) < 0; }).length;
    b.textContent = n > 9 ? '9+' : n;
    if (typeof _setBadgeBlink === 'function') _setBadgeBlink('duel-tour-badge', n > 0, '#ff4444', 'flex'); else b.style.display = n > 0 ? 'flex' : 'none';
  }

  var SYM_SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<symbol id="dzs-chronos" viewBox="0 0 40 40"><path d="M10 5H30V9H27C27 16 22 18 20 20C22 22 27 24 27 31H30V35H10V31H13C13 24 18 22 20 20C18 18 13 16 13 9H10Z" fill="#f5c842" stroke="#2a1a00" stroke-width="2" stroke-linejoin="round"/></symbol>' +
    '<symbol id="dzs-help" viewBox="0 0 40 40"><g fill="#ffd9e6" stroke="#4a0a22" stroke-width="1.8"><circle cx="20" cy="13" r="6"/><path d="M8 33C8 24 13 21 20 21S32 24 32 33Z"/><circle cx="8" cy="17" r="4.2"/><circle cx="32" cy="17" r="4.2"/></g></symbol>' +
    '<symbol id="dzs-flash" viewBox="0 0 40 40"><polygon points="20,3 25,15 38,16 28,24 31,37 20,30 9,37 12,24 2,16 15,15" fill="#ffd54a" stroke="#4a2600" stroke-width="2" stroke-linejoin="round"/></symbol>' +
    '<symbol id="dzs-power" viewBox="0 0 40 40"><g fill="none" stroke="#e9d4ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21L20 10L33 21"/><path d="M7 33L20 22L33 33"/></g></symbol>' +
    '<symbol id="dzs-prison" viewBox="0 0 40 40"><path d="M12 18V13a8 8 0 0 1 16 0V18" fill="none" stroke="#f1f3fb" stroke-width="4.5" stroke-linecap="round"/><rect x="7" y="17" width="26" height="19" rx="4" fill="#f1f3fb" stroke="#222638" stroke-width="2"/><circle cx="20" cy="25.5" r="3" fill="#222638"/><path d="M18.6 27h2.8l1 6h-4.8z" fill="#222638"/></symbol>' +
    '</defs></svg>';

  /* ---------- écran ---------- */
  function shell() {
    if ($('dz-app')) return;
    var el = document.createElement('div'); el.id = 'dz-app';
    el.innerHTML = '<div class="dz-head"><div class="dz-head-row"><div style="width:40px;flex-shrink:0"></div><div class="dz-head-title"><img src="league-title-chevron-left.webp" alt=""><div class="dz-ttl">DUEL <span style="color:#f5c842">TEAM</span></div><img src="league-title-chevron-right.webp" alt=""></div><button class="dz-closex" id="dz-close" title="Fermer"></button></div><div class="dz-head-line"></div></div>' +
      '<div class="dz-tabs" id="dz-tabs"></div><div id="dz-pot-row"></div><div class="dz-body"><div class="dz-pane" id="p-map"><div id="dz-mapframe"><svg id="dz-map"></svg><div id="dz-mappot"></div><div id="dz-selchip"></div></div><div id="dz-side"></div></div><div class="dz-pane" id="p-rank"></div><div class="dz-pane" id="p-duels"></div><div class="dz-pane" id="p-notifs"></div><div class="dz-pane" id="p-hist"></div><div class="dz-pane" id="p-rules"></div></div>';
    el.insertAdjacentHTML('afterbegin', SYM_SPRITE);
    document.body.appendChild(el);
    $('dz-close').onclick = close;
    $('dz-tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; if (tab === 'map' || tab === 'rank') MAPDATA = null; if (tab === 'duels') markSeen(); if (tab === 'notifs') supabaseClient.rpc('duel_mark_notifications_read'); render(); } };
    // kiosque des cartes : on balaie le doigt pour amener une autre carte au centre
    var sx = null, swiped = false;
    el.addEventListener('pointerdown', function (e) { sx = e.target.closest && e.target.closest('.dz-hand') ? e.clientX : null; swiped = false; });
    el.addEventListener('pointerup', function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) { swiped = true; moveHand(dx < 0 ? 1 : -1); } });
    el.addEventListener('click', function (e) { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);
    el.addEventListener('click', onAction);
  }
  function open() { shell(); $('dz-app').classList.add('on'); tab = 'map'; markSeen(); refresh().then(render); render(); }
  function close() { var e = $('dz-app'); if (e) e.classList.remove('on'); }

  // Classement des teams par nombre de Lands (propriétés + locations réunies : un seul total)
  async function paneRank() {
    if (!MAPDATA) { var mr = await supabaseClient.rpc('duel_map_data'); if (!mr.data || !mr.data.enabled) return; MAPDATA = mr.data; await loadTeams(MAPDATA.teams.map(function (t) { return t.id; })); }
    var T = (MAPDATA.teams || []).slice().sort(function (x, y) { return (y.n - x.n) || (x.id < y.id ? -1 : 1); });
    $('p-rank').innerHTML = '<div class="dz-list"><div class="dz-rank-head"><span></span><span></span><span>' + dzT('ÉQUIPE') + '</span><span class="w">' + dzT('GAGNÉS') + '</span><span class="l">' + dzT('PERDUS') + '</span><span class="n">LANDS</span></div>' + (T.length ? T.map(function (t, i) {
      return '<div class="dz-rank-row' + (t.id === S.team_id ? ' me' : '') + '" data-rank-team="' + esc(t.id) + '"><b class="dz-rk">' + (i + 1) + '</b>' + logo(t.id) + '<span class="nm" style="color:' + esc(team(t.id).color) + '">' + esc(team(t.id).name) + '</span><b class="w">' + fmt(t.wins || 0) + '</b><b class="l">' + fmt(t.losses || 0) + '</b><b class="n">' + fmt(t.n) + '</b></div>';
    }).join('') : '<div class="dz-card dz-muted">' + dzT('Aucune team pour l\'instant.') + '</div>') + '</div>';
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
    var tiles = [['map', '🗺️', dzT('Carte'), 0], ['duels', '⚔️', dzT('Duels'), ((S.duels || []).filter(function (d) { return d.status === 'active' && (d.attacker_team === S.team_id || d.defender_team === S.team_id); })).length], ['notifs', '🔔', dzT('Notifs'), notifN], ['hist', '🕓', dzT('Historique'), 0], ['rank', '🏆', dzT('Classement'), 0], ['rules', '📜', dzT('Règles'), 0]];
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
  // Bande « carte jouée » sous le RP concerné : symbole + nom de la carte + chiffre à droite. Power / Help / Flash : sous celui qui la joue ; Prison : sous le RP bloqué (compte à rebours). Chronos : affiché au bout de l'heure de fin.
  var SYM = { chronos: 'chronos', help: 'help', flash: 'flash', power: 'power', prison: 'prison' };
  function bandVal(p) {
    if (p.card === 'power') return '+' + fmt(p.value);
    if (p.card === 'flash') return '+' + fmt(p.value || 400);
    if (p.card === 'help') return '+1 RP';
    if (p.card === 'prison') return '<span data-cd-until="' + esc(p.until) + '">' + cdHMS(Date.parse(p.until) - now()) + '</span>';
    return '';
  }
  function cdHMS(ms) { ms = Math.max(0, ms); var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), z = function (n) { return (n < 10 ? '0' : '') + n; }; return z(h) + ':' + z(m) + ':' + z(s); }
  function bandsFor(d, m) {
    var out = '';
    (d.plays || []).forEach(function (p) {
      if (p.card === 'chronos' || !CARDS_DEF[p.card]) return;
      var pid = p.card === 'prison' ? p.target : p.player_id; if (pid !== m.player_id) return;
      out += '<div class="dz-band" style="--c:' + CARDS_DEF[p.card].c + '"><svg viewBox="0 0 40 40"><use href="#dzs-' + SYM[p.card] + '"/></svg><b>' + CARDS_DEF[p.card].n + '</b><span>' + bandVal(p) + '</span></div>';
    });
    return out;
  }
  function isFrozen(d, m) { return (d.plays || []).some(function (p) { return p.card === 'prison' && p.target === m.player_id && Date.parse(p.until) > now(); }); }
  function memberLine(m, d) { return '<div class="dz-mblock"><div class="dz-mrow"><span' + (m.premium ? ' style="color:var(--gold)"' : '') + '>' + esc(m.username) + (m.premium ? '<span title="Premium" style="margin-left:.15rem;font-size:.7rem;line-height:1;display:inline-block">★</span>' : '') + (m.role === 'launcher' ? ' 🗡️' : m.role === 'holder' ? ' 🛡️' : '') + '</span><b' + (d && isFrozen(d, m) ? ' class="dz-frozen"' : '') + '>' + fmt(m.pts) + '</b></div>' + (d ? bandsFor(d, m) : '') + '</div>'; }

  function duelCard(d) {
    var ph = phaseOf(d), L = d.loss || {}, R0 = ph === 'done' ? (d.result || {}) : {}, att = L.att != null ? L.att : R0.att != null ? R0.att : sidePts(d, 'att'), def = L.def != null ? L.def : R0.def != null ? R0.def : sidePts(d, 'def'), tot = Math.max(1, att + def);
    var meId = me(), mine = (d.members || []).filter(function (m) { return m.player_id === meId; })[0], myTeam = S.team_id;
    var chr = (d.plays || []).some(function (p) { return p.card === 'chronos'; }) ? ' <b class="dz-chr">+24 h</b>' : '';
    var cd = ph === 'fight' ? '⏳ ' + cdown(Date.parse(d.end_at) - now()) + chr : ph === 'decision' ? '🏳️ ' + dzT('Joker possible :') + ' ' + cdown(Date.parse(d.resolve_at) - now()) : '🏆 ' + esc(team(R0.winner === 'attackers' ? d.attacker_team : d.defender_team).name);
    // en première ligne : le RP qui attaque (🗡️) face au RP qui défend (🛡️) ; les renforts viennent ensuite, dans l'ordre d'arrivée (l'ordre ne bouge plus quand un RP arrive)
    var rk = function (m) { return m.role === 'launcher' || m.role === 'holder' ? 0 : 1; }, byRole = function (x, y) { return rk(x) - rk(y); };
    var attMembers = (d.members || []).filter(function (m) { return m.side === 'att'; }).sort(byRole), defMembers = (d.members || []).filter(function (m) { return m.side === 'def'; }).sort(byRole);
    var canJoin = ph === 'fight' && !mine && ((myTeam === d.attacker_team && attMembers.length < sideCap(attMembers, d, 'att')) || (myTeam === d.defender_team && defMembers.length < sideCap(defMembers, d, 'def'))) && !(S.duels || []).some(function (x) { return x.status === 'active' && (x.members || []).some(function (m) { return m.player_id === meId; }); });
    var canLeave = ph === 'fight' && mine && mine.role === 'helper';
    var mySide = mine ? mine.side : (myTeam === d.attacker_team ? 'att' : myTeam === d.defender_team ? 'def' : null), isOurs = !!mySide, winning = isOurs ? (mySide === 'att' ? att > def : def >= att) : false;   // égalité : la défense l'emporte
    var h = '<div class="dz-card' + (isOurs ? ' mine ' + (winning ? 'win' : 'lose') : '') + '"><div class="dz-row"><span class="dz-tag ' + (ph === 'fight' || ph === 'decision' ? 'fight' : 'done') + '">' + (ph === 'fight' ? dzT('EN COURS') : ph === 'decision' ? dzT('SCORE FINAL') : dzT('TERMINÉ')) + '</span><span class="dz-muted">' + dzT('Land n°{a} vs n°{b}', { a: d.stake_idx, b: d.target_idx }) + '</span></div>' +
      '<div class="dz-vs" style="margin-top:8px">' + logo(d.attacker_team) + '<div class="mid"><span class="l" style="color:' + esc(team(d.attacker_team).color) + '">' + esc(team(d.attacker_team).name) + '</span><span class="x">⚔️</span><span class="r" style="color:' + esc(team(d.defender_team).color) + '">' + esc(team(d.defender_team).name) + '</span></div>' + logo(d.defender_team) + '</div>' +
      '<div class="dz-barwrap">' + flame(att, def, ph) + '<div class="dz-bar"><i style="width:' + (att + def ? 100 * att / tot : 50) + '%;background:' + (att === def ? (att ? '#ff4d9d' : '#555a6b') : att > def ? '#2fe08a' : '#ff4d9d') + '"></i><i style="width:' + (att + def ? 100 * def / tot : 50) + '%;background:' + (att === def ? (att ? '#2fe08a' : '#555a6b') : def > att ? '#2fe08a' : '#ff4d9d') + '"></i></div></div>' +
      '<div class="dz-sc"><span>' + fmt(att) + '</span><span class="dz-muted" style="align-self:center">' + cd + '</span><span>' + fmt(def) + '</span></div>' +
      '<div class="dz-members"><div>' + attMembers.map(function (m) { return memberLine(m, d); }).join('') + '</div><div>' + defMembers.map(function (m) { return memberLine(m, d); }).join('') + '</div></div>';
    if (ph !== 'done') {
      var cells = '', burnCol = 0, delta = L.delta || 0;
      if (delta > 0) {
        var loserIsAtt = L.loser_team === d.attacker_team; burnCol = loserIsAtt ? 1 : 2;
        var jk = '';
        if (ph === 'decision' && S.is_captain && L.loser_team === myTeam && !L.joker) jk = '<button class="dz-btn green" style="margin-top:8px;width:100%" data-joker="' + d.id + '">' + dzT('Joker') + ' · ' + fmt(S.joker_price) + ' RPC</button>';
        var body = L.joker ? '<div class="dz-loss-t">🏳️ ' + dzT('Joker joué') + '</div><div class="dz-muted">' + dzT('0 RPC brûlé ({n} RPC dépensés)', { n: fmt(d.joker_price) }) + '</div>'
          : '<div class="dz-loss-t">🔥 <b class="dz-burn-w">BURN</b> <span class="dz-yel">' + fmt(L.raw) + ' RPC</span></div><div class="dz-muted">' + fmt(delta) + ' pts × 20 RPC</div>';
        cells += '<div class="dz-loss" style="grid-column:' + burnCol + '">' + body + jk + '</div>';
      }
      var btn = canJoin ? '<button class="dz-btn green" data-join="' + d.id + '">' + dzT('Rejoindre le duel') + '</button>' : canLeave ? '<button class="dz-btn green" data-leave="' + d.id + '">' + dzT('Quitter') + '</button>' : '';
      if (btn) cells += '<div class="dz-joincell" style="grid-column:' + (burnCol === 1 ? 2 : 1) + ';grid-row:1">' + btn + '</div>';
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
    return '<div class="dz-list">' + cardsBlock() + (act.length ? act.map(duelCard).join('') : '<div class="dz-card dz-muted">' + dzT('Aucun duel en cours. Pour en lancer un, tombe sur la Land d\'une autre team pendant ton Tour.') + '</div>') +
      (fin.length ? '<div class="dz-fin' + (finOpen ? ' open' : '') + '"><button type="button" class="dz-fin-btn" data-fin="1"><span>✅ ' + dzT('Duels terminés') + '</span><b>' + fin.length + '</b></button>' + (finOpen ? fin.map(duelCard).join('') : '') + '</div>' : '') + '</div>';
  }
  function paneHist() {
    var done = (S.duels || []).filter(function (d) { return d.status === 'done' && (d.attacker_team === S.team_id || d.defender_team === S.team_id); });   // historique = MA team seulement (la tuile « Duels terminés » du mur montre ceux de toutes les teams)
    if (!done.length) return '<div class="dz-list"><div class="dz-card dz-muted">' + dzT('Aucun duel terminé pour l\'instant.') + '</div></div>';
    return '<div class="dz-list">' + done.map(function (d) {
      var r = d.result || {}, pen = r.penalty || {}, myT = S.team_id, att = d.attacker_team === myT, won = (r.winner === 'attackers') === att, lines = '';
      if (pen.delta && pen.loser_team === myT) lines += '<div class="dz-loss">' + (pen.joker ? '<div class="dz-loss-t">🏳️ ' + dzT('Joker joué') + '</div><div class="dz-muted">' + dzT('0 RPC brûlé ({n} RPC dépensés)', { n: fmt(d.joker_price) }) + '</div>' : '<div class="dz-loss-t">🔥 <b class="dz-burn-w">BURN</b> <span class="dz-yel">' + fmt(pen.paid) + ' RPC</span></div><div class="dz-muted">' + fmt(pen.delta) + ' ' + dzT('pts d\'écart × 20 RPC') + '</div>') + '</div>';
      var gain = (r.nyx || []).filter(function (x) { return x.player === me(); });
      if (gain.length) lines += '<div class="dz-loss"><div class="dz-loss-t">🎁 ' + dzT('Joker adverse') + '</div><div class="dz-muted">+' + gain[0].nyx + ' NYX</div></div>';
      return '<div class="dz-card"><div class="dz-row"><span class="dz-tag ' + (won ? 'done' : 'fight') + '">' + (won ? dzT('VICTOIRE') : dzT('DÉFAITE')) + '</span><span class="dz-muted">' + dzT('Land n°{a} vs n°{b}', { a: d.stake_idx, b: d.target_idx }) + ' · ' + fmtDate(d.resolve_at) + '</span></div>' +
        '<div class="dz-vs" style="margin-top:8px">' + logo(d.attacker_team) + '<div class="mid"><span class="l" style="color:' + esc(team(d.attacker_team).color) + '">' + esc(team(d.attacker_team).name) + '</span><span class="x">⚔️</span><span class="r" style="color:' + esc(team(d.defender_team).color) + '">' + esc(team(d.defender_team).name) + '</span></div>' + logo(d.defender_team) + '</div>' +
        '<div class="dz-sc"><span>' + fmt(r.att) + '</span><span></span><span>' + fmt(r.def) + '</span></div>' + (lines ? '<div class="dz-losses" style="grid-template-columns:1fr">' + lines + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  async function paneNotifs() {
    var r = await supabaseClient.from('duel_notifications').select('kind,text,created_at,read_at').eq('player_id', me()).order('created_at', { ascending: false }).limit(40);
    var ns = r.data || []; window.__duelUnread = 0;
    return '<div class="dz-list">' + (ns.length ? ns.map(function (n) { return '<div class="dz-notif ' + esc(n.kind) + '">' + esc(n.text) + '<small>' + fmtDate(n.created_at) + '</small></div>'; }).join('') : '<div class="dz-card dz-muted">' + dzT('Aucune notification.') + '</div>') + '</div>';
  }
  function paneRules() {
    var R = [
      [dzT('⚔️ Tu peux lancer un duel si :'), [dzT('Tu tombes sur la Land d\'une autre team'), dzT('Tu as au moins une Land en location'), dzT('Tu n\'as pas atteint ta limite de locations (8 en Free)'), dzT('La cagnotte couvre au moins le prix du Joker')]],
      [dzT('⏱️ Déroulé'), [dzT('72 h pour gagner le duel.'), dzT('Seuls les points gagnés au départ du duel comptent.'), dzT('Les 2 Lands mises en jeu sont verrouillées.'), dzT('Une Land ne peut être attaquée à nouveau qu\'après une pause de 48 h.'), dzT('Pas de duel sur les Lands en propriété.')]],
      [dzT('👥 Les équipes'), [dzT('3 RP maximum par duel + 1 Premium.'), dzT('Un RP ne peut jouer qu\'un duel à la fois.'), dzT('Un RP libre peut rejoindre un duel comme renfort.'), dzT('Un RP peut quitter le duel mais il abandonne ses points.'), dzT('Dans une team, les duels sont limités par trios de RP disponibles.')]],
      [dzT('🏆 Résultat'), [dzT('Attaque gagnante : la Land attaquée va au RP qui a lancé le duel.'), dzT('Défense gagnante : le RP gagne la Land du RP adverse. S\'il a atteint sa limite de locations (8 en Free) elle va à un RP Premium de sa team.<br>Si personne ne peut la recevoir, elle est remise en jeu.'), dzT('Égalité : le défenseur gagne.')]],
      [dzT('💰 Cagnotte de la team'), [dzT('La cagnotte est alimentée par 20 % des RPC des RP qui composent la team.'), dzT('Elle paie les défaites et le Joker.')]],
      [dzT('💸 Défaite'), [dzT('La Land mise en jeu change de team.'), dzT('20 RPC par point d\'écart sont brûlés dans la cagnotte de la team perdante.'), dzT('Le burn ne peut pas dépasser 15 % de la cagnotte totale.')]],
      [dzT('🃏 Les cartes'), [dzT('Gagne ou participe à 3 duels actifs (100 pts minimum) pour tourner la roue.'), dzT('Tu ne peux jouer qu\'une seule carte par duel.')]],
      [dzT('⏳ Chronos'), [dzT('Prolonge le duel de 24 h. Une seule carte Chronos par duel.')]],
      [dzT('👥 Help'), [dzT('Un coéquipier de plus peut rejoindre le duel en cours.')]],
      [dzT('⚡ Flash'), [dzT('+400 points pour ta team, à jouer dans les 24 premières heures du duel.')]],
      [dzT('💪 Power'), [dzT('Tes points faits après l\'activation comptent double, limité à +1 000 pts.')]],
      [dzT('🔒 Prison'), [dzT('Bloque les points d\'un RP adverse pendant 24 h.')]],
      [dzT('🏳️ Joker'), [dzT('Pour éviter le burn, le capitaine peut poser un Joker.'), dzT('Prix progressif du Joker : 1 000, 1 500 puis 2 000 RPC × nombre de RP.'), dzT('En compensation, les RP du duel gagnant reçoivent des NYX offerts par le jeu en proportion de l\'écart de points.'), dzT('300 pts minimum / RP dans le duel pour les gagner.')]]
    ];
    return '<div class="dz-list dz-rules-page">' + R.map(function (r) { return '<div class="rules-section"><h3>' + r[0] + '</h3><ul class="dz-rules">' + r[1].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>';
  }
  /* ---------- actions ---------- */
  function askJoker(id) {
    var d = (S.duels || []).filter(function (x) { return x.id === +id; })[0], burn = d && d.loss ? d.loss.paid : 0;
    var m = document.createElement('div'); m.id = 'dz-modal';
    m.innerHTML = '<div class="dz-modal-box"><div style="font-size:15px;line-height:1.5">' + dzT('Joue ton Joker ({price}) pour éviter le burn de ta cagnotte ({burn}).', { price: '<b class="dz-yel">' + fmt(S.joker_price) + ' RPC</b>', burn: '<b class="dz-yel">− ' + fmt(burn) + ' RPC</b>' }) + '</div><div class="dz-row" style="margin-top:16px;gap:10px"><button class="dz-btn" style="flex:1;text-transform:uppercase" data-cancel="1">' + dzT('Annuler') + '</button><button class="dz-btn green" style="flex:1" data-confirmjoker="' + id + '">' + dzT('Jouer') + '</button></div></div>';
    $('dz-app').appendChild(m);
  }
  async function onAction(e) {
    var rk = e.target.closest('[data-rank-team]');
    if (rk) { tab = 'map'; if (window.DuelsMap) DuelsMap.select(rk.dataset.rankTeam); render(); return; }   // clic sur une team du classement = on la montre sur la carte
    var b = e.target.closest('button'); if (!b) return; var r;
    if (b.dataset.fin) { finOpen = !finOpen; $('p-duels').innerHTML = paneDuels(); return; }   // tuile « Duels terminés » : l'état ouvert/fermé survit aux rafraîchissements
    if (b.dataset.cancel) { var m = $('dz-modal'); if (m) m.remove(); return; }
    if (b.dataset.handGo !== undefined) { swapHand(+b.dataset.handGo); return; }
    if (b.dataset.wheelOpen) { var wsp = ((CARDS && CARDS.spins) || []).filter(function (x) { return x.id === +b.dataset.wheelOpen; })[0]; if (wsp) { if (wsp.status === 'offered') showWheelResult(wsp, { ok: true, result: wsp.result, price: wsp.price }); else openWheel(wsp, true); } return; }
    if (b.dataset.cardPlay) { askCard(+b.dataset.cardPlay, b.dataset.kind); return; }
    if (b.dataset.cardPick) { pickCardTarget(b); return; }
    if (b.dataset.cardGo) { playCard(+b.dataset.cardGo); return; }
    if (b.dataset.join) r = await supabaseClient.rpc('duel_join', { p_duel: +b.dataset.join });
    else if (b.dataset.leave) r = await supabaseClient.rpc('duel_leave', { p_duel: +b.dataset.leave });
    else if (b.dataset.joker) { askJoker(b.dataset.joker); return; }
    else if (b.dataset.confirmjoker) { var m2 = $('dz-modal'); if (m2) m2.remove(); r = await supabaseClient.rpc('duel_play_joker', { p_duel: +b.dataset.confirmjoker }); }
    else return;
    var res = r && r.data; if (r && r.error) { toast(dzT('Erreur, réessaie.'), true); return; }
    if (res && res.ok === false) toast(REASONS[res.error] || res.error, true); else toast(dzT('C\'est fait !'));
    await refresh();
  }


  /* ================= CARTES DE DUEL + ROUE (règles : REGISTRE-REGLES-METIER.md « Cartes de duel », SQL : supabase/sql/2026-11-13-cartes-duel-roue.sql) =================
   * La base décide de tout (tirage, prix, stock, effets) ; ici on n'AFFICHE. Tant que la base ne répond pas « enabled » (interrupteur duel_cards_enabled), rien n'apparaît. */
  var CARD_DIR = 'ai-icons/duel-cards/';
  var CARDS_DEF = {
    chronos: { n: 'CHRONOS', c: '#4d9bff', g: 'rgba(47,111,255,.55)', t: dzT('Le duel est prolongé de <b style="color:#5ea0ff">24 h</b> pour les deux équipes.') },
    help:    { n: 'HELP',    c: '#ff4f87', g: 'rgba(255,60,120,.55)', t: dzT('Un coéquipier de plus pourra vous rejoindre<br>dans le duel.') },
    flash:   { n: 'FLASH',   c: '#ffa21f', g: 'rgba(245,158,11,.55)', t: dzT('<b style="color:#ffa21f">+400 points</b> pour ton équipe.<br><span class="dz-muted">Jouable seulement dans les 24 premières heures.</span>') },
    power:   { n: 'POWER',   c: '#b24dff', g: 'rgba(160,70,255,.55)', t: dzT('Seuls tes points faits <b style="color:#b24dff">après l\'activation</b><br>compteront double. Limité à <b style="color:#b24dff">+1 000 pts</b>.') },
    prison:  { n: 'PRISON',  c: '#a9b3d6', g: 'rgba(150,160,210,.45)', t: dzT('Choisis le RP adverse à bloquer pendant <b style="color:#aab3d6">24 h</b> :') }
  };
  var WHEEL_ANGLE = { nyx: 0, chronos: 60, flash: 120, help: 180, power: 240, prison: 300 };   // centre de chaque case, en degrés depuis le haut, sens horaire (image roue.webp)
  var LOST_MSG = { inventaire_plein: dzT('Ton inventaire est plein : cette carte est perdue.'), cagnotte_insuffisante: dzT('La cagnotte de ta team est insuffisante : cette carte est perdue.'), pas_de_team: dzT('Il te faut une team pour acheter une carte : cette carte est perdue.') };
  var cardImg = function (k) { return '<img src="' + CARD_DIR + k + '.webp" alt="' + esc(CARDS_DEF[k] ? CARDS_DEF[k].n : k) + '">'; };
  var ctile = function (k, extra) { var d = CARDS_DEF[k]; return '<div class="dz-ctile ' + (extra || '') + '" style="--c:' + d.c + ';--g:' + d.g + '">' + cardImg(k) + '</div>'; };

  async function loadCards() {
    try {
      if (!(S && S.enabled) || cardsMissing) { CARDS = null; return; }
      var r = await supabaseClient.rpc('duel_my_cards');
      if (r && r.error) { cardsMissing = true; CARDS = null; return; }   // fonction absente de la base (pas encore déployée) : on ne réinterroge pas à chaque rafraîchissement
      CARDS = (r && r.data && r.data.ok && r.data.enabled) ? r.data : null;
    } catch (e) { CARDS = null; }
  }

  // Camembert de participation : 3 parts = 3 duels joués (gagnés OU perdus) -> 1 tour de roue. Données : CARDS.parts (0..2), géré par la base.
  var PIE_COL = ['#4d9bff', '#2fe08a', '#f5c842'];   // 3 parts, 3 couleurs
  function pieHtml(n) {
    var sl = '', c = 20, r = 18, a0 = -90;
    for (var i = 0; i < 3; i++) {
      var s0 = (a0 + i * 120 + 3) * Math.PI / 180, s1 = (a0 + (i + 1) * 120 - 3) * Math.PI / 180;
      sl += '<path d="M' + c + ' ' + c + ' L' + (c + r * Math.cos(s0)).toFixed(2) + ' ' + (c + r * Math.sin(s0)).toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + (c + r * Math.cos(s1)).toFixed(2) + ' ' + (c + r * Math.sin(s1)).toFixed(2) + ' Z" fill="' + (i < n ? PIE_COL[i] : '#1a1f33') + '" stroke="' + (i < n ? '#ffffff55' : '#2a3050') + '" stroke-width="1.5" stroke-linejoin="round"/>';
    }
    return '<svg class="dz-pie" viewBox="0 0 40 40" width="26" height="26">' + sl + '</svg>';
  }
  function pieBlock() {
    var ready = (CARDS.spins || []).filter(function (x) { return x.source === 'camembert' && (x.status === 'pending' || x.status === 'offered'); })[0];   // 3 participations atteintes : un tour de roue attend
    if (ready) return '<button class="dz-pierow ready" data-wheel-open="' + ready.id + '">' + pieHtml(3) + '<b>' + dzT('TOURNER LA ROUE') + '</b><span>3 / 3</span></button>';
    var n = Math.max(0, Math.min(2, CARDS.parts || 0));
    return '<div class="dz-pierow">' + pieHtml(n) + '<b>' + dzT('PARTICIPATIONS') + '</b><span>' + n + ' / 3</span></div>';
  }
  /* ---------- « MES CARTES » : une seule fois, au-dessus des duels ---------- */
  function cardsBlock() {
    if (!CARDS) return '';
    var cap = CARDS.cap || 2, have = CARDS.cards || [], inDuel = myDuel() != null;
    if (!have.length) return '<div class="dz-cards"><div class="dz-cards-h"><span>' + dzT('MES CARTES') + '</span><b>0 / ' + cap + '</b></div><div class="dz-cards-none">' + dzT('Gagne une carte en remportant un duel') + '</div>' + pieBlock() + '</div>';
    var items = [];
    have.forEach(function (c) { items.push({ t: 'card', c: c }); });
    while (items.length < cap) items.push({ t: 'empty' });
    if (cap < 3) items.push({ t: 'locked' });
    // Kiosque : TOUJOURS 3 places visibles (gauche · centre · droite). On touche une carte de côté : elle prend le centre et la carte du centre prend SA place (échange), rien ne disparaît.
    var sig = items.map(function (it) { return it.t === 'card' ? it.c.id : it.t; }).join('|');
    if (!handOrder || handSig !== sig) { handOrder = have.length >= 2 ? [0, 1, 2] : [1, 0, 2]; handSig = sig; }
    var html = handOrder.map(function (k, pos) {
      var it = items[k], cls = 'dz-slot ' + (pos === 1 ? 'o0' : pos === 0 ? 'om1' : 'o1') + (it.t === 'card' && !inDuel ? ' off' : '');
      if (it.t === 'card') return '<button class="' + cls + '" ' + (pos === 1 ? 'data-card-play="' + it.c.id + '" data-kind="' + it.c.card + '"' : 'data-hand-go="' + pos + '"') + '>' + ctile(it.c.card) + '</button>';
      if (it.t === 'empty') return '<button class="' + cls + ' empty" data-hand-go="' + pos + '"><span>' + dzT('Gagne une carte en remportant un duel') + '</span></button>';
      return '<button class="' + cls + ' locked" data-hand-go="' + pos + '"><span>🔒</span><small>' + dzT('Emplacement Premium') + '</small></button>';
    }).join('');
    var center = items[handOrder[1]];
    return '<div class="dz-cards"><div class="dz-cards-h"><span>' + dzT('MES CARTES') + '</span><b>' + have.length + ' / ' + cap + '</b></div><div class="dz-hand">' + html + '</div>' +
      '<div class="dz-cards-hint">' + (center.t === 'card' ? (inDuel ? dzT('Touche une carte pour la jouer dans ton duel') : dzT('Rejoins un duel pour jouer une carte')) : '') + '</div>' + pieBlock() + '</div>';
  }
  function swapHand(pos) { if (!handOrder || pos === 1) return; var t = handOrder[pos]; handOrder[pos] = handOrder[1]; handOrder[1] = t; if ($('p-duels')) $('p-duels').innerHTML = paneDuels(); }
  function moveHand(d) { swapHand(d > 0 ? 2 : 0); }   // balayage vers la gauche : la carte de droite vient au centre ; vers la droite : celle de gauche
  function myDuel() { return ((S && S.duels) || []).filter(function (d) { return d.status === 'active' && (d.members || []).some(function (m) { return m.player_id === me(); }); })[0] || null; }

  /* ---------- fenêtre de validation avant de jouer une carte ---------- */
  function askCard(id, kind) {
    var d = myDuel(), def = CARDS_DEF[kind]; if (!def) return;
    if (!d) { toast(dzT('Rejoins un duel pour jouer une carte.'), true); return; }
    if ((d.plays || []).some(function (p) { return p.player_id === me(); })) { toast(dzT('Tu as déjà joué une carte dans ce duel.'), true); return; }   // 1 carte max par RP et par duel (même si elles sont différentes)
    var mineM = (d.members || []).filter(function (m) { return m.player_id === me(); })[0], sideOf = function (pid) { var x = (d.members || []).filter(function (m) { return m.player_id === pid; })[0]; return x ? x.side : null; };
    if (kind === 'chronos' && (d.plays || []).some(function (p) { return p.card === 'chronos'; })) { toast(dzT('Chronos a déjà été jouée dans ce duel.'), true); return; }   // une seule Chronos par duel, tous camps confondus
    if ((d.plays || []).some(function (p) { return p.card === kind && mineM && sideOf(p.player_id) === mineM.side; })) { toast(dzT('Ton équipe a déjà joué cette carte dans ce duel.'), true); return; }   // une même carte une seule fois par équipe
    if (kind === 'flash' && now() - Date.parse(d.launched_at) > 24 * 3600000) { toast(dzT('Flash : jouable seulement dans les 24 premières heures.'), true); return; }
    cardSel = null;
    var pick = '';
    if (kind === 'prison') {
      var mine = (d.members || []).filter(function (m) { return m.player_id === me(); })[0], foes = (d.members || []).filter(function (m) { return mine && m.side !== mine.side; });
      pick = '<div class="dz-cpick">' + foes.map(function (m) { return '<button class="dz-prison-row" data-card-pick="' + m.player_id + '" data-name="' + esc(m.username) + '"><span>○ &nbsp;' + esc(m.username) + '</span><b>' + fmt(m.pts) + '</b></button>'; }).join('') + '</div>';
    }
    var old = $('dz-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'dz-modal';
    m.innerHTML = '<div class="dz-modal-box dz-cwin"><div class="dz-cwin-t">' + dzT('JOUER {n} ?', { n: def.n }) + '</div>' + ctile(kind, 'big sm') + '<div class="dz-cwin-msg">' + def.t + '</div>' + pick +
      '<div class="dz-row" style="margin-top:14px;gap:10px"><button class="dz-btn" style="flex:1" data-cancel="1">' + dzT('Annuler') + '</button><button class="dz-btn green" style="flex:1"' + (kind === 'prison' ? ' disabled' : '') + ' data-card-go="' + id + '">' + dzT('Jouer') + '</button></div></div>';
    $('dz-app').appendChild(m);
  }
  function pickCardTarget(b) {
    cardSel = b.dataset.cardPick; var cm = $('dz-modal'); if (!cm) return;
    cm.querySelectorAll('[data-card-pick]').forEach(function (x) { var on = x.dataset.cardPick === cardSel; x.classList.toggle('on', on); x.firstChild.textContent = (on ? '◉' : '○') + '  ' + x.dataset.name; });
    var go = cm.querySelector('[data-card-go]'); if (go) go.disabled = false;
  }
  async function playCard(id) {
    var cm = $('dz-modal'); if (cm) cm.remove();
    var r = await supabaseClient.rpc('duel_play_card', { p_card: id, p_target: cardSel || null }); cardSel = null;
    if (r.error || !r.data) { toast(dzT('Erreur, réessaie.'), true); return; }
    if (r.data.ok === false) { toast(REASONS[r.data.error] || r.data.error, true); return; }
    toast(dzT('Carte jouée !')); await refresh();
  }

  /* ---------- la roue : fenêtre de récompense automatique ---------- */
  var PTR_SVG = '<svg class="dz-ptr" viewBox="0 0 34 40"><path d="M17 38 L3 8 Q17 -2 31 8 Z" fill="#f5c842" stroke="#07080f" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  function rwWindow(id, inner, withClose) {
    var old = $(id); if (old) old.remove();
    var m = document.createElement('div'); m.id = id; m.className = 'dz-rwm';
    m.innerHTML = '<div class="dz-rw">' + (withClose ? '<button class="dz-closex dz-cx" data-rw-close="1" title="Fermer"></button>' : '') + inner + '</div>';
    document.body.appendChild(m);
    if (withClose) m.onclick = function (e) { if (e.target === m || (e.target.dataset && e.target.dataset.rwClose)) m.remove(); };
    return m;
  }
  function showWheel() {
    if (!CARDS || $('dz-wheel-modal') || $('dz-result-modal')) return;
    var sp = (CARDS.spins || []).filter(function (x) { return x.status === 'offered'; })[0];
    if (sp) { showWheelResult(sp, { ok: true, result: sp.result, price: sp.price }); return; }   // résultat déjà tiré (fenêtre fermée avant d'acheter) : on reprend à la carte
    sp = (CARDS.spins || []).filter(function (x) { return x.status === 'pending' && x.source !== 'camembert'; })[0]; if (!sp) return;   // victoire = automatique ; participations = le RP clique sur la tuile
    openWheel(sp);
  }
  function openWheel(sp, auto) {
    var msg = sp.source === 'camembert' ? dzT('Tu as participé à 3 duels !<br>Découvre ce que tu as gagné !') : dzT('Ta team vient de remporter un duel.<br>Découvre ce que tu as gagné !');
    var m = rwWindow('dz-wheel-modal', '<div class="dz-rw-t">' + dzT('FÉLICITATIONS !') + '</div><div class="dz-rw-p">' + msg + '</div><div class="dz-wheel">' + PTR_SVG + '<img id="dz-wimg" src="' + CARD_DIR + 'roue.webp" alt=""></div>' + (auto ? '' : '<button class="dz-btn green dz-rw-go" id="dz-wgo">' + dzT('Lancer la roue') + '</button>'), false);   // roue de victoire : bouton « Lancer la roue » ; roue de participation (clic sur la tuile) : elle se lance tout de suite
    var busy = false, go = async function () {
      if (busy) return; busy = true; if ($('dz-wgo')) $('dz-wgo').disabled = true;
      var r = await supabaseClient.rpc('duel_wheel_spin', { p_spin: sp.id }), res = r && r.data;
      if (!res || !res.ok) { toast(REASONS[res && res.error] || dzT('Erreur, réessaie.'), true); m.remove(); return; }
      var c = WHEEL_ANGLE[res.result] || 0, off = (Math.random() * 2 - 1) * 22, img = $('dz-wimg');
      img.style.transition = 'transform 4.6s cubic-bezier(.12,.62,.12,1)'; img.getBoundingClientRect();
      img.style.transform = 'rotate(' + (360 * 5 - (c + off)) + 'deg)';
      setTimeout(function () { m.remove(); showWheelResult(sp, res); }, 4900);
    };
    if ($('dz-wgo')) $('dz-wgo').onclick = go;
    if (auto) setTimeout(go, 450);   // laisse la fenêtre apparaître, puis la roue part toute seule
  }
  function showWheelResult(sp, res) {
    var k = res.result;
    if (k === 'nyx') { nyxWindow(sp, res.nyx || 3); return; }
    if (CARDS && CARDS.spins && (k === 'nyx' || res.lost)) CARDS.spins = CARDS.spins.filter(function (x) { return x.id !== sp.id; });
    if (res.lost) { rwWindow('dz-result-modal', '<div class="dz-rw-t">' + dzT('DOMMAGE') + '</div>' + ctile(k, 'big') + '<div class="dz-rw-p">' + (LOST_MSG[res.lost] || dzT('Cette carte est perdue.')) + '</div>', true); refreshSoon(); return; }
    var def = CARDS_DEF[k]; if (!def) return;
    var m = rwWindow('dz-result-modal', '<div class="dz-rw-t">' + dzT('BRAVO !') + '</div><div class="dz-rw-p">' + dzT('Tu viens de découvrir') + '</div>' + ctile(k, 'big') + '<div class="dz-rw-price">' + dzT('Acheter cette carte pour {price} avec la cagnotte de la team ?', { price: '<b class="dz-yel">' + fmt(res.price) + ' RPC</b>' }) + '</div><div class="dz-row" style="gap:10px;margin-top:12px"><button class="dz-btn" style="flex:1" id="dz-wno">' + dzT('Annuler') + '</button><button class="dz-btn green" style="flex:1" id="dz-wyes">' + dzT('Acheter') + '</button></div>', false);
    var done = false, decide = async function (buy) {
      if (done) return; done = true;
      var r = await supabaseClient.rpc('duel_wheel_decide', { p_spin: sp.id, p_buy: buy }), d = r && r.data; m.remove();
      if (CARDS && CARDS.spins) CARDS.spins = CARDS.spins.filter(function (x) { return x.id !== sp.id; });   // la fenêtre ne doit pas se rouvrir avant le prochain rafraîchissement
      if (!d || !d.ok) { toast(REASONS[d && d.error] || dzT('Erreur, réessaie.'), true); }
      else if (d.status === 'bought') toast(dzT('Carte ajoutée à tes cartes !'));
      else if (d.status === 'lost') toast(LOST_MSG[d.reason] || dzT('La carte est perdue.'), true);
      await refresh();
    };
    $('dz-wno').onclick = function () { decide(false); }; $('dz-wyes').onclick = function () { decide(true); };
  }
  function nyxWindow(sp, n) {
    var txt = sp.source === 'camembert' ? dzT('Tu reçois') : dzT('Tous tes coéquipiers du duel<br>reçoivent avec toi');
    var m = rwWindow('dz-result-modal', '<div class="dz-rw-t">' + dzT('BRAVO !') + '</div><div class="dz-rw-p">' + txt + '</div><div class="dz-nyx">' + n + ' NYX</div>', true);
    var conf = document.createElement('div'); conf.className = 'dz-confetti';
    var cols = ['#f5c842', '#2fe08a', '#4d9bff', '#ff4f87', '#b24dff', '#ffa21f', '#f0f2f8'], h = '';
    for (var i = 0; i < 70; i++) h += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;background:' + cols[i % cols.length] + ';animation-delay:' + (Math.random() * 2.2).toFixed(2) + 's;animation-duration:' + (2.4 + Math.random() * 2).toFixed(2) + 's;transform:rotate(' + Math.round(Math.random() * 360) + 'deg)"></i>';
    conf.innerHTML = h; m.appendChild(conf);
    var obs = new MutationObserver(function () { if (!document.body.contains(m)) { obs.disconnect(); refreshSoon(); } }); obs.observe(document.body, { childList: true });
  }
  function refreshSoon() { setTimeout(function () { refresh(); }, 300); }

  /* ---------- journal de la cagnotte : uniquement les défaites (burn), les Jokers et les versements mensuels ---------- */
  async function openPot(pot) {
    var tid = S && S.team_id; if (!tid) return;   // cagnotte de la FAMILLE de team (T1 + T2)
    var old = $('dz-pot-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'dz-pot-modal';
    m.innerHTML = '<div class="dz-modal-box dz-pot-box"><button class="dz-closex" id="dz-pot-x" title="' + dzT('Fermer') + '" style="position:absolute;top:8px;right:8px;width:32px;height:32px"></button><div class="dz-modal-t">💰 ' + dzT('Cagnotte de la team') + '</div><div class="dz-pot-total">' + fmt(pot) + ' RPC</div><div id="dz-pot-list" class="dz-muted">' + dzT('Chargement…') + '</div></div>';
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m || e.target.id === 'dz-pot-x') m.remove(); };
    var r = await supabaseClient.from('team_pot_tx').select('delta,reason,duel_id,created_at').eq('team_id', tid).neq('reason', 'Test admin').order('created_at', { ascending: false }).limit(100);
    var rows = r.data || [], ids = rows.map(function (x) { return x.duel_id; }).filter(function (x) { return x; }), duels = {};
    if (ids.length) { var dr = await supabaseClient.from('duels').select('id,attacker_team,defender_team').in('id', ids); (dr.data || []).forEach(function (d) { duels[d.id] = d; }); await loadTeams((dr.data || []).reduce(function (a, d) { return a.concat([d.attacker_team, d.defender_team]); }, [])); }
    var list = $('dz-pot-list'); if (!list) return;
    if (!rows.length) { list.textContent = dzT('Aucun mouvement pour l\'instant.'); return; }
    list.className = ''; list.innerHTML = rows.map(function (x) {
      var d = duels[x.duel_id], other = d ? team(d.attacker_team === tid ? d.defender_team : d.attacker_team).name : '', label;
      if (x.reason === 'Burn de défaite') label = dzT('Défaite {team}', { team: other });
      else if (x.reason === 'Joker') label = dzT('Joker {team}', { team: other });
      else label = dzT('Crédit {mois}', { mois: new Date(x.created_at).toLocaleDateString(LOC(), { month: 'long', timeZone: 'Europe/Paris' }) });
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
      m.innerHTML = '<div class="dz-modal-box dz-duelc"><div class="dz-duelc-img">' + SWORDS + '</div><div class="dz-duelc-t">DUEL</div><div class="dz-duelc-msg">' + dzT('Tu es sur le point de défier {name} dans le but de lui prendre sa Land. En contrepartie, tu mets en jeu une de tes Lands en location. Veux-tu faire un duel avec ce RP ?', { name: '<b>' + esc(name || dzT('ce RP')) + '</b>' }) + '</div><div class="dz-row" style="margin-top:16px;gap:10px"><button class="dz-btn" style="flex:1;text-transform:uppercase" id="dzc-no">' + dzT('Annuler') + '</button><button class="dz-btn green" style="flex:1;text-transform:uppercase" id="dzc-yes">' + dzT('Lancer') + '</button></div></div>';
      document.body.appendChild(m);
      var done = function (v) { m.remove(); resolve(v); };
      $('dzc-no').onclick = function () { done(false); }; $('dzc-yes').onclick = function () { done(true); };
      m.onclick = function (e) { if (e.target === m) done(false); };
    });
  }

  async function launch(idx, name) {
    if (!S) { try { await refresh(); } catch (e) {} }   // module pas encore chargé (ouverture de l'appli juste avant) : on attend l'état au lieu de dire « pas ouverts »
    if (!(S && S.enabled)) { toast(dzT('Les duels ne sont pas encore ouverts.'), true); return; }
    var chk = await supabaseClient.rpc('duel_can_launch', { p_idx: idx });
    if (chk.error || !chk.data) { toast(dzT('Erreur, réessaie.'), true); return; }
    if (chk.data.ok === false) { toast(REASONS[chk.data.error] || chk.data.error, true); return; }
    if (!name) { // nom du RP visé : repli si l'appelant ne l'a pas fourni
      var h = await supabaseClient.from('tour_lands').select('holder_id').eq('idx', idx).maybeSingle();
      if (h.data && h.data.holder_id) { var pl = await supabaseClient.from('players').select('username').eq('id', h.data.holder_id).maybeSingle(); if (pl.data) name = pl.data.username; }
    }
    if (!(await confirmDuel(name))) return;
    var r = await supabaseClient.rpc('duel_launch', { p_idx: idx });
    if (r.error || !r.data) { toast(dzT('Erreur, réessaie.'), true); return; }
    if (r.data.ok === false) { toast(REASONS[r.data.error] || r.data.error, true); return; }
    if (window.Tour && Tour.closeRentModal) Tour.closeRentModal();
    await refresh(); open();
  }

  window.Duels = { openCards: function () { return cardsBlock(); }, openPot: openPot, init: init, open: open, close: close, launch: launch, refresh: refresh, renderTeamRow: renderTeamRow, updateBadge: updateBadge, enabled: function () { return !!(S && S.enabled); }, loaded: function () { return S !== null; } };
})();
