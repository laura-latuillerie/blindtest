// === CONFIG ===
const CLIENT_ID = "60aa43391c744025af27ef49fa04ce31";
const REDIRECT_URI = "https://laura-latuillerie.github.io/blindtest/";
const SCOPES = ""; // lecture des playlists publiques ne nécessite pas de scope particulier

// === UTILS PKCE ===
function base64urlencode(buffer) {
  // convert ArrayBuffer to base64url string
  let str = String.fromCharCode.apply(null, new Uint8Array(buffer));
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

function randomString(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => ('0' + b.toString(16)).slice(-2)).join('');
}

// === PKCE flow ===
async function startAuth() {
  const codeVerifier = base64urlencode(new TextEncoder().encode(randomString(64)));
  localStorage.setItem('pkce_code_verifier', codeVerifier);

  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64urlencode(hashed);

  const state = randomString(16);
  localStorage.setItem('pkce_state', state);

  const authURL = new URL('https://accounts.spotify.com/authorize');
  authURL.searchParams.set('client_id', CLIENT_ID);
  authURL.searchParams.set('response_type', 'code');
  authURL.searchParams.set('redirect_uri', REDIRECT_URI);
  authURL.searchParams.set('code_challenge_method', 'S256');
  authURL.searchParams.set('code_challenge', codeChallenge);
  if (SCOPES) authURL.searchParams.set('scope', SCOPES);
  authURL.searchParams.set('state', state);

  // redirige vers Spotify
  window.location = authURL.toString();
}

async function handleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const storedState = localStorage.getItem('pkce_state');

  if (code) {
    if (state !== storedState) {
      console.error('Etat PKCE mismatch');
      return;
    }

    // échange du code contre token
    const codeVerifier = localStorage.getItem('pkce_code_verifier');

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    });

    try {
      const resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      const data = await resp.json();
      if (data.access_token) {
        // sauvegarde du token (attention : stocker en localStorage -> accessible, acceptable pour test)
        localStorage.setItem('spotify_token', data.access_token);
        localStorage.setItem('spotify_token_expires', Date.now() + (data.expires_in * 1000));
        // enlève le code de l'URL pour propreté
        window.history.replaceState({}, document.title, REDIRECT_URI);
        onLoggedIn();
      } else {
        console.error('Erreur token:', data);
      }
    } catch (e) {
      console.error('Erreur échange token:', e);
    }
  }
}

function isTokenValid() {
  const t = localStorage.getItem('spotify_token');
  const exp = localStorage.getItem('spotify_token_expires');
  return t && exp && Number(exp) > Date.now();
}

// === Lancement du jeu / appels Spotify ===
$(document).ready(async function() {
  // si on revient avec ?code=... -> gérer l'échange
  await handleRedirect();

  if (isTokenValid()) {
    $('#login').hide();
    $('#start').show();
  }

  $('#login').on('click', function() { startAuth(); });

  $('#start').on('click', function() {
    $('#game').show();
    $('#start').hide();
    getTracks();
  });
});

async function getAccessToken() {
  if (isTokenValid()) return localStorage.getItem('spotify_token');
  return null;
}

async function getTracks() {
  const token = await getAccessToken();
  if (!token) {
    alert("Connecte-toi d'abord à Spotify.");
    $('#login').show();
    return;
  }

  const playlistId = "37i9dQZF1DXcBWIGoYBM5M"; // ex : Today's Top Hits

  try {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=20`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const tracks = data.items.filter(i => i.track && i.track.preview_url);
    if (tracks.length < 4) {
      alert("Pas assez de previews dans cette playlist. Choisis-en une autre.");
      return;
    }

    const randomTracks = tracks.sort(() => 0.5 - Math.random()).slice(0, 4);
    const correct = randomTracks[Math.floor(Math.random() * 4)].track;

    $('#player').attr('src', correct.preview_url);
    $('#player')[0].play().catch(()=>{ /* autoplay possible bloqué par navigateur */ });

    $('#choices').empty();
    randomTracks.forEach(t => {
      const btn = $('<button>').text(t.track.name + " — " + t.track.artists.map(a=>a.name).join(', '));
      btn.on('click', function() {
        if (t.track.id === correct.id) {
          $('#result').text("✅ Bonne réponse !");
        } else {
          $('#result').text("❌ Mauvaise réponse ! La bonne était : " + correct.name + " — " + correct.artists.map(a=>a.name).join(', '));
        }
      });
      $('#choices').append(btn);
    });

  } catch (err) {
    console.error(err);
    alert("Erreur lors de la récupération des pistes (vérifie token et CORS).");
  }
}
