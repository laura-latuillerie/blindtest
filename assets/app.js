/* ======================================================
   Machu Testu — app.js (Premium-only, PKCE & scopes fix)
   ====================================================== */

const by = id => document.getElementById(id);

/* ---------- DOM refs ---------- */
const els = {
  // Header / badges
  authState: by('authState'),
  stepConn:  by('stepConn'),
  stepPlayer:by('stepPlayer'),
  stepPl:    by('stepPl'),
  stepReady: by('stepReady'),

  // Setup
  clientId:  by('clientId'),
  btnConnect:by('btnConnect'),
  btnDisconnect:by('btnDisconnect'),
  btnInitPlayer:by('btnInitPlayer'),
  btnReclaim: by('btnReclaim'),
  playerState:by('playerState'),
  vol:       by('vol'),
  banner:    by('banner'),

  // Playlist
  playlistUrl: by('playlistUrl'),
  maxTracks:   by('maxTracks'),
  shuffle:     by('shuffle'),
  btnLoad:     by('btnLoad'),
  playlistSummary: by('playlistSummary'),

  // Stage
  btnStart:  by('btnStart'),
  setup:     by('setup'),
  stage:     by('stage'),
  screen:    by('screen'),
  counter:   by('counter'),
  playlistName: by('playlistName'),
  progressBar:  by('progressBar'),
  btnSkip:   by('btnSkip'),
  btnRestart:by('btnRestart'),

  // Audio (fallback)
  player: by('player'),

  // Misc
  toast: by('toast'),
  debug: by('debug'),
};

/* ---------- State ---------- */
const state = {
  access_token: null,
  refresh_token: null,
  token_expires_at: 0,
  client_id: null,
  redirect_uri: location.origin + location.pathname, // IMPORTANT: ajoute cette URI dans ton app Spotify
  scopes: [],

  usingSdk: true, // Premium-only
  device_id: null,
  sdkPlayer: null,

  playlist: null,
  tracks: [],
  i: 0,
};

/* ---------- Options gameplay ---------- */
const INTRO_MS = 10_000;
const GUESS_MS = 10_000;
const ANSWER_MS = 10_000;
const FADE_OUT_MS = 2_000;
const MAX_TOTAL = 50;
const ENABLE_PREVIEW_FALLBACK = true; // mets false si tu veux bloquer tout fallback

/* ---------- Utils ---------- */
const clamp = (n,min,max)=> Math.max(min, Math.min(max,n));
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
function setProgress(p){ els.progressBar.style.width = clamp(p*100,0,100)+'%'; }
function escapeHTML(s){ return (s||'').replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function toast(msg, ms=2600){ if(!els.toast) return; els.toast.textContent = msg; els.toast.classList.remove('hidden'); setTimeout(()=> els.toast.classList.add('hidden'), ms); }
function log(label, data){ try{ const prev = els.debug?.textContent || ''; const line = `\n[${new Date().toLocaleTimeString()}] ${label}: ${typeof data==='string'?data:JSON.stringify(data)}`; if(els.debug) els.debug.textContent = (prev+line).slice(-5000); }catch{} }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function parsePlaylistId(url){
  if(!url) return null; const s=url.trim();
  let m = s.match(/playlist\/([A-Za-z0-9]+)(?:\?|$)/); if(m) return m[1];
  m = s.match(/^spotify:playlist:([A-Za-z0-9]+)$/); if(m) return m[1];
  return null;
}
function getVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function placeholderCover(){
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>
      <defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop stop-color='${getVar('--pink')}'/><stop offset='1' stop-color='${getVar('--lime')}'/></linearGradient></defs>
      <rect width='600' height='600' fill='${getVar('--cream')}'/>
      <circle cx='300' cy='300' r='240' fill='url(#g)' opacity='0.35'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui,Segoe UI,Roboto,Arial' font-size='280' fill='#0E1321'>?</text>
    </svg>`
  );
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

/* ---------- Storage ---------- */
function saveAuth(){
  localStorage.setItem('spotify_auth', JSON.stringify({
    access_token: state.access_token,
    refresh_token: state.refresh_token,
    token_expires_at: state.token_expires_at,
    client_id: state.client_id,
    redirect_uri: state.redirect_uri,
    scopes: state.scopes,
  }));
}
function loadAuth(){
  try{
    const saved = JSON.parse(localStorage.getItem('spotify_auth')||'{}');
    if(saved.client_id) els.clientId.value = saved.client_id;
    Object.assign(state, saved);
  }catch{}
  updateAuthUI();
}

/* ---------- Scopes Premium ---------- */
function hasPremiumScopes(){
  const need = ['streaming','user-modify-playback-state','user-read-playback-state','user-read-currently-playing'];
  return need.every(s => state.scopes.includes(s));
}

/* ---------- UI states ---------- */
function updateAuthUI(){
  const ok = !!state.access_token && Date.now() < (state.token_expires_at||0);
  els.authState.textContent = ok ? '✅ Connecté' : '🔒 Non connecté';
  els.btnInitPlayer.disabled = !(ok && hasPremiumScopes());
  els.vol.disabled = !hasPremiumScopes();
  els.banner.textContent = hasPremiumScopes()
    ? ''
    : (ok ? 'Ton token ne contient pas les droits Premium requis. Clique “Déconnexion”, puis “Se connecter (Premium)” et accepte les autorisations.'
          : 'Connecte-toi en Premium pour activer le lecteur web.');
  updateSteps();
}
function updateSteps(){
  els.stepConn.innerHTML   = '1) Connexion : <strong>' + (state.access_token?'✅':'❌') + '</strong>';
  const p = hasPremiumScopes()? (state.device_id? '🟢 actif':'🛑') : '🔒';
  els.stepPlayer.innerHTML = '2) Lecteur web : <strong>' + p + '</strong>';
  els.stepPl.innerHTML     = '3) Playlist : <strong>' + (state.tracks.length? '✅':'⏳') + '</strong>';
  const ready = (!!state.access_token && hasPremiumScopes() && state.tracks.length>0);
  els.stepReady.innerHTML  = '4) Prêt : <strong>' + (ready? '✅' : '⏳') + '</strong>';
}

/* ---------- PKCE helpers ---------- */
const b64url = (arrBuf) => {
  let str = '';
  const bytes = new Uint8Array(arrBuf);
  const len = bytes.byteLength;
  for (let i=0; i<len; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const sha256 = async (text) => {
  const data = new TextEncoder().encode(text);
  return await crypto.subtle.digest('SHA-256', data);
};

/* ---------- OAuth (Premium only) ---------- */
async function beginAuth(){
  const client_id = els.clientId.value.trim();
  if(!client_id){ toast('⚠️ Renseigne ton Client ID Spotify'); return; }
  state.client_id = client_id;
  saveAuth();

  // PKCE
  const verifier = [...crypto.getRandomValues(new Uint8Array(64))]
    .map(x => ('0' + (x%36).toString(36)).slice(-1)).join('');
  const challenge = b64url(await sha256(verifier));
  sessionStorage.setItem('pkce_verifier', verifier);

  // Scopes Premium (et lecture de playlists)
  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'streaming',
    'user-modify-playback-state',
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-read-email',
    'user-read-private'
  ];

  const params = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: state.redirect_uri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: scopes.join(' ')
  });

  const url = 'https://accounts.spotify.com/authorize?' + params.toString();
  log('auth', 'Redirect → ' + url);
  location.assign(url);
}

async function finishAuth(){
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if(!code) return;

  // Nettoie l’URL
  history.replaceState({},'',state.redirect_uri);

  const verifier = sessionStorage.getItem('pkce_verifier');
  if(!verifier){ toast('PKCE manquant. Reconnecte-toi.'); return; }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: state.redirect_uri,
    client_id: state.client_id || els.clientId.value.trim(),
    code_verifier: verifier
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body
  });

  if(!res.ok){
    toast('Échec token. Vérifie Client ID & Redirect URI dans ton app Spotify.');
    return;
  }

  const tok = await res.json();
  state.access_token = tok.access_token;
  state.refresh_token = tok.refresh_token;
  state.token_expires_at = Date.now() + (tok.expires_in*1000 - 5000);
  state.scopes = (tok.scope||'').split(' ').filter(Boolean);

  if(!hasPremiumScopes()){
    toast('⚠️ Ton token n’a pas les droits Premium. Clique Déconnexion puis reconnecte-toi.');
    els.btnInitPlayer.disabled = true;
  }

  saveAuth();
  updateAuthUI();
  toast('Connecté à Spotify ✅');
}

async function ensureToken(){
  if(state.access_token && Date.now() < state.token_expires_at) return;
  if(!state.refresh_token) throw new Error('Pas de refresh token.');
  const body = new URLSearchParams({
    grant_type:'refresh_token',
    refresh_token: state.refresh_token,
    client_id: state.client_id || els.clientId.value.trim()
  });
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body
  });
  if(!r.ok) throw new Error('Refresh token invalide');
  const t = await r.json();
  state.access_token = t.access_token;
  if(t.refresh_token) state.refresh_token = t.refresh_token;
  state.token_expires_at = Date.now() + (t.expires_in*1000 - 5000);
  if(t.scope) state.scopes = t.scope.split(' ').filter(Boolean);
  saveAuth();
  updateAuthUI();
}

/* ---------- Spotify Web API helpers ---------- */
async function spGet(url){
  await ensureToken();
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${state.access_token}` } });
  if(!r.ok) throw new Error('Spotify GET '+r.status);
  return r.json();
}
async function spPut(url, body){
  await ensureToken();
  const r = await fetch(url, {
    method:'PUT',
    headers:{ Authorization:`Bearer ${state.access_token}`, 'Content-Type':'application/json' },
    body: body? JSON.stringify(body): undefined
  });
  if(r.status===204) return {ok:true};
  const txt = await r.text();
  if(!r.ok) throw new Error('Spotify PUT '+r.status+' '+txt);
  try{ return JSON.parse(txt); }catch{ return {ok:r.ok, body:txt}; }
}

/* ---------- Playlist loading ---------- */
async function loadPlaylist(){
  try{
    els.btnLoad.disabled = true;
    const id = parsePlaylistId(els.playlistUrl.value);
    if(!id){ toast('URL de playlist invalide'); return; }

    const pl = await spGet(`https://api.spotify.com/v1/playlists/${id}?fields=name,images,external_urls.spotify`);
    state.playlist = { id, name: pl.name, images: pl.images||[], url: pl.external_urls?.spotify };
    els.playlistName.textContent = '🎶 ' + (pl.name || 'Playlist');

    const maxWant = clamp(parseInt(els.maxTracks.value||MAX_TOTAL,10)||MAX_TOTAL,1,MAX_TOTAL);
    let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&market=from_token&fields=items(track(id,is_local,name,uri,preview_url,artists(name),album(name,images,release_date,release_date_precision))),next`;
    const acc = [];

    while(url && acc.length < maxWant){
      const data = await spGet(url);
      for(const it of (data.items||[])){
        const t = it.track; if(!t || t.is_local) continue;
        const year = (t.album?.release_date||'').slice(0,4) || '';
        acc.push({
          title: t.name,
          artists: (t.artists||[]).map(a=>a.name).join(', '),
          preview: t.preview_url,
          cover: (t.album?.images||[])[0]?.url || '',
          year, album: t.album?.name || '',
          uri: t.uri
        });
        if(acc.length>=maxWant) break;
      }
      url = (data.next && acc.length<maxWant) ? data.next : null;
    }

    if(els.shuffle.checked) shuffle(acc);
    state.tracks = acc; state.i = 0;
    els.btnStart.disabled = acc.length===0;
    els.playlistSummary.innerHTML = acc.length
      ? `<strong>${state.playlist.name}</strong> — ${acc.length} titre(s) prêts (Premium)`
      : 'Aucun titre exploitable.';
    updateSteps();
    toast(acc.length ? `✅ ${acc.length} titre(s) prêts` : '⚠️ Rien à jouer');
  }catch(e){
    console.error(e); toast('Erreur lors du chargement de la playlist.');
  } finally {
    els.btnLoad.disabled = false;
  }
}

/* ---------- Web Playback SDK ---------- */
window.onSpotifyWebPlaybackSDKReady = () => {};

async function initSdkPlayer(){
  try{
    if(!state.access_token){ toast('Connecte-toi d’abord'); return; }
    if(!hasPremiumScopes()){ toast('Reconnecte-toi en Premium (bouton Se connecter)'); return; }

    if(!state.sdkPlayer){
      const player = new Spotify.Player({
        name: 'Machu Testu — Web Player',
        getOAuthToken: cb => cb(state.access_token),
        volume: els.vol.valueAsNumber || 1
      });
      state.sdkPlayer = player;

      player.addListener('ready', ({ device_id }) => {
        state.device_id = device_id;
        els.playerState.textContent = '🟢 Lecteur prêt';
        updateSteps();
      });
      player.addListener('not_ready', ({ device_id }) => {
        if(state.device_id===device_id) state.device_id=null;
        els.playerState.textContent = '🟠 Lecteur indisponible';
        updateSteps();
      });
      player.addListener('authentication_error', ({ message }) => log('auth_error', message));
      player.addListener('account_error', ({ message }) => log('account_error', message));
      player.addListener('player_state_changed', (st) => log('state', st));

      const ok = await player.connect();
      if(!ok){ toast('Impossible de connecter le lecteur'); return; }
    }

    await transferToWebPlayer(true);
    els.playerState.textContent = '🟢 Lecteur actif';
    els.btnReclaim.disabled = false;
    els.vol.disabled = true;
    updateSteps();
  }catch(e){
    console.error(e); toast('Erreur d’initialisation du lecteur');
  }
}

async function spGetJson(url){
  const r = await fetch(url,{ headers:{ Authorization:`Bearer ${state.access_token}` } });
  if(!r.ok) throw new Error('GET '+r.status);
  return r.json();
}
async function transferToWebPlayer(waitActive=false){
  if(!state.device_id) return;
  await spPut('https://api.spotify.com/v1/me/player', { device_ids:[state.device_id], play:false });
  if(waitActive){
    for(let i=0;i<15;i++){
      try{
        const d = await spGetJson('https://api.spotify.com/v1/me/player/devices');
        const me = (d.devices||[]).find(x=>x.id===state.device_id);
        if(me && me.is_active) return true;
      }catch{}
      await sleep(300);
    }
    toast('⚠️ Device non actif. Clique « Reprendre le contrôle ».');
  }
  return true;
}
async function waitForSdkPlaying(uri, timeoutMs=7000){
  return new Promise((res, rej)=>{
    const start = performance.now();
    function onState(s){
      if(!s) return;
      const playing = !s.paused;
      const cur = s.track_window?.current_track?.uri;
      if(playing && cur && cur === uri){ cleanup(); res(); }
      if(performance.now()-start > timeoutMs){ cleanup(); rej(new Error('SDK_START_TIMEOUT')); }
    }
    function cleanup(){ try{ state.sdkPlayer.removeListener('player_state_changed', onState); }catch{} }
    try{ state.sdkPlayer.addListener('player_state_changed', onState); }catch{}
    setTimeout(()=>{ cleanup(); rej(new Error('SDK_START_TIMEOUT')); }, timeoutMs+800);
  });
}
async function playSdkTrack(uri){
  if(!state.device_id) throw new Error('NO_DEVICE');
  await spPut(`https://api.spotify.com/v1/me/player/play?device_id=${state.device_id}`, { uris:[uri], position_ms: 0 });
  await waitForSdkPlaying(uri);
}
async function pauseSdk(){ try{ await spPut(`https://api.spotify.com/v1/me/player/pause?device_id=${state.device_id}`); }catch{} }
async function setSdkVolume(v){ try{ if(state.sdkPlayer) await state.sdkPlayer.setVolume(clamp(v,0,1)); }catch{} }

/* ---------- Game flow ---------- */
function updateCounter(){
  const total=state.tracks.length;
  els.counter.textContent = `🎯 ${Math.min(state.i+1,total)} / ${total}`;
}
function runPhase(ms, onP){
  const start=performance.now();
  return new Promise(res=>{
    function step(){
      const p=clamp((performance.now()-start)/ms,0,1);
      if(onP) onP(p);
      if(p<1){ requestAnimationFrame(step);} else res();
    }
    requestAnimationFrame(step);
  });
}

function renderIntro(){
  els.screen.innerHTML =
  `<div class="cover"><img alt="Playlist cover" src="${state.playlist?.images?.[0]?.url||placeholderCover()}"></div>
   <div>
     <div class="subtitle">🚦 Prêt·e ?</div>
     <div class="title">${escapeHTML(state.playlist?.name||'Ta playlist')}</div>
     <div class="rules">
       <div>🕒 Intro 10s • Puis 10s d'écoute / 10s de réponse</div>
       <div>🏆 1 point par <strong>artiste</strong> + 1 point par <strong>titre</strong></div>
       <div>🎵 Jusqu'à ${state.tracks.length} titre(s)</div>
     </div>
   </div>`;
}
function renderGuess(t){
  els.screen.innerHTML =
  `<div class="cover"><img alt="Cover masquée" src="${placeholderCover()}"></div>
   <div>
     <div class="subtitle">Extrait ${state.i+1}/${state.tracks.length} — 10 secondes</div>
     <div class="title">❓❓❓</div>
     <div class="meta">Trouve l'artiste et le titre</div>
   </div>`;
}
function renderAnswer(t){
  els.screen.innerHTML =
  `<div class="cover"><img alt="Cover" src="${t.cover||placeholderCover()}"></div>
   <div>
     <div class="subtitle">Réponse • ${t.year ? t.year+' • ' : ''}${t.album ? escapeHTML(t.album) : ''}</div>
     <div class="title">${escapeHTML(t.title)}</div>
     <div class="meta">${escapeHTML(t.artists)}</div>
     <div class="meta" style="margin-top:8px">L'extrait continue ~10s</div>
   </div>`;
}

async function fadeAndWaitSdk(totalMs){
  const endAt = performance.now() + totalMs;
  const vol0 = els.vol.valueAsNumber || 1;
  await new Promise((r)=>{
    function tick(){
      const now=performance.now(); const remain=endAt-now;
      setProgress(1 - remain/totalMs);
      if(remain <= FADE_OUT_MS){ const f=clamp(remain/FADE_OUT_MS,0,1); setSdkVolume(vol0*f); }
      if(remain>16){ requestAnimationFrame(tick);} else r();
    }
    requestAnimationFrame(tick);
  });
  await pauseSdk(); await setSdkVolume(vol0);
}

/* ---------- Fallback preview (secours) ---------- */
function playPreviewAndWait(src){
  return new Promise(res=>{
    const a = els.player;
    a.pause(); a.src = src; a.currentTime=0; a.volume = els.vol.valueAsNumber || 1;
    const onStart = ()=>{ a.removeEventListener('playing', onStart); res(); };
    a.addEventListener('playing', onStart, { once:true });
    const p = a.play();
    if(p && p.catch){ p.catch(()=>{ res(); }); }
    setTimeout(()=>res(), 1200);
  });
}
async function fadeAndWaitAudio(totalMs){
  const a = els.player; const endAt = performance.now()+totalMs; const fadeStart = endAt - FADE_OUT_MS; const vol0=a.volume;
  await new Promise((r)=>{
    function tick(){
      const now=performance.now(); const remain=endAt-now;
      setProgress(1 - remain/totalMs);
      if(now>=fadeStart){ const f=clamp(1 - (now - fadeStart)/FADE_OUT_MS,0,1); a.volume = vol0*f; }
      if(remain>16){ requestAnimationFrame(tick);} else r();
    }
    requestAnimationFrame(tick);
  });
  a.pause(); a.currentTime=0; a.volume=vol0; a.src='';
}
async function fallbackPreviewFlow(t){
  await playPreviewAndWait(t.preview);
  await runPhase(GUESS_MS, p=>setProgress(p));
  renderAnswer(t);
  await fadeAndWaitAudio(ANSWER_MS);
  nextTrack();
}

/* ---------- Sequencing ---------- */
async function playCurrent(){
  if(state.i >= state.tracks.length) return finish();
  updateCounter();
  const t = state.tracks[state.i];
  renderGuess(t);

  try{
    await transferToWebPlayer(true);
    await playSdkTrack(t.uri);                      // attend démarrage réel
    await runPhase(GUESS_MS, p=>setProgress(p));    // 10s devine
    renderAnswer(t);
    await fadeAndWaitSdk(ANSWER_MS);                // 10s réponse + fade
    nextTrack();
  }catch(err){
    log('sdk_error', err.message||String(err));
    if(ENABLE_PREVIEW_FALLBACK && t.preview){
      toast('🎧 Lecteur Premium KO — bascule preview');
      await fallbackPreviewFlow(t);
    }else{
      toast('⚠️ Lecture impossible — on passe au suivant');
      await sleep(700);
      nextTrack();
    }
  }
}

function nextTrack(){
  stopAll();
  state.i++;
  updateCounter();
  if(state.i < state.tracks.length) playCurrent();
  else finish();
}

function finish(){
  stopAll(); setProgress(1);
  els.screen.innerHTML =
  `<div class="cover"><img alt="Playlist cover" src="${state.playlist?.images?.[0]?.url||placeholderCover()}"></div>
   <div>
     <div class="title">🎉 Fin — Machu Testu</div>
     <div class="subtitle">${escapeHTML(state.playlist?.name||'Playlist')} — ${state.tracks.length} titre(s)</div>
     <div class="meta" style="margin-top:12px">Relance avec « Recommencer » ou choisis une autre playlist.</div>
   </div>`;
}

/* ---------- Controls ---------- */
els.btnConnect?.addEventListener('click', beginAuth);
els.btnDisconnect?.addEventListener('click', ()=>{
  state.access_token=null; state.refresh_token=null; state.token_expires_at=0; state.scopes=[];
  saveAuth(); updateAuthUI(); toast('Jeton supprimé');
});
els.btnInitPlayer?.addEventListener('click', initSdkPlayer);
els.btnReclaim?.addEventListener('click', ()=> transferToWebPlayer(true));
els.btnLoad?.addEventListener('click', loadPlaylist);

els.btnStart?.addEventListener('click', async ()=>{
  // Un seul clic pour tout (sert de geste utilisateur pour l’audio)
  els.btnStart.disabled = true;
  try{
    if(!state.access_token){ toast('Connecte-toi d’abord'); return; }
    if(!hasPremiumScopes()){ toast('Reconnecte-toi en Premium (Se connecter)'); return; }

    await initSdkPlayer();
    if(!state.tracks.length) await loadPlaylist();
    if(!state.tracks.length){ toast('Aucun titre à jouer'); return; }

    state.i=0; setProgress(0);
    els.setup.classList.add('hidden'); els.stage.classList.remove('hidden');
    await (async()=>{ renderIntro(); setProgress(0); await runPhase(INTRO_MS); })();
    await playCurrent();
  } finally {
    els.btnStart.disabled = false;
  }
});

els.btnSkip?.addEventListener('click', ()=>{
  stopAll(); // coupe SDK + audio HTML pour éviter les courses
  state.i++;
  if(state.i < state.tracks.length) playCurrent();
  else finish();
});

els.btnRestart?.addEventListener('click', ()=>{
  stopAll();
  els.setup.classList.remove('hidden');
  els.stage.classList.add('hidden');
  setProgress(0);
});

/* ---------- Boot ---------- */
(async function init(){
  loadAuth();
  await finishAuth();   // récupère le token si on revient d’OAuth
  updateAuthUI();
})();
