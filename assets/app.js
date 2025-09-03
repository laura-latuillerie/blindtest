/* ================================
   Machu Testu – app.js (corrigé)
   ================================ */

// Raccourci DOM
const by = id => document.getElementById(id);

// Raccourcis UI
const els = {
  btnConnect: by('btnConnect'),
  btnDisconnect: by('btnDisconnect'),
  btnInitPlayer: by('btnInitPlayer'),
  btnReclaim: by('btnReclaim'),
  btnStart: by('btnStart'),
  btnSkip: by('btnSkip'),
  clientId: by('clientId'),
  playlistUrl: by('playlistUrl'),
  maxTracks: by('maxTracks'),
  shuffle: by('shuffle'),
  vol: by('vol'),
  debug: by('debug'),
  playerState: by('playerState'),
  stepConn: by('stepConn'),
  stepPlayer: by('stepPlayer'),
  stepPl: by('stepPl'),
  stepReady: by('stepReady'),
  toast: by('toast'),
};

// État global
const state = {
  access_token: null,
  token_expires_at: 0,
  client_id: null,
  redirect_uri: location.origin + location.pathname,
  device_id: null,
  sdkPlayer: null,
  playlist: null,
  tracks: [],
  i: 0
};

const ENABLE_PREVIEW_FALLBACK = true;

/* ======================
   Utils
   ====================== */
function toast(msg) {
  console.log('[toast]', msg);
  if (els.toast) els.toast.textContent = msg;
}

function log(type, msg) {
  console.log(`[${type}]`, msg);
  if (els.debug) els.debug.textContent += `\n[${type}] ${JSON.stringify(msg)}`;
}

function hasPremiumScopes() {
  return state.access_token; // simplifié : tu as forcé Premium-only
}

function stopAll() {
  if (state.sdkPlayer) {
    state.sdkPlayer.pause();
  }
  const audio = document.querySelector('audio');
  if (audio) {
    audio.pause();
    audio.src = '';
  }
}

/* ======================
   Connexion
   ====================== */
async function beginAuth() {
  const client_id = els.clientId.value.trim();
  if (!client_id) {
    toast('⚠️ Renseigne ton Client ID Spotify');
    return;
  }
  state.client_id = client_id;
  // PKCE
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)))
    .map(x => ('0' + (x % 36).toString(36)).slice(-1)).join('');
  const challenge = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(verifier)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  sessionStorage.setItem('pkce_verifier', verifier);

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
  log('auth', 'Redirect vers ' + url);
  location.assign(url);
}

/* ======================
   Player SDK
   ====================== */
async function initSdkPlayer() {
  if (!state.access_token) {
    toast('Connecte-toi d’abord');
    return;
  }

  if (state.sdkPlayer) return;

  const player = new Spotify.Player({
    name: 'Machu Testu — Web Player',
    getOAuthToken: cb => cb(state.access_token),
    volume: els.vol.valueAsNumber || 1
  });

  player.addListener('ready', ({ device_id }) => {
    state.device_id = device_id;
    els.playerState.textContent = '🟢 Lecteur prêt';
    log('player', 'ready: ' + device_id);
  });

  player.addListener('not_ready', ({ device_id }) => {
    if (state.device_id === device_id) state.device_id = null;
    els.playerState.textContent = '🛑 Lecteur inactif';
  });

  player.addListener('authentication_error', ({ message }) => log('auth_error', message));
  player.addListener('account_error', ({ message }) => log('account_error', message));

  const ok = await player.connect();
  if (!ok) {
    toast('Impossible de connecter le lecteur');
    return;
  }

  state.sdkPlayer = player;
}

/* ======================
   Lecture
   ====================== */
async function playTrack(track) {
  stopAll();

  try {
    // SDK
    if (state.device_id && track.uri) {
      const r = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${state.device_id}`, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + state.access_token },
        body: JSON.stringify({ uris: [track.uri], position_ms: 0 })
      });
      if (!r.ok) throw new Error('SDK play error');
      return;
    }

    // Fallback preview
    if (ENABLE_PREVIEW_FALLBACK && track.preview_url) {
      const a = document.querySelector('audio');
      a.src = track.preview_url;
      await a.play();
      return;
    }

    toast('⚠️ Pas de son pour ce titre');
  } catch (e) {
    console.error(e);
    toast('Erreur lecture: ' + e.message);
  }
}

/* ======================
   Playlist
   ====================== */
async function loadPlaylist() {
  // … récupérer playlist via API comme avant …
  // remplir state.tracks = [ { uri, preview_url, ...}, … ]
}

/* ======================
   Contrôles
   ====================== */
els.btnConnect?.addEventListener('click', beginAuth);

els.btnSkip?.addEventListener('click', () => {
  stopAll();
  state.i++;
  if (state.i < state.tracks.length) {
    playTrack(state.tracks[state.i]);
  } else {
    toast('🎉 Fin de la playlist');
  }
});

els.btnStart?.addEventListener('click', async () => {
  stopAll();
  await initSdkPlayer();
  if (!state.tracks.length) await loadPlaylist();
  if (!state.tracks.length) {
    toast('Aucun titre à jouer');
    return;
  }
  state.i = 0;
  playTrack(state.tracks[0]);
});
