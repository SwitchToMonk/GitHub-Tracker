/* ============================================================
   GitHub Tracker
   Public data only. No GitHub API, no API keys, no rate limits.
   Reads github.com HTML pages + the public Atom feeds
   (commits.atom / releases.atom) through the native HTTP bridge,
   which also means no CORS to fight.
   ============================================================ */
(function () {
'use strict';

/* ------------------------------------------------------------------ store */
var store = {
  get: function (k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  keys: function (p) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(p) === 0) out.push(k);
      }
    } catch (e) {}
    return out;
  }
};

/* ----------------------------------------------------------------- sha-256 */
var K256 = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
];
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.codePointAt(i);
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function sha256(str) {
  var bytes = utf8Bytes(String(str));
  var bitLen = bytes.length * 8;
  bytes = bytes.slice();
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var hi = Math.floor(bitLen / 4294967296);
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  bytes.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
           0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Array(64);
  for (var i = 0; i < bytes.length; i += 64) {
    for (var t = 0; t < 16; t++) {
      w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) |
             (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
    }
    for (t = 16; t < 64; t++) {
      var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (t = 0; t < 64; t++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
}

/* ------------------------------------------------------------------ state */
var DEFAULTS = { theme: 'light', accent: 'blue', glow: true, ttl: 2 };
var state = {
  accounts: store.get('gh:accounts', []) || [],
  settings: Object.assign({}, DEFAULTS, store.get('gh:settings', {}) || {}),
  lastSeen: store.get('gh:lastSeen', {}) || {},
  feed: (store.get('gh:feed', null) || {}).items || [],
  feedAt: (store.get('gh:feed', null) || {}).t || 0,
  releases: normalizeReleases((store.get('gh:releases', null) || {}).items || []),
  events: store.get('gh:events', null) || [],
  personal: store.get('gh:personal', null),
  contrib: store.get('gh:contrib', null) || {},
  meta: store.get('gh:meta', null) || {}
};
var syncing = false;
var renderToken = 0;

/* ---------------- live sync ----------------
   There is no refresh interval to choose: while the app is open it keeps
   syncing. Commit, release and contribution feeds are re-read on every tick;
   profile and repo pages are re-read every couple of minutes since they
   rarely change. If GitHub starts throttling, the loop backs off rather
   than hammering it. */
var LIVE_MS = 45000;
var liveTimer = null;
var watchTimer = null;
var liveTickCount = 0;
var backoffUntil = 0, backoffMs = 0;
var lastSyncAt = 0, lastAttemptAt = 0;
var contribLoading = {};
var lastRouteKey = '';

function noteThrottle() {
  backoffMs = Math.min(120000, backoffMs ? backoffMs * 2 : 30000);
  backoffUntil = Date.now() + backoffMs;
}
function isThrottled() { return Date.now() < backoffUntil; }

function liveTick() {
  if (document.hidden) return;
  if (navigator.onLine === false) return;
  if (isThrottled()) return;
  if (!store.get('gh:session', false)) return;
  liveTickCount++;
  /* every fifth tick also re-reads profiles, repo lists and the whole release
     set, so nothing drifts while the cheap ticks keep the feeds current */
  syncAll(true, liveTickCount % 5 === 0);
}

function startLive() {
  stopLive();
  liveTimer = setInterval(liveTick, LIVE_MS);
  /* watchdog: if a tick was missed (webview throttling, a long fetch, a short
     network drop) catch up as soon as the app is visible again */
  if (!watchTimer) {
    watchTimer = setInterval(function () {
      if (document.hidden) return;
      if (!store.get('gh:session', false)) return;
      if (syncing) return;
      if (navigator.onLine === false) return;
      var gap = Date.now() - (lastAttemptAt || lastSyncAt || Date.now());
      if (gap > LIVE_MS * 2.5) { backoffUntil = 0; backoffMs = 0; syncAll(true, true); }
    }, 15000);
  }
}
function stopLive() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

function saveAccounts() { store.set('gh:accounts', state.accounts); }
function saveSettings() { store.set('gh:settings', state.settings); }
function saveSeen() { store.set('gh:lastSeen', state.lastSeen); }

/* ------------------------------------------------------------------ utils */
function $(s) { return document.querySelector(s); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function txt(node) { return node ? (node.textContent || '').trim() : ''; }
function numFrom(node) {
  var s = txt(node).replace(/,/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
function rel(iso) {
  if (!iso) return '';
  var t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  var d = Date.now() - t;
  if (d < 0) d = 0;
  var m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  var dd = Math.floor(h / 24);
  if (dd < 30) return dd + 'd ago';
  var mo = Math.floor(dd / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.floor(mo / 12) + 'y ago';
}
function avatarUrl(login, size) {
  return 'https://github.com/' + encodeURIComponent(login) + '.png?size=' + (size || 200);
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }

/* -------------------------------------------------------------------- net */
var jidSeq = 0, jids = {};
window.__raw = function (jid, ok, text) {
  var f = jids[jid];
  if (!f) return;
  delete jids[jid];
  if (ok) f.res(text); else f.rej(new Error(text || 'request failed'));
};
function rawGet(url) {
  return new Promise(function (res, rej) {
    if (!(window.Tracker && window.Tracker.raw)) { rej(new Error('no bridge')); return; }
    var jid = 'j' + (++jidSeq);
    jids[jid] = { res: res, rej: rej };
    try { window.Tracker.raw(url, jid); } catch (e) { delete jids[jid]; rej(e); return; }
    setTimeout(function () {
      if (jids[jid]) { delete jids[jid]; rej(new Error('timed out')); }
    }, 30000);
  });
}

/* polite queue: never more than 3 requests at once, small gap between rounds */
var q = [], active = 0;
function enqueue(fn) {
  return new Promise(function (res, rej) { q.push({ fn: fn, res: res, rej: rej }); pump(); });
}
function pump() {
  while (active < 3 && q.length) {
    (function (it) {
      active++;
      Promise.resolve().then(it.fn).then(it.res, it.rej).then(function () {
        active--;
        setTimeout(pump, 180);
      });
    })(q.shift());
  }
}

function friendlyError(e) {
  var m = String((e && e.message) || e || 'could not load');
  if (/HTTP 429/.test(m)) return 'GitHub is throttling requests — try again in a minute';
  if (/HTTP 403/.test(m)) return 'GitHub refused the request — try again shortly';
  if (/HTTP 404/.test(m)) return 'Not found on GitHub';
  if (/HTTP 5\d\d/.test(m)) return 'GitHub had a server error — try again';
  if (/timed out/.test(m)) return 'The request timed out — check your connection';
  if (/no bridge/.test(m)) return 'Network bridge unavailable';
  return m;
}

function cacheKey(url) { return 'gh:c:' + url; }
function getCached(url) {
  var c = store.get(cacheKey(url), null);
  if (!c) return null;
  var ttl = (Number(state.settings.ttl) || 10) * 60000;
  if (Date.now() - c.t > ttl) return null;
  return c.v;
}
function getCachedAny(url) {
  try {
    var c = store.get(cacheKey(url), null);
    return (c && typeof c.v === 'string') ? c.v : null;
  } catch (e) { return null; }
}

function fetchText(url, force) {
  if (!force) {
    var hit = getCached(url);
    if (hit != null) return Promise.resolve(hit);
  }
  return enqueue(function () { return rawGet(url); }).then(function (body) {
    store.set(cacheKey(url), { t: Date.now(), v: body });
    return body;
  }).catch(function (err) {
    /* offline (or throttled): serve the last copy saved on the device */
    var stale = getCachedAny(url);
    if (stale != null) return stale;
    throw err;
  });
}

/* ---------------------------------------------------------------- parsing */
var DP = new DOMParser();
function parseHtml(s) { return DP.parseFromString(s, 'text/html'); }
function parseXml(s) { return DP.parseFromString(s, 'text/xml'); }

function atomEntries(xmlText) {
  var doc = parseXml(xmlText);
  if (!doc || doc.querySelector('parsererror')) throw new Error('bad feed');
  var out = [];
  var entries = doc.querySelectorAll('entry');
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var link = e.querySelector('link[rel="alternate"]') || e.querySelector('link');
    out.push({
      title: txt(e.querySelector('title')),
      updated: txt(e.querySelector('updated')) || txt(e.querySelector('published')),
      link: link ? (link.getAttribute('href') || '') : '',
      content: (e.querySelector('content') || {}).textContent || '',
      author: txt(e.querySelector('author name')),
      id: txt(e.querySelector('id'))
    });
  }
  return out;
}

function parseCount(doc, tab) {
  var a = doc.querySelector('a[href*="tab=' + tab + '"]');
  if (!a) return 0;
  var t = txt(a);                        // e.g. "330k followers"
  var m = t.match(/([\d.,]+)\s*([km])?/i);
  if (!m) return 0;
  var n = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(n)) return 0;
  if (m[2]) n *= (m[2].toLowerCase() === 'k' ? 1000 : 1000000);
  return Math.round(n);
}

function parseProfile(html, login) {
  var doc = parseHtml(html);
  var name = txt(doc.querySelector('.p-name')) || login;
  var bioEl = doc.querySelector('.p-note');
  var bio = bioEl && !bioEl.hasAttribute('hidden') ? txt(bioEl) : '';
  var followers = parseCount(doc, 'followers');
  var following = parseCount(doc, 'following');
  return { login: login, name: name, bio: bio, followers: followers, following: following };
}

function parseRepos(html) {
  var doc = parseHtml(html);
  var out = [];
  var list = doc.querySelectorAll('#user-repositories-list li');
  for (var i = 0; i < list.length; i++) {
    var li = list[i];
    var a = li.querySelector('a[itemprop="name codeRepository"]') || li.querySelector('h3 a');
    if (!a) continue;
    var name = txt(a);
    if (!name) continue;
    var colorEl = li.querySelector('.repo-language-color');
    var color = '';
    if (colorEl) {
      var st = colorEl.getAttribute('style') || '';
      var m = st.match(/background-color:\s*([^;]+)/i);
      if (m) color = m[1].trim();
    }
    var upd = li.querySelector('relative-time');
    var forkEl = li.querySelector('.octicon-repo-forked');
    out.push({
      name: name,
      desc: txt(li.querySelector('p[itemprop="description"]')),
      lang: txt(li.querySelector('span[itemprop="programmingLanguage"]')),
      color: color,
      stars: numFrom(li.querySelector('a[href$="/stargazers"]')),
      forks: numFrom(li.querySelector('a[href$="/forks"]')),
      updated: upd ? (upd.getAttribute('datetime') || '') : '',
      fork: !!forkEl && (li.className || '').indexOf('fork') >= 0
    });
  }
  return out;
}

/* ------------------------------------------------------------------- data */
function fetchProfile(login, force) {
  return fetchText('https://github.com/' + encodeURIComponent(login), force)
    .then(function (html) { return parseProfile(html, login); });
}
function fetchRepos(login, force) {
  return fetchText('https://github.com/' + encodeURIComponent(login) + '?tab=repositories', force)
    .then(parseRepos);
}
function fetchCommits(owner, repo, force) {
  return fetchText('https://github.com/' + owner + '/' + repo + '/commits.atom', force)
    .then(atomEntries);
}
function fetchReleases(owner, repo, force) {
  return fetchText('https://github.com/' + owner + '/' + repo + '/releases.atom', force)
    .then(atomEntries);
}

/* --------------------------------------------------------- contributions */
/* github.com/users/<login>/contributions is the public fragment the profile
   page lazy-loads: one <td data-date data-level> per day plus a <tool-tip>
   carrying the exact count for that day, and an <h2> with the yearly total. */
/* Issues and pull requests are not in the Atom feeds, so the public search
   page is used: it carries a machine-readable "N results" count. Returns -1
   when the count cannot be read, and the UI shows a dash instead of a lie. */
function parseSearchCount(html) {
  var doc = parseHtml(html);
  var el = doc.querySelector('#search-results-count');
  if (el) {
    var m = txt(el).match(/([\d,]+)/);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  var m2 = String(html).match(/([\d,]+)\s+results?/i);
  return m2 ? parseInt(m2[1].replace(/,/g, ''), 10) : -1;
}

function fetchIssueCount(login, force) {
  return fetchText('https://github.com/search?q=author%3A' + encodeURIComponent(login) + '&type=issues', force)
    .then(parseSearchCount);
}

function fetchPrCount(login, force) {
  return fetchText('https://github.com/search?q=author%3A' + encodeURIComponent(login) + '&type=pullrequests', force)
    .then(parseSearchCount);
}

function fetchContributions(login, force) {
  return fetchText('https://github.com/users/' + encodeURIComponent(login) + '/contributions', force)
    .then(parseContributions);
}

function parseContributions(html) {
  var doc = parseHtml(html);
  var counts = {};
  var tips = doc.querySelectorAll('tool-tip[for]');
  for (var i = 0; i < tips.length; i++) {
    var m = txt(tips[i]).match(/(\d[\d,]*|no)\s+contribution/i);
    if (!m) continue;
    counts[tips[i].getAttribute('for') || ''] =
      /^no$/i.test(m[1]) ? 0 : parseInt(m[1].replace(/,/g, ''), 10);
  }
  var days = [];
  var cells = doc.querySelectorAll('td.ContributionCalendar-day');
  for (var j = 0; j < cells.length; j++) {
    var c = cells[j];
    var date = c.getAttribute('data-date');
    if (!date) continue;
    days.push({
      date: date,
      level: parseInt(c.getAttribute('data-level') || '0', 10) || 0,
      count: counts[c.getAttribute('id') || ''] || 0
    });
  }
  days.sort(function (x, y) { return x.date.localeCompare(y.date); });
  var total = 0;
  var h2 = doc.querySelector('h2');
  if (h2) {
    var tm = txt(h2).match(/([\d,]+)/);
    if (tm) total = parseInt(tm[1].replace(/,/g, ''), 10);
  }
  if (!total) days.forEach(function (d) { total += d.count; });
  return { days: days, total: total, at: Date.now() };
}

function streaks(days) {
  var best = 0, run = 0, cur = 0;
  for (var i = 0; i < days.length; i++) {
    if (days[i].count > 0) { run++; if (run > best) best = run; } else run = 0;
  }
  /* today may not have any contributions yet — do not let it break the streak */
  var end = days.length - 1;
  var today = new Date().toISOString().slice(0, 10);
  if (end >= 0 && days[end].date === today && days[end].count === 0) end--;
  for (var k = end; k >= 0; k--) { if (days[k].count > 0) cur++; else break; }
  return { current: cur, longest: best };
}

function bestDay(days) {
  var b = { date: '', count: 0 };
  for (var i = 0; i < days.length; i++) if (days[i].count > b.count) b = days[i];
  return b;
}

function persistContrib() { store.set('gh:contrib', state.contrib); }

function ensureContrib(login) {
  if (contribLoading[login]) return;
  contribLoading[login] = true;
  fetchContributions(login, false).then(function (c) {
    state.contrib[login] = c;
    persistContrib();
  }).catch(function () {}).then(function () {
    contribLoading[login] = false;
    if (parseHash().name === 'me') render();
  });
}

var REPOS_PER_ACCOUNT = 5;       // repos that get a commit feed pulled
var RELEASES_PER_ACCOUNT = 10;   // repos that get a release feed pulled
var ASSETS_AUTOLOAD = 8;         // release asset lists fetched up front

function syncAll(silent, full) {
  if (syncing || !state.accounts.length) return Promise.resolve();
  syncing = true;
  lastAttemptAt = Date.now();
  if (!silent) setSyncPill(true);

  /* releases merge into what we already know, so a live tick that only
     refreshes the top few repos never drops releases from the rest */
  var relMap = {};
  (state.releases || []).forEach(function (r) { relMap[r.owner + '/' + r.name + '@' + r.tag] = r; });
  /* commits merge as well, so a tick whose fetches fail never blanks the feed */
  var commitMap = {};
  (state.feed || []).forEach(function (it) {
    if (it.type === 'commit') commitMap[it.url || (it.repo + '|' + it.title)] = it;
  });
  var chain = Promise.resolve();

  state.accounts.forEach(function (a) {
    chain = chain.then(function () {
      return fetchProfile(a.login, !!full).then(function (p) {
        a.name = p.name; a.bio = p.bio;
        a.followers = p.followers; a.following = p.following;
        a.error = '';
        return fetchRepos(a.login, !!full);
      }).then(function (repos) {
        var oldNames = {};
        (a.repoList || []).forEach(function (r) { oldNames[r.name] = 1; });
        var hadRepos = (a.repoList || []).length > 0;
        a.repoList = repos;
        a.repoCount = repos.length;
        a.syncedAt = Date.now();
        /* a repo that was not in the previous list is an event of its own */
        if (hadRepos) {
          repos.forEach(function (r) {
            if (oldNames[r.name]) return;
            pushEvent({
              type: 'repo', account: a.login, repo: a.login + '/' + r.name,
              title: 'New repository · ' + r.name,
              updated: new Date().toISOString(),
              url: 'https://github.com/' + a.login + '/' + r.name
            });
          });
        }
        var jobs = [];
        var vis = visibleRepos(a);
        vis.slice(0, REPOS_PER_ACCOUNT).forEach(function (r) {
          jobs.push(fetchCommits(a.login, r.name, true).then(function (cs) {
            cs.slice(0, 6).forEach(function (c) {
              commitMap[c.link || (a.login + '/' + r.name + '|' + c.title)] = {
                type: 'commit', account: a.login, repo: a.login + '/' + r.name,
                title: c.title, updated: c.updated, url: c.link, author: c.author
              };
            });
          }).catch(function () {}));
        });
        var relCount = full ? RELEASES_PER_ACCOUNT : Math.min(3, RELEASES_PER_ACCOUNT);
        vis.slice(0, relCount).forEach(function (r) {
          jobs.push(fetchReleases(a.login, r.name, true).then(function (rs) {
            rs.slice(0, 6).forEach(function (x) {
              var u = x.link || '';
              var tag = u ? decodeURIComponent(u.split('/').pop()) : String(x.title || '');
              relMap[a.login + '/' + r.name + '@' + tag] = {
                type: 'release', account: a.login, repo: a.login + '/' + r.name,
                owner: a.login, name: r.name, tag: tag,
                title: x.title, updated: x.updated, url: u, author: x.author, body: x.content
              };
            });
          }).catch(function () {}));
        });
        if (state.personal && state.personal === a.login) {
          jobs.push(fetchContributions(a.login, true).then(function (c) {
            state.contrib[a.login] = c;
            persistContrib();
          }).catch(function () {}));
          state.meta = state.meta || {};
          jobs.push(fetchIssueCount(a.login, !!full).then(function (n) {
            state.meta[a.login] = state.meta[a.login] || {};
            state.meta[a.login].issues = n;
            store.set('gh:meta', state.meta);
          }).catch(function () {}));
          jobs.push(fetchPrCount(a.login, !!full).then(function (n) {
            state.meta[a.login] = state.meta[a.login] || {};
            state.meta[a.login].prs = n;
            store.set('gh:meta', state.meta);
          }).catch(function () {}));
        }
        return Promise.all(jobs);
      }).catch(function (e) {
        a.error = friendlyError(e);
        if (/HTTP (429|403)/.test(String((e && e.message) || e))) noteThrottle();
      });
    });
  });

  return chain.then(function () {
    var relItems = Object.keys(relMap).map(function (k) { return relMap[k]; });
    relItems.sort(function (x, y) { return String(y.updated || '').localeCompare(String(x.updated || '')); });
    if (relItems.length > 300) relItems = relItems.slice(0, 300);
    relItems = normalizeReleases(relItems);
    state.releases = relItems;
    store.set('gh:releases', { t: Date.now(), items: relItems });

    var items = Object.keys(commitMap).map(function (k) { return commitMap[k]; })
      .concat(relItems).concat(state.events || []);
    items.sort(function (x, y) { return String(y.updated || '').localeCompare(String(x.updated || '')); });
    if (items.length > 250) items = items.slice(0, 250);
    state.feed = items;
    state.feedAt = Date.now();
    lastSyncAt = Date.now();
    store.set('gh:feed', { t: state.feedAt, items: items });

    /* notifications: only for accounts the user opted into, and only for items
       that appeared since the previous sync — the first sync is a baseline */
    state.accounts.forEach(function (a) {
      if (!a.seenAt) { a.seenAt = Date.now(); return; }
      if (!a.notify) { a.seenAt = Date.now(); return; }
      var fresh = items.filter(function (it) {
        return it.account === a.login && new Date(it.updated || 0).getTime() > a.seenAt;
      });
      if (fresh.length) pushNotify(a, fresh);
      a.seenAt = Date.now();
    });

    saveAccounts();
    syncing = false;
    setSyncPill(false);
    softSyncUpdate();
    pushWidgets();
  }).catch(function () {
    syncing = false; setSyncPill(false); softSyncUpdate();
  });
}

function setSyncPill(on) {
  var p = $('#syncPill');
  if (p) p.hidden = !on;
}

/* --------------------------------------------------------------- releases */
var assetsCache = {};                 // "owner/repo@tag" -> [assets] | 'loading'
var assetsFail = {};                  // key -> time of last failure
var assetsLimit = ASSETS_AUTOLOAD;

/* Older versions stored releases without owner/name/tag, which broke the
   file lookup and produced duplicates. Everything is rebuilt from the URL. */
function normalizeReleases(list) {
  var out = {};
  (list || []).forEach(function (r) {
    if (!r) return;
    var owner = r.owner, name = r.name, tag = r.tag;
    if (!owner && r.repo && String(r.repo).indexOf('/') > 0) {
      var bits = String(r.repo).split('/');
      owner = bits[0]; name = bits[1];
    }
    if (!tag && r.url) {
      var m = String(r.url).match(/\/releases\/tag\/(.+)$/);
      if (m) tag = decodeURIComponent(m[1]);
    }
    if (!tag && r.title) tag = String(r.title);
    if (!owner || !name || !tag) return;
    var key = owner + '/' + name + '@' + tag;
    r.owner = owner; r.name = name; r.tag = tag;
    if (!out[key] || String(r.updated || '') > String(out[key].updated || '')) out[key] = r;
  });
  var res = Object.keys(out).map(function (k) { return out[k]; });
  res.sort(function (x, y) { return String(y.updated || '').localeCompare(String(x.updated || '')); });
  return res;
}

function assetKey(r) { return r.owner + '/' + r.name + '@' + r.tag; }
function assetUrl(r) {
  return 'https://github.com/' + r.owner + '/' + r.name +
         '/releases/expanded_assets/' + encodeURIComponent(r.tag);
}

/* GitHub renders each release's files in a lazily loaded fragment:
   /owner/repo/releases/expanded_assets/<tag>. It lists the uploaded
   assets (.apk, .aab …) plus the automatic source zip/tar.gz. */
function parseAssets(html) {
  var doc = parseHtml(html);
  var out = [];
  var rows = doc.querySelectorAll('li.Box-row');
  for (var i = 0; i < rows.length; i++) {
    var li = rows[i];
    var a = li.querySelector('a[href*="/releases/download/"]') ||
            li.querySelector('a[href*="/archive/refs/tags/"]');
    if (!a) continue;
    var href = a.getAttribute('href') || '';
    /* the full link text distinguishes "Source code (zip)" from "(tar.gz)";
       the .text-bold span only says "Source code" */
    var name = txt(a) || txt(a.querySelector('.text-bold')) || href.split('/').pop();
    var sm = txt(li).match(/([\d.]+)\s*([KMG]B)/i);
    var isSource = href.indexOf('/archive/refs/tags/') >= 0;
    var kind = isSource ? 'source'
      : (/\.apk$/i.test(name) ? 'apk'
      : (/\.(aab|xapk)$/i.test(name) ? 'bundle' : 'file'));
    out.push({
      name: name,
      url: href.indexOf('http') === 0 ? href : 'https://github.com' + href,
      size: sm ? (sm[1] + ' ' + sm[2].toUpperCase()) : '',
      kind: kind
    });
  }
  return out;
}

function autoloadAssets(list) {
  var pending = [];
  (list || []).slice(0, assetsLimit).forEach(function (r) {
    var k = assetKey(r);
    if (assetsCache[k]) return;
    if (assetsFail[k] && Date.now() - assetsFail[k] < 60000) return;  // back off a minute
    assetsCache[k] = 'loading';
    pending.push(r);
  });
  if (!pending.length) return;
  Promise.all(pending.map(function (r) {
    var k = assetKey(r);
    return fetchText(assetUrl(r), true).then(function (html) {
      assetsCache[k] = parseAssets(html);
      delete assetsFail[k];
    }).catch(function () {
      delete assetsCache[k];
      assetsFail[k] = Date.now();
    });
  })).then(function () {
    var rn = parseHash().name;
    if (rn === 'releases' || rn === 'release') render();
  });
}

function hasApk(r) {
  var a = assetsCache[assetKey(r)];
  if (!a || a === 'loading') return false;
  for (var i = 0; i < a.length; i++) if (a[i].kind === 'apk' || a[i].kind === 'bundle') return true;
  return false;
}

function assetRows(r) {
  var k = assetKey(r);
  var a = assetsCache[k];
  if (a === 'loading') return '<div class="spinwrap sm"><div class="spinner"></div></div>';
  if (!a && assetsFail[k]) {
    return '<div class="assetnone">Could not load the files — ' +
      '<button class="retrylink" data-retryassets="' + esc(k) + '">tap to retry</button></div>';
  }
  if (!a || !a.length) return '<div class="assetnone">No downloadable files in this release.</div>';
  return a.map(function (x) {
    var chip = x.kind === 'apk' ? '<span class="achip apk">APK</span>'
      : x.kind === 'bundle' ? '<span class="achip apk">BUNDLE</span>'
      : x.kind === 'source' ? '<span class="achip src">SOURCE</span>'
      : '<span class="achip">FILE</span>';
    var ic = x.kind === 'source' ? I.archive : I.package;
    var cls = x.kind === 'source' ? 'asset src' : 'asset';
    var sub = x.size || (x.kind === 'source' ? 'Source archive' : 'Tap to download');
    return '<div class="assetrow" data-download="' + esc(x.url) + '" data-name="' + esc(x.name) + '">' +
      '<div class="eicon ' + cls + '">' + ic + '</div>' +
      '<div class="lmain"><div class="ltitle">' + esc(x.name) + '</div>' +
      '<div class="lsub">' + esc(sub) + '</div></div>' +
      chip + '<div class="dlbtn">' + I.download + '</div></div>';
  }).join('');
}

/* ---------------------------------------------------------------- account */
function hiddenSet(a) {
  var m = {};
  (a.hidden || []).forEach(function (n) { m[n] = 1; });
  return m;
}
/* every repo is tracked unless the user switched it off */
function visibleRepos(a) {
  var hid = hiddenSet(a);
  return (a.repoList || []).filter(function (r) { return !hid[r.name]; });
}

function findAccount(login) {
  for (var i = 0; i < state.accounts.length; i++) {
    if (state.accounts[i].login.toLowerCase() === String(login).toLowerCase()) return state.accounts[i];
  }
  return null;
}
function addAccount(login) {
  login = String(login || '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) {
    return Promise.reject(new Error('That is not a valid GitHub username'));
  }
  if (findAccount(login)) return Promise.reject(new Error('You are already tracking @' + login));
  return fetchProfile(login).then(function (p) {
    var acc = {
      login: p.login, name: p.name, bio: p.bio,
      followers: p.followers, following: p.following,
      addedAt: Date.now(), syncedAt: 0, repoList: [], repoCount: 0
    };
    state.accounts.push(acc);
    saveAccounts();
    pushEvent({
      type: 'account', account: p.login, repo: '',
      title: 'Started tracking @' + p.login,
      updated: new Date().toISOString(),
      url: 'https://github.com/' + p.login
    });
    toast('Now tracking @' + p.login);
    return syncAll(true).then(function () { return acc; });
  });
}
function removeAccount(login) {
  state.accounts = state.accounts.filter(function (a) { return a.login !== login; });
  saveAccounts();
  state.feed = state.feed.filter(function (it) { return it.account !== login; });
  store.set('gh:feed', { t: state.feedAt, items: state.feed });
  render();
}

/* ------------------------------------------------------------------- icons */
var I = {
  commit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M3 12h5.8M15.2 12H21"/></svg>',
  release: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>',
  repo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 3v13"/><path d="M4 17h16"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8z"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.2"/><circle cx="18" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M6 7.2v2.3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7.2"/><path d="M12 12.5V16.8"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20.5c0-3.7 3.4-6 7.5-6s7.5 2.3 7.5 6"/></svg>',
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4z"/><path d="M3 7.4l9 4.8 9-4.8"/><path d="M12 12.2v9.2"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4.5" rx="1.2"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5"/><path d="M10 12h4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><polyline points="20.5 3.5 20.5 9 15 9"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4 18h16z"/><path d="M10 21h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l.8 13h9.4l.8-13"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.1"/></svg>'
};

/* ------------------------------------------------------------------ toast */
function toast(msg) {
  var box = $('#toasts');
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 300);
  }, 2400);
}

/* ------------------------------------------------------------------ sheet */
function openSheet(title, bodyHtml, onMount) {
  var s = $('#sheet');
  s.innerHTML = '<div class="sheetcard">' +
    '<div class="sheetgrab"></div>' +
    '<div class="sheethead"><b>' + esc(title) + '</b>' +
    '<button class="iconbtn" id="sheetClose" aria-label="Close">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>' +
    '</button></div><div class="sheetbody">' + bodyHtml + '</div></div>';
  s.hidden = false;
  document.body.classList.add('sheetopen');
  $('#sheetClose').onclick = closeSheet;
  s.onclick = function (e) { if (e.target === s) closeSheet(); };
  if (onMount) onMount(s);
}
function closeSheet() {
  var s = $('#sheet');
  s.hidden = true;
  s.innerHTML = '';
  document.body.classList.remove('sheetopen');
}
function confirmSheet(title, msg, okLabel, onOk) {
  openSheet(title,
    '<p class="dim" style="margin:0 4px 18px;line-height:1.6">' + esc(msg) + '</p>' +
    '<div class="btncol"><button class="btn danger btnblock" id="cfOk">' + esc(okLabel) + '</button>' +
    '<button class="btn ghost btnblock" id="cfNo">Cancel</button></div>',
    function () {
      $('#cfNo').onclick = closeSheet;
      $('#cfOk').onclick = function () { closeSheet(); onOk(); };
    });
}

/* ------------------------------------------------------------------- theme */
var ACCENTS = ['blue', 'purple', 'green', 'pink', 'amber', 'teal', 'red', 'indigo'];
function isHex(v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')); }
function shadeHex(hex, pct) {
  var n = parseInt(hex.slice(1), 16);
  var f = pct < 0 ? 1 + pct : 1;
  var r = Math.round(((n >> 16) & 255) * f);
  var g = Math.round(((n >> 8) & 255) * f);
  var b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function hexA(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function accentValue(a) { return isHex(a) ? a : ({ blue: '#1B6EF3', purple: '#8B5CF6', green: '#12B76A',
  pink: '#EC4899', amber: '#F59E0B', teal: '#14B8A6', red: '#EF4444', indigo: '#6366F1' })[a] || '#1B6EF3'; }

function applySettings() {
  var s = state.settings;
  document.body.classList.toggle('dark', s.theme === 'dark');
  document.body.classList.toggle('pitch', s.theme === 'pitch');
  var root = document.documentElement;
  /* a custom hex overrides every preset through inline custom properties */
  if (isHex(s.accent)) {
    root.setAttribute('data-accent', 'custom');
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--accentD', shadeHex(s.accent, -0.18));
    root.style.setProperty('--glow', hexA(s.accent, 0.42));
    root.style.setProperty('--glow2', hexA(s.accent, 0.14));
  } else {
    root.setAttribute('data-accent', s.accent || 'blue');
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accentD');
    root.style.removeProperty('--glow');
    root.style.removeProperty('--glow2');
  }
  root.setAttribute('data-glow', s.glow ? 'on' : 'off');
  var bg = s.theme === 'pitch' ? '#000000' : (s.theme === 'dark' ? '#161719' : '#F2F2F2');
  var light = s.theme === 'light';
  var meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', bg);
  try {
    if (window.Tracker && window.Tracker.theme) window.Tracker.theme(bg, light);
  } catch (e) {}
  pushWidgets();
}

/* ------------------------------------------------------------------- views */
function emptyState(title, msg, btn, icon) {
  return '<div class="card"><div class="empty">' +
    '<div class="emptyic">' + (icon || I.user) + '</div>' +
    '<div style="font-weight:700;color:var(--text);font-size:16px;margin-bottom:8px">' + esc(title) + '</div>' +
    esc(msg) + (btn ? '<div style="height:18px"></div>' + btn : '') +
    '</div></div>';
}

function statPills(list) {
  return '<div class="qstats">' + list.map(function (x) {
    return '<button class="qstat" ' + (x[2] || '') + '><b>' + esc(x[1]) + '</b><span>' + esc(x[0]) + '</span></button>';
  }).join('') + '</div>';
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function hlRow(icon, label, value) {
  return '<div class="lrow"><div class="eicon push">' + icon + '</div>' +
    '<div class="lmain"><div class="ltitle">' + esc(label) + '</div>' +
    '<div class="lsub">' + esc(value) + '</div></div></div>';
}

function hourBars(arr, max) {
  return '<div class="daybars hourbars">' + arr.map(function (v, i) {
    var h = Math.max(3, Math.round((v / max) * 64));
    return '<div class="daybar' + (v === max && max > 1 ? ' cur' : '') + '">' +
      '<span style="height:' + h + 'px"></span>' +
      '<i>' + (i % 6 === 0 ? i : '') + '</i></div>';
  }).join('') + '</div>';
}

function feedRow(it) {
  var seen = state.lastSeen[it.account] || 0;
  var unread = new Date(it.updated || 0).getTime() > seen;
  var t = it.type;
  var icon = t === 'release' ? I.release : t === 'repo' ? I.repo : t === 'account' ? I.user : I.commit;
  var cls = t === 'release' ? 'tag' : t === 'repo' ? 'repo' : t === 'account' ? 'account' : 'push';
  var label = t === 'release' ? 'Release' : t === 'repo' ? 'Repository' : t === 'account' ? 'Account' : 'Commit';
  var sub = it.repo ? (esc(it.repo) + ' · ' + esc(rel(it.updated))) : esc(rel(it.updated));
  return '<div class="lrow' + (unread ? ' unread' : '') + '" data-feed="' + esc(it.url || it.title || '') + '">' +
    '<span class="ndot"></span>' +
    '<div class="eicon ' + cls + '">' + icon + '</div>' +
    '<div class="lmain">' +
      '<div class="ltitle">' + esc(it.title || label) + '</div>' +
      '<div class="lsub">' + sub + '</div>' +
    '</div></div>';
}

/* ---------------- animation controller (ported from Gitly) ---------------- */
var ENTER_T = null;
var SEEN_ROWS = {};
var PAINTED = {};

function playEnter() {
  try {
    document.body.classList.add('entering');
    if (ENTER_T) clearTimeout(ENTER_T);
    ENTER_T = setTimeout(function () {
      try { document.body.classList.remove('entering'); } catch (e) { }
    }, 1100);
  } catch (e) { }
}

/* A sync NEVER repaints the page. New rows are slid in at the top of the list
   that is already on screen (the Gitly behaviour); everything else is left
   exactly where it is. */
function feedKey(it) { return it.url || it.title || ''; }

function currentItems(name) {
  if (name === 'home') return state.feed.slice(0, 25);
  return state.feed.filter(function (it) {
    if (actFilter === 'commit') return it.type === 'commit';
    if (actFilter === 'release') return it.type === 'release';
    return true;
  }).slice(0, 60);
}

function prependNewRows(listEl, name) {
  var have = {};
  var rows = listEl.querySelectorAll('.lrow[data-feed]');
  for (var i = 0; i < rows.length; i++) have[rows[i].getAttribute('data-feed')] = 1;

  var items = currentItems(name);
  var fresh = [];
  for (var j = items.length - 1; j >= 0; j--) {
    var k = feedKey(items[j]);
    if (k && !have[k]) fresh.push(items[j]);
  }
  if (!fresh.length) return;

  listEl.classList.add('slide-anim');
  var tmp = document.createElement('div');
  for (var f = 0; f < fresh.length; f++) {
    tmp.innerHTML = feedRow(fresh[f]);
    var node = tmp.firstElementChild;
    if (!node) continue;
    node.classList.add('slide-top');
    node.classList.remove('new-in');
    listEl.insertBefore(node, listEl.firstChild);
    (function (n) {
      var done = function (ev) {
        if (ev.animationName === 'slideTop') {
          n.classList.remove('slide-top');
          n.classList.add('settled');
          n.removeEventListener('animationend', done);
        }
      };
      n.addEventListener('animationend', done);
      setTimeout(function () { try { n.classList.remove('slide-top'); n.classList.add('settled'); } catch (e) { } }, 900);
    })(node);
  }
  setTimeout(function () { try { listEl.classList.remove('slide-anim'); } catch (e) { } }, 700);

  var max = name === 'home' ? 30 : 65;
  var all = listEl.querySelectorAll('.lrow[data-feed]');
  for (var t = all.length - 1; t >= max; t--) { try { listEl.removeChild(all[t]); } catch (e) { } }
}

function updateCounters() {
  var commits = 0, releases = 0, repos = 0;
  state.accounts.forEach(function (a) { repos += visibleRepos(a).length; });
  state.feed.forEach(function (it) {
    if (it.type === 'release') releases++;
    else if (it.type === 'commit') commits++;
  });
  var b = document.querySelectorAll('#view .qstat b');
  if (b.length >= 3) {
    b[0].textContent = compact(commits);
    b[1].textContent = compact(releases);
    b[2].textContent = compact(repos);
  }
  var sub = document.querySelector('#view .sumsub');
  if (sub) sub.textContent = repos + ' public repos · ' + state.feed.length + ' recent updates';
}

function softSyncUpdate() {
  var r = parseHash();
  if (r.name !== 'home' && r.name !== 'activity') return;
  var listEl = document.querySelector('#view .card.list');
  if (!listEl) { render(); return; }
  prependNewRows(listEl, r.name);
  updateCounters();
}

/* rows that were already on screen never replay their entrance; genuinely new
   ones slide in and get a brief tint */
function paintRows(routeKey, navigated) {
  var first = !PAINTED[routeKey];
  var rows = document.querySelectorAll('#view .lrow[data-feed]');
  for (var i = 0; i < rows.length; i++) {
    var n = rows[i];
    var k = n.getAttribute('data-feed') || '';
    if (!k) continue;
    if (SEEN_ROWS[k] || navigated) {
      SEEN_ROWS[k] = 1;
      n.classList.add('settled');
    } else {
      SEEN_ROWS[k] = 1;
      n.classList.add('new-in');
      (function (row) {
        var done = function (ev) {
          if (ev.animationName === 'newIn') {
            row.classList.add('settled');
            row.removeEventListener('animationend', done);
          }
        };
        row.addEventListener('animationend', done);
      })(n);
    }
  }
  PAINTED[routeKey] = 1;
}

function pushEvent(ev) {
  state.events = state.events || [];
  for (var i = 0; i < state.events.length; i++) {
    if (state.events[i].url === ev.url && state.events[i].type === ev.type) return;
  }
  state.events.unshift(ev);
  if (state.events.length > 80) state.events = state.events.slice(0, 80);
  store.set('gh:events', state.events);
}

/* one JSON snapshot for the home screen widgets */
function pushWidgets() {
  if (!(window.Tracker && window.Tracker.widgetSync)) return;
  try {
    var p = state.personal;
    var c = p && state.contrib[p];
    var payload = {
      updated: Date.now(),
      theme: state.settings.theme,
      accent: accentValue(state.settings.accent),
      pitch: !!state.settings.widgetPitch,
      updates: state.feed.slice(0, 6).map(function (it) {
        return { t: it.title || '', s: (it.repo ? it.repo + ' · ' : '') + rel(it.updated), k: it.type };
      }),
      commits: state.feed.filter(function (it) { return it.type === 'commit'; }).slice(0, 6).map(function (it) {
        return { t: it.title || '', s: (it.repo ? it.repo + ' · ' : '') + rel(it.updated) };
      }),
      releases: (state.releases || []).slice(0, 3).map(function (r) {
        return { t: r.title || r.tag, s: r.repo + ' · ' + rel(r.updated) };
      }),
      contrib: c ? {
        login: p, total: c.total,
        streak: streaks(c.days).current, longest: streaks(c.days).longest,
        days: c.days.slice(-182).map(function (d) { return [d.date, d.count, d.level]; })
      } : null
    };
    window.Tracker.widgetSync(JSON.stringify(payload));
  } catch (e) { }
}

window.__widgetRefresh = function () {
  if (syncing) return;
  syncAll(false, true);
};

function feedList(items, limit) {
  var list = items.slice(0, limit || 30);
  if (!list.length) return '<div class="card"><div class="empty">No updates yet — tap refresh.</div></div>';
  return '<div class="card list">' + list.map(feedRow).join('') + '</div>';
}

/* ---------------- in-app widgets ---------------- */
function widgetHead(title, sub, icon, key) {
  return '<div class="wghead">' +
    '<div class="wgicon">' + icon + '</div>' +
    '<div class="lmain"><div class="wgtitle">' + esc(title) + '</div>' +
    '<div class="wgsub">' + esc(sub) + '</div></div>' +
    '<button class="wgbtn" data-widgetrefresh="' + esc(key) + '" aria-label="Refresh">' + I.refresh + '</button>' +
  '</div>';
}

function wgRow(it) {
  var isRel = it.type === 'release';
  return '<div class="wgrow" data-feed="' + esc(it.url || '') + '">' +
    '<div class="eicon ' + (isRel ? 'tag' : 'push') + '">' + (isRel ? I.release : I.commit) + '</div>' +
    '<div class="lmain"><div class="ltitle">' + esc(it.title || (isRel ? 'Release' : 'Commit')) + '</div>' +
    '<div class="lsub">' + esc(it.repo) + ' · ' + esc(rel(it.updated)) + '</div></div></div>';
}

function updatesWidget() {
  var items = state.feed.slice(0, 6);
  var rows = items.length ? items.map(wgRow).join('')
    : '<div class="wgempty">Nothing yet — the widget fills in as soon as a sync lands.</div>';
  return '<div class="card widgetcard">' +
    widgetHead('Updates', state.feed.length + ' changes tracked · live', I.clock, 'updates') +
    '<div class="wglist">' + rows + '</div>' +
    (state.feed.length > 6 ? '<button class="morebtn" data-go="#/activity" style="margin:10px 0 0">See all activity</button>' : '') +
  '</div>';
}

function releasesWidget() {
  var rels = (state.releases || []).slice(0, 3);
  var rows = rels.length ? rels.map(function (r) {
    var a = assetsCache[assetKey(r)];
    var apk = (a && a !== 'loading') ? a.filter(function (x) {
      return x.kind === 'apk' || x.kind === 'bundle';
    })[0] : null;
    return '<div class="wgrow" data-open="' + esc(r.url) + '">' +
      '<div class="eicon tag">' + I.release + '</div>' +
      '<div class="lmain"><div class="ltitle">' + esc(r.title || r.tag) + '</div>' +
      '<div class="lsub">' + esc(r.repo) + ' · ' + esc(rel(r.updated)) + '</div></div>' +
      (apk ? '<span class="achip apk">APK</span>' : '') + '</div>';
  }).join('') : '<div class="wgempty">No releases published yet.</div>';
  return '<div class="card widgetcard">' +
    widgetHead('Releases', rels.length ? 'Latest ' + rels.length + ' with files' : 'Nothing published yet', I.package, 'releases') +
    '<div class="wglist">' + rows + '</div>' +
    (state.releases.length ? '<button class="morebtn" data-go="#/releases" style="margin:10px 0 0">Open releases</button>' : '') +
  '</div>';
}

function contribWidget() {
  var login = state.personal;
  if (!login) {
    return '<div class="card widgetcard">' +
      widgetHead('Contributions', 'No account selected', I.grid, 'contrib') +
      '<div class="wgempty">Set your personal account in Settings to see your contribution graph here.</div></div>';
  }
  var c = state.contrib[login];
  if (!c) {
    ensureContrib(login);
    return '<div class="card widgetcard">' + widgetHead('Contributions', '@' + login, I.grid, 'contrib') +
      '<div class="spinwrap sm"><div class="spinner"></div></div></div>';
  }
  var st = streaks(c.days);
  return '<div class="card widgetcard">' +
    widgetHead('Contributions', '@' + login + ' · ' + compact(c.total) + ' this year', I.grid, 'contrib') +
    '<div class="heatwrap heatmini">' + heatmapCols(c.days.slice(-140)) + '</div>' +
    '<div class="streakrow" style="margin-top:12px">' +
      '<div class="streak"><b>' + st.current + '</b><span>day streak</span></div>' +
      '<div class="streak"><b>' + st.longest + '</b><span>longest</span></div>' +
    '</div>' +
    '<button class="morebtn" data-go="#/me" style="margin:10px 0 0">Open personal dashboard</button>' +
  '</div>';
}

/* ---------------- home ---------------- */
function viewHome() {
  var n = state.accounts.length;
  if (!n) {
    return emptyState('No accounts yet',
      'Add a public GitHub username and this app tracks their repos, commits, releases and updates. No GitHub login, no API keys.',
      '<button class="btn primary" data-add="1">Add an account</button>');
  }
  var repos = 0, releases = 0, commits = 0;
  state.accounts.forEach(function (a) { repos += (a.repoList || []).length; });
  state.feed.forEach(function (it) { if (it.type === 'release') releases++; else commits++; });
  var today = state.feed.filter(function (it) {
    var t = new Date(it.updated || 0).getTime();
    return Date.now() - t < 86400000;
  }).length;

  var h = '';
  h += '<div class="sumcard tap" data-go="#/accounts">' +
        '<div class="sumlabel"><span>Tracking</span>' +
        '<span class="sumdelta">' + (today ? today + ' today' : 'up to date') + '</span></div>' +
        '<div class="amt-hero" style="margin-top:8px">' + n + ' account' + (n === 1 ? '' : 's') + '</div>' +
        '<div class="sumsub">' + repos + ' public repos · ' + state.feed.length + ' recent updates</div>' +
        '<div class="sumsub" style="margin-top:8px;color:var(--accent);font-weight:600">Open accounts ›</div>' +
       '</div>';
  h += statPills([
    ['Commits', compact(commits), 'data-go="#/activity" data-setfilter="commit"'],
    ['Releases', compact(releases), 'data-go="#/releases"'],
    ['Repos', compact(repos), 'data-go="#/repos"']
  ]);

  h += '<div class="peoplebar" style="padding-left:6px;padding-right:6px">' +
       state.accounts.map(function (a) {
         return '<button class="person" data-account="' + esc(a.login) + '">' +
           '<img src="' + esc(avatarUrl(a.login, 120)) + '" alt="">' +
           '<span>@' + esc(a.login) + '</span></button>';
       }).join('') + '</div>';

  h += '<div class="sect">Activity</div>';
  h += feedList(state.feed, 25);
  h += '<button class="morebtn" data-refresh="1">Refresh everything</button>';
  return h;
}

/* ---------------- accounts ---------------- */
function viewAccounts() {
  if (!state.accounts.length) {
    return emptyState('No accounts yet',
      'Add any public GitHub username — you do not need their password or any token.',
      '<button class="btn primary" data-add="1">Add an account</button>');
  }
  var h = '<div class="card list">' + state.accounts.map(function (a) {
    var rc = (a.repoList || []).length;
    var sub = rc + ' repo' + (rc === 1 ? '' : 's') +
      (a.syncedAt ? ' · synced ' + rel(new Date(a.syncedAt).toISOString()) : '') +
      (a.error ? ' · ' + a.error : '');
    return '<div class="lrow" data-account="' + esc(a.login) + '">' +
      '<img class="cav" style="width:40px;height:40px" src="' + esc(avatarUrl(a.login, 80)) + '" alt="">' +
      '<div class="lmain"><div class="ltitle">' + esc(a.name || a.login) + '</div>' +
      '<div class="lsub">@' + esc(a.login) + ' · ' + esc(sub) + '</div></div>' +
      '<span class="lsub" style="flex-shrink:0">' + I.chev + '</span></div>';
  }).join('') + '</div>';
  h += '<button class="morebtn" data-add="1">+ Add another account</button>';
  return h;
}

/* ---------------- activity ---------------- */
var actFilter = 'all';
function viewActivity() {
  if (!state.accounts.length) {
    return emptyState('Nothing to track yet', 'Add an account to build your activity feed.',
      '<button class="btn primary" data-add="1">Add an account</button>');
  }
  var items = state.feed.filter(function (it) {
    if (actFilter === 'commit') return it.type === 'commit';
    if (actFilter === 'release') return it.type === 'release';
    return true;
  });
  var h = '<div class="seg">' +
    ['all', 'commit', 'release'].map(function (k) {
      var lbl = k === 'all' ? 'All' : (k === 'commit' ? 'Commits' : 'Releases');
      return '<button class="segb' + (actFilter === k ? ' on' : '') + '" data-filter="' + k + '">' + lbl + '</button>';
    }).join('') + '</div>';
  h += '<div class="dim" style="margin:0 6px 10px;font-size:12.5px">' +
       (state.feedAt ? 'Last synced ' + rel(new Date(state.feedAt).toISOString()) : 'Not synced yet') +
       (syncing ? ' · syncing…' : '') + '</div>';
  h += feedList(items, 60);
  h += '<button class="morebtn" data-refresh="1">' + (syncing ? 'Syncing…' : 'Refresh now') + '</button>';
  return h;
}

/* ---------------- releases ---------------- */
/* every repository across every tracked account */
function viewRepos() {
  var all = [];
  state.accounts.forEach(function (a) {
    visibleRepos(a).forEach(function (r) { all.push({ owner: a.login, r: r }); });
  });
  if (!all.length) {
    return emptyState('No repositories yet',
      'Add an account and every public repository it owns shows up here.',
      '<button class="btn primary" data-add="1">Add an account</button>');
  }
  all.sort(function (x, y) {
    return String(y.r.updated || '').localeCompare(String(x.r.updated || ''));
  });
  var h = '<div class="sect">' + all.length + ' repositor' + (all.length === 1 ? 'y' : 'ies') +
          ' · ' + state.accounts.length + ' account' + (state.accounts.length === 1 ? '' : 's') + '</div>';
  h += '<div class="card list">' + all.map(function (x) {
    var r = x.r;
    return '<div class="lrow" data-repo="' + esc(x.owner + '/' + r.name) + '">' +
      '<div class="eicon repo">' + I.repo + '</div>' +
      '<div class="lmain"><div class="ltitle">' + esc(r.name) + '</div>' +
      '<div class="lsub">' + esc(x.owner) + (r.lang ? ' · ' + esc(r.lang) : '') +
        (r.stars ? ' · ★ ' + compact(r.stars) : '') +
        (r.updated ? ' · ' + esc(rel(r.updated)) : '') + '</div></div>' +
      '<span class="lsub">' + I.chev + '</span></div>';
  }).join('') + '</div>';
  return h;
}

function viewReleases() {
  if (!state.accounts.length) {
    return emptyState('Nothing to watch yet',
      'Add a public GitHub username — every release they publish lands here with its APK and source files.',
      '<button class="btn primary" data-add="1">Add an account</button>', I.package);
  }
  var rels = state.releases || [];
  if (!rels.length) {
    return emptyState('No releases yet',
      'None of the tracked repositories have published a release. When they do, the APK and source files show up here.',
      '<button class="btn primary" data-refresh="1">Refresh now</button>', I.package);
  }
  var n = rels.length;
  var h = '<div class="dim" style="margin:0 6px 12px;font-size:12.5px">' +
    n + ' release' + (n === 1 ? '' : 's') + ' · ' +
    state.accounts.length + ' account' + (state.accounts.length === 1 ? '' : 's') +
    (syncing ? ' · syncing…' : '') + '</div>';

  h += rels.slice(0, 60).map(function (r) {
    var note = String(r.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return '<div class="card relcard">' +
      '<div class="relhead" data-open="' + esc(r.url) + '">' +
        '<div style="min-width:0">' +
          '<div class="rtag">' + esc(r.title || r.tag) + '</div>' +
          '<div class="rrepo">' + esc(r.repo) + ' · ' + esc(rel(r.updated)) + '</div>' +
        '</div>' +
        (hasApk(r) ? '<span class="achip apk">APK</span>' : '') +
      '</div>' +
      (note ? '<div class="relnote">' + esc(note) + '</div>' : '') +
      '<div class="assetlist">' + assetRows(r) + '</div>' +
    '</div>';
  }).join('');

  if (rels.length > assetsLimit) {
    h += '<button class="morebtn" data-moreassets="1">Load files for more releases</button>';
  }
  return h;
}

/* ---------------- commit + release detail (all in-app) ---------------- */
var commitCache = {};
var commitLoading = {};
var openFiles = {};

/* github.com/<o>/<r>/commit/<sha>.diff is plain text and public — no API */
function parseDiff(text) {
  var files = [], cur = null;
  var lines = String(text || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    if (L.indexOf('diff --git ') === 0) {
      var m = L.match(/^diff --git a\/(.*) b\/(.*)$/);
      cur = { path: m ? m[2] : L.replace('diff --git ', ''), add: 0, del: 0, hunks: [], binary: false };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (L.indexOf('Binary files') === 0 || L.indexOf('GIT binary patch') === 0) { cur.binary = true; continue; }
    if (L.indexOf('@@') === 0) { cur.hunks.push({ header: L, lines: [] }); continue; }
    if (L.indexOf('---') === 0 || L.indexOf('+++') === 0 || L.indexOf('index ') === 0 ||
        L.indexOf('new file') === 0 || L.indexOf('deleted file') === 0 ||
        L.indexOf('similarity index') === 0 || L.indexOf('rename ') === 0 ||
        L.indexOf('old mode') === 0 || L.indexOf('new mode') === 0) continue;
    if (cur.hunks.length) {
      var h = cur.hunks[cur.hunks.length - 1];
      var c = L.charAt(0);
      if (c === '+') cur.add++;
      else if (c === '-') cur.del++;
      h.lines.push(L);
    }
  }
  return files;
}

function loadCommitDiff(owner, repo, sha) {
  var key = owner + '/' + repo + '/' + sha;
  if (commitLoading[key] || commitCache[key]) return;
  commitLoading[key] = true;
  fetchText('https://github.com/' + owner + '/' + repo + '/commit/' + sha + '.diff', false)
    .then(function (txt) { commitCache[key] = { files: parseDiff(txt) }; })
    .catch(function (e) { commitCache[key] = { error: friendlyError(e) }; })
    .then(function () {
      commitLoading[key] = false;
      var r = parseHash();
      if (r.name === 'commit' && r.sha === sha) render();
    });
}

function diffBlock(f) {
  if (f.binary) return '<div class="dhunk">binary file — no preview</div>';
  return f.hunks.map(function (h) {
    var shown = h.lines.slice(0, 160);
    return '<div class="dhunk">' + esc(h.header) + '</div>' +
      '<pre class="dpre">' + shown.map(function (L) {
        var c = L.charAt(0);
        var cls = c === '+' ? 'dadd' : (c === '-' ? 'ddel' : 'dctx');
        return '<span class="' + cls + '">' + esc(L) + '</span>';
      }).join('') + '</pre>' +
      (h.lines.length > shown.length ? '<div class="dhunk">… ' + (h.lines.length - shown.length) + ' more lines</div>' : '');
  }).join('');
}

function viewCommit(owner, repo, sha) {
  var key = owner + '/' + repo + '/' + sha;
  var meta = null;
  for (var i = 0; i < state.feed.length; i++) {
    var it = state.feed[i];
    if (it.type === 'commit' && it.url && it.url.indexOf('/commit/' + sha) > 0) { meta = it; break; }
  }
  var h = '<div class="card">' +
    '<div class="cmsg">' + esc(meta ? (meta.title || 'Commit') : 'Commit ' + sha.slice(0, 7)) + '</div>' +
    '<div class="cmeta">' + esc(owner + '/' + repo) + ' · ' + esc(sha.slice(0, 7)) +
      (meta && meta.author ? ' · ' + esc(meta.author) : '') +
      (meta ? ' · ' + esc(rel(meta.updated)) : '') + '</div>' +
  '</div>';

  var c = commitCache[key];
  if (!c) {
    h += '<div class="card"><div class="spinwrap"><div class="spinner"></div></div></div>';
    loadCommitDiff(owner, repo, sha);
  } else if (c.error) {
    h += '<div class="card"><div class="empty">Could not load the diff for this commit.<br><span class="dim">' +
      esc(c.error) + '</span></div></div>';
  } else {
    var adds = 0, dels = 0;
    c.files.forEach(function (f) { adds += f.add; dels += f.del; });
    h += '<div class="statgrid" style="margin-bottom:14px">' +
      statBox('Files', c.files.length) +
      statBox('Added', '+' + adds) +
      statBox('Removed', '−' + dels) +
      statBox('Changes', adds + dels) +
    '</div>';
    h += '<div class="sect">Files changed</div>';
    h += c.files.length ? c.files.map(function (f) {
      var fk = key + '|' + f.path;
      var open = !!openFiles[fk];
      return '<div class="card dfcard" data-difffile="' + esc(fk) + '">' +
        '<div class="dfhead">' +
          '<div class="dpath">' + esc(f.path) + '</div>' +
          '<div class="dfstat">' + (f.binary ? 'binary' : '+' + f.add + ' −' + f.del) + '</div>' +
        '</div>' +
        (open ? '<div class="dwrap">' + diffBlock(f) + '</div>' : '') +
      '</div>';
    }).join('') : '<div class="card"><div class="empty">No file changes.</div></div>';
  }
  return h;
}

function viewReleaseDetail(owner, repo, tag) {
  var relObj = null;
  (state.releases || []).forEach(function (r) {
    if (r.owner === owner && r.name === repo && r.tag === tag) relObj = r;
  });
  var h = '<div class="card">' +
    '<div class="rtag">' + esc(relObj ? (relObj.title || relObj.tag) : tag) + '</div>' +
    '<div class="rrepo">' + esc(owner + '/' + repo) + (relObj ? ' · ' + esc(rel(relObj.updated)) : '') + '</div>' +
  '</div>';
  if (relObj) {
    var note = String(relObj.body || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (note) h += '<div class="sect">Notes</div><div class="card"><div class="relnotes">' + esc(note) + '</div></div>';
  }
  var fake = { owner: owner, name: repo, tag: tag };
  if (!assetsCache[assetKey(fake)]) autoloadAssets([fake]);
  h += '<div class="sect">Files</div><div class="card"><div class="assetlist" style="border:none;margin:0">' +
    assetRows(fake) + '</div></div>';
  return h;
}

/* ---------------- personal tracker ---------------- */
function heatmapCols(days) {
  if (!days || !days.length) return '';
  var cols = [], col = [];
  var first = new Date(days[0].date + 'T00:00:00');
  var pad = isNaN(first.getTime()) ? 0 : first.getDay();
  for (var p = 0; p < pad; p++) col.push(null);
  days.forEach(function (d) {
    col.push(d);
    if (col.length === 7) { cols.push(col); col = []; }
  });
  if (col.length) { while (col.length < 7) col.push(null); cols.push(col); }
  return cols.map(function (c) {
    return '<div class="heatcol">' + c.map(function (d) {
      if (!d) return '<div class="heatcell" style="opacity:0"></div>';
      var lvl = Math.min(4, Math.max(0, d.level));
      return '<div class="heatcell' + (lvl ? ' l' + lvl : '') + '" data-heat="' + esc(d.date + '|' + d.count) + '" title="' +
        esc(d.date) + ': ' + d.count + '"></div>';
    }).join('') + '</div>';
  }).join('');
}

function heatmap(days) {
  var inner = heatmapCols(days);
  return inner ? '<div class="heatwrap">' + inner + '</div>' : '';
}

function heatLegend() {
  return '<div class="heatlegend"><span>Less</span>' +
    '<i class="heatcell"></i><i class="heatcell l1"></i><i class="heatcell l2"></i>' +
    '<i class="heatcell l3"></i><i class="heatcell l4"></i><span>More</span></div>';
}

function dayBars(days) {
  var max = 1;
  days.forEach(function (d) { if (d.count > max) max = d.count; });
  var today = new Date().toISOString().slice(0, 10);
  var lbl = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return '<div class="daybars">' + days.map(function (d) {
    var h = Math.max(6, Math.round((d.count / max) * 84));
    var dow = new Date(d.date + 'T00:00:00').getDay();
    return '<div class="daybar' + (d.date === today ? ' cur' : '') + '">' +
      '<span style="height:' + h + 'px"></span><i>' + lbl[dow] + '</i></div>';
  }).join('') + '</div>';
}

function statBox(label, value, attrs) {
  return '<button class="statbox" ' + (attrs || '') + '><b>' + esc(value) + '</b><span>' + esc(label) + '</span></button>';
}

/* ---------- every stat on the profile cards is a door ---------- */
function pstatsRow(a, repos) {
  return '<div class="pstats">' +
    '<button class="pstat" data-pstat="repos" data-pstatlogin="' + esc(a.login) + '"><b>' + repos.length + '</b><span>repos</span></button>' +
    '<button class="pstat" data-pstat="followers" data-pstatlogin="' + esc(a.login) + '"><b>' + compact(a.followers || 0) + '</b><span>followers</span></button>' +
    '<button class="pstat" data-pstat="following" data-pstatlogin="' + esc(a.login) + '"><b>' + compact(a.following || 0) + '</b><span>following</span></button>' +
  '</div>';
}

var peopleCache = {};
var peopleLoading = {};

/* github.com/<login>?tab=followers|following is public HTML */
function parsePeople(html) {
  var doc = parseHtml(html);
  var out = [], seen = {};
  var links = doc.querySelectorAll('a[data-hovercard-type="user"]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || '';
    var login = href.replace(/^\//, '').split(/[\/?#]/)[0];
    if (!login || seen[login]) continue;
    seen[login] = 1;
    out.push({ login: login });
  }
  return out;
}

function loadPeople(login, kind, cb) {
  var key = login + ':' + kind;
  if (peopleLoading[key] || peopleCache[key]) return;
  peopleLoading[key] = true;
  fetchText('https://github.com/' + encodeURIComponent(login) + '?tab=' + kind, false)
    .then(function (html) { peopleCache[key] = { list: parsePeople(html) }; })
    .catch(function (e) { peopleCache[key] = { error: friendlyError(e) }; })
    .then(function () {
      peopleLoading[key] = false;
      if (cb) cb();
    });
}

function peopleSheet(login, kind) {
  var key = login + ':' + kind;
  var cached = peopleCache[key];
  var body;
  if (!cached) {
    body = '<div class="spinwrap sm"><div class="spinner"></div></div>';
    loadPeople(login, kind, function () { peopleSheet(login, kind); });
  } else if (cached.error) {
    body = '<div class="wgempty">' + esc(cached.error) + '</div>';
  } else if (!cached.list.length) {
    body = '<div class="wgempty">No ' + esc(kind) + ' to show.</div>';
  } else {
    body = '<div class="card list" style="margin:0;background:var(--chip)">' + cached.list.map(function (p) {
      var tracked = !!findAccount(p.login);
      return '<div class="lrow" ' + (tracked
          ? 'data-account="' + esc(p.login) + '"'
          : 'data-trackuser="' + esc(p.login) + '"') + '>' +
        '<img class="cav" style="width:36px;height:36px" src="' + esc(avatarUrl(p.login, 72)) + '" alt="">' +
        '<div class="lmain"><div class="ltitle">@' + esc(p.login) + '</div>' +
        '<div class="lsub">' + (tracked ? 'tracking' : 'tap to track') + '</div></div>' +
        '<span class="lsub">' + I.chev + '</span></div>';
    }).join('') + '</div>';
  }
  openSheet((kind === 'followers' ? 'Followers' : 'Following') + ' · @' + login, body);
}

function pstatSheet(login, kind) {
  var a = findAccount(login);
  if (!a) return;
  if (kind === 'repos') {
    var repos = visibleRepos(a).slice().sort(function (x, y) { return (y.stars || 0) - (x.stars || 0); });
    openSheet('Repositories · @' + login,
      repos.length ? '<div class="card list" style="margin:0;background:var(--chip)">' + repos.map(function (r) {
        return '<div class="lrow" data-repo="' + esc(login + '/' + r.name) + '">' +
          '<div class="lmain"><div class="ltitle">' + esc(r.name) + '</div>' +
          '<div class="lsub">' + (r.lang ? esc(r.lang) + ' · ' : '') + compact(r.stars || 0) + ' stars · updated ' + esc(rel(r.updated)) + '</div></div>' +
          '<span class="lsub">' + I.chev + '</span></div>';
      }).join('') + '</div>' : '<div class="wgempty">No repositories.</div>');
    return;
  }
  peopleSheet(login, kind);
}

function trackUser(login) {
  closeSheet();
  addAccount(login).then(function (acc) {
    go('#/u/' + encodeURIComponent(acc.login));
    askNotify(acc);
  }).catch(function (e) { toast(friendlyError(e)); });
}

function streakSheet(kind) {
  var login = state.personal;
  var c = login && state.contrib[login];
  if (!c) { toast('No contribution data yet'); return; }
  var st = streaks(c.days), bd = bestDay(c.days);
  var title = kind === 'current' ? 'Current streak' : (kind === 'longest' ? 'Longest streak' : 'Best day');
  var big = kind === 'current' ? st.current : (kind === 'longest' ? st.longest : bd.count);
  var sub = kind === 'best'
    ? (bd.date ? bd.date + ' · ' + bd.count + ' contributions' : 'No activity yet')
    : (big ? big + ' consecutive active days' : 'No active streak right now');
  var active = c.days.filter(function (d) { return d.count > 0; }).slice(-12).reverse();
  openSheet(title,
    '<div class="amt-hero" style="margin:2px 4px 4px">' + big + '</div>' +
    '<div class="dim" style="margin:0 4px 16px;line-height:1.5">' + esc(sub) + '</div>' +
    '<div class="fldlabel">Recent active days</div>' +
    '<div class="card list" style="margin:8px 0 0;background:var(--chip)">' +
      (active.length ? active.map(function (d) {
        return '<div class="lrow"><div class="lmain"><div class="ltitle">' + esc(d.date) + '</div>' +
          '<div class="lsub">' + d.count + ' contribution' + (d.count === 1 ? '' : 's') + '</div></div></div>';
      }).join('') : '<div class="wgempty">Nothing yet.</div>') +
    '</div>');
}

function langSheet(login, lang) {
  var a = findAccount(login);
  if (!a) return;
  var repos = visibleRepos(a).filter(function (r) { return r.lang === lang; })
    .sort(function (x, y) { return (y.stars || 0) - (x.stars || 0); });
  openSheet(lang + ' · ' + repos.length + ' repositor' + (repos.length === 1 ? 'y' : 'ies'),
    repos.length ? '<div class="card list" style="margin:0;background:var(--chip)">' + repos.map(function (r) {
      return '<div class="lrow" data-repo="' + esc(login + '/' + r.name) + '">' +
        '<div class="lmain"><div class="ltitle">' + esc(r.name) + '</div>' +
        '<div class="lsub">' + compact(r.stars || 0) + ' stars · updated ' + esc(rel(r.updated)) + '</div></div>' +
        '<span class="lsub">' + I.chev + '</span></div>';
    }).join('') + '</div>' : '<div class="wgempty">No repositories in this language.</div>');
}

/* tapping a stat box opens the data behind it */
function statSheet(kind) {
  var login = state.personal;
  var a = login && findAccount(login);
  if (!a) return;
  if (kind === 'followers') {
    openSheet('Followers',
      '<p class="dim" style="margin:0 4px 16px;line-height:1.55">@' + esc(login) + ' has ' +
      compact(a.followers || 0) + ' followers and follows ' + compact(a.following || 0) + ' accounts.</p>' +
      '<button class="btn primary btnblock" data-go="#/u/' + esc(login) + '">Open profile</button>');
    return;
  }
  var repos = visibleRepos(a).slice();
  var by = kind === 'forks' ? 'forks' : (kind === 'repos' ? 'updated' : 'stars');
  var title = kind === 'forks' ? 'Most forked' : (kind === 'repos' ? 'Recently updated' : 'Most starred');
  repos.sort(function (x, y) {
    if (by === 'updated') return String(y.updated || '').localeCompare(String(x.updated || ''));
    return (y[by] || 0) - (x[by] || 0);
  });
  openSheet(title,
    repos.length ? '<div class="card list" style="margin:0;background:var(--chip)">' + repos.slice(0, 12).map(function (r) {
      return '<div class="lrow" data-repo="' + esc(login + '/' + r.name) + '">' +
        '<div class="lmain"><div class="ltitle">' + esc(r.name) + '</div>' +
        '<div class="lsub">' + compact(r.stars || 0) + ' stars · ' + compact(r.forks || 0) + ' forks</div></div></div>';
    }).join('') + '</div>' : '<div class="wgempty">No repositories loaded.</div>');
}

/* ---- repository tracking: every repo on by default, any can be switched off ---- */
function manageRepos(login) {
  var a = findAccount(login);
  if (!a) return;
  var hid = a.hidden || [];
  var list = a.repoList || [];
  openSheet('Repositories · @' + login,
    '<p class="dim" style="margin:0 4px 12px;line-height:1.5">Uncheck a repository to stop tracking it — its commits and releases stop appearing in your feeds. Everything is on by default.</p>' +
    '<div class="btnrow" style="margin:0 0 12px">' +
      '<button class="btn ghost" id="repoAll">Select all</button>' +
      '<button class="btn ghost" id="repoNone">Select none</button>' +
    '</div>' +
    (list.length ? '<div class="card list" style="margin:0;background:var(--chip)">' + list.map(function (r) {
      var on = hid.indexOf(r.name) < 0;
      return '<div class="lrow" data-togglerepo="' + esc(login + '/' + r.name) + '">' +
        '<div class="lmain"><div class="ltitle">' + esc(r.name) + '</div>' +
        '<div class="lsub">' + (r.lang ? esc(r.lang) + ' · ' : '') + (on ? 'tracking' : 'hidden') + '</div></div>' +
        '<div class="switch' + (on ? ' on' : '') + '"></div></div>';
    }).join('') + '</div>' : '<div class="wgempty">No repositories loaded yet.</div>'),
    function () {
      var all = $('#repoAll'), none = $('#repoNone');
      if (all) all.onclick = function () { a.hidden = []; saveAccounts(); manageRepos(login); render(); };
      if (none) none.onclick = function () {
        a.hidden = list.map(function (r) { return r.name; });
        saveAccounts(); manageRepos(login); render();
      };
    });
}

function langStats(repos) {
  var map = {}, total = 0;
  (repos || []).forEach(function (r) {
    if (!r.lang) return;
    if (!map[r.lang]) map[r.lang] = { n: 0, color: r.color || '' };
    map[r.lang].n++; total++;
  });
  var list = Object.keys(map).map(function (k) {
    return { name: k, n: map[k].n, color: map[k].color };
  }).sort(function (x, y) { return y.n - x.n; });
  return { list: list, total: total };
}

function viewMe() {
  var login = state.personal;
  if (!login) {
    return emptyState('Personal tracker',
      'Pick which of your accounts is you. This screen then shows your contribution graph, daily activity, streaks and statistics.',
      '<button class="btn primary" data-pickpersonal="1">Choose your account</button>', I.user);
  }
  var a = findAccount(login);
  if (!a) { state.personal = null; store.del('gh:personal'); return viewMe(); }

  var repos = visibleRepos(a);
  var h = '';

  h += '<div class="card profile">' +
    '<img class="pav" src="' + esc(avatarUrl(login, 240)) + '" alt="">' +
    '<div class="pname">' + esc(a.name || login) + '</div>' +
    '<div class="plogin">@' + esc(login) + '</div>' +
    (a.bio ? '<p class="pbio">' + esc(a.bio) + '</p>' : '') +
    pstatsRow(a, repos) +
    '<div class="btnrow">' +
      '<button class="btn ghost" data-pickpersonal="1">Switch account</button>' +
    '</div>' +
  '</div>';

  var c = state.contrib[login];
  if (!c) {
    h += '<div class="card"><div class="spinwrap"><div class="spinner"></div></div></div>';
    ensureContrib(login);
  } else {
    var st = streaks(c.days);
    var bd = bestDay(c.days);
    h += '<div class="card">' +
      '<div class="sumlabel"><span>Contributions</span><span class="sumdelta">last 12 months</span></div>' +
      '<div class="amt-hero" style="margin-top:8px">' + compact(c.total) + '</div>' +
      '<div class="sumsub">' + (c.days.length
        ? esc(c.days[0].date) + ' → ' + esc(c.days[c.days.length - 1].date) : '') + '</div>' +
      heatmap(c.days) +
      heatLegend() +
      '<div class="streakrow">' +
        '<button class="streak" data-streak="current"><b>' + st.current + '</b><span>day streak</span></button>' +
        '<button class="streak" data-streak="longest"><b>' + st.longest + '</b><span>longest</span></button>' +
        '<button class="streak" data-streak="best"><b>' + bd.count + '</b><span>best day</span></button>' +
      '</div>' +
    '</div>';

    var last14 = c.days.slice(-14);
    if (last14.length) {
      h += '<div class="sect">Daily activity</div><div class="card">' + dayBars(last14) +
        '<div class="sumsub" style="text-align:center;margin-top:10px">last ' + last14.length + ' days</div>' +
      '</div>';
    }
  }

  var stars = 0, forks = 0;
  repos.forEach(function (r) { stars += r.stars || 0; forks += r.forks || 0; });
  var ls = langStats(repos);

  h += '<div class="sect">Statistics</div><div class="statgrid">' +
    statBox('Public repos', repos.length, 'data-stat="repos"') +
    statBox('Total stars', compact(stars), 'data-stat="stars"') +
    statBox('Total forks', compact(forks), 'data-stat="forks"') +
    statBox('Followers', compact(a.followers || 0), 'data-stat="followers"') +
  '</div>';

  if (ls.list.length) {
    h += '<div class="card">' +
      '<div class="fldlabel" style="margin-bottom:10px">Languages</div>' +
      '<div class="langbar">' + ls.list.slice(0, 6).map(function (x) {
        return '<span style="width:' + ((x.n / ls.total) * 100).toFixed(1) + '%;background:' +
          (x.color || 'var(--accent)') + '"></span>';
      }).join('') + '</div>' +
      '<div class="lgdrow">' + ls.list.slice(0, 6).map(function (x) {
        return '<button class="lgd" data-lang="' + esc(x.name) + '" data-langlogin="' + esc(login) + '">' +
          '<i class="dot" style="background:' + (x.color || 'var(--accent)') + '"></i>' +
          esc(x.name) + ' · ' + Math.round((x.n / ls.total) * 100) + '%</button>';
      }).join('') + '</div>' +
    '</div>';
  }

  var top = repos.slice().sort(function (x, y) { return (y.stars || 0) - (x.stars || 0); }).slice(0, 5);
  if (top.length) {
    h += '<div class="sect">Top repositories</div><div class="card list">' + top.map(function (r) {
      return '<div class="lrow" data-repo="' + esc(login + '/' + r.name) + '">' +
        '<div class="eicon push">' + I.repo + '</div>' +
        '<div class="lmain"><div class="ltitle">' + esc(r.name) + '</div>' +
        '<div class="lsub">' + (r.lang ? esc(r.lang) + ' · ' : '') + compact(r.stars || 0) + ' stars</div></div>' +
        '<span class="lsub">' + I.chev + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---- deep analysis over the commit feed + contribution graph ---- */
  var mine = state.feed.filter(function (it) { return it.account === login; });
  var byHour = [], byDow = [], byRepo = {}, relByRepo = {};
  for (var hh = 0; hh < 24; hh++) byHour.push(0);
  for (var dd = 0; dd < 7; dd++) byDow.push(0);
  mine.forEach(function (it) {
    if (it.type !== 'commit') return;
    var d = new Date(it.updated || 0);
    if (isNaN(d.getTime())) return;
    byHour[d.getHours()]++;
    byDow[d.getDay()]++;
    byRepo[it.repo] = (byRepo[it.repo] || 0) + 1;
  });
  (state.releases || []).forEach(function (r) {
    if (r.account !== login) return;
    relByRepo[r.repo] = (relByRepo[r.repo] || 0) + 1;
  });
  var peakHour = 0, peakVal = -1;
  byHour.forEach(function (v, i) { if (v > peakVal) { peakVal = v; peakHour = i; } });
  var peakDow = 0, peakDowVal = -1;
  byDow.forEach(function (v, i) { if (v > peakDowVal) { peakDowVal = v; peakDow = i; } });
  var maxHour = Math.max.apply(null, byHour.concat([1]));
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var topCommitRepo = Object.keys(byRepo).sort(function (x, y) { return byRepo[y] - byRepo[x]; })[0];
  var topRelRepo = Object.keys(relByRepo).sort(function (x, y) { return relByRepo[y] - relByRepo[x]; })[0];
  var topStar = repos.slice().sort(function (x, y) { return (y.stars || 0) - (x.stars || 0); })[0];
  var meta = (state.meta || {})[login] || {};
  var activeDays = 0, daySum = 0;
  if (c) c.days.forEach(function (d) { if (d.count > 0) { activeDays++; daySum += d.count; } });
  var avgDay = (c && c.days.length) ? (daySum / c.days.length).toFixed(1) : '—';

  h += '<div class="sect">Productivity</div><div class="card">' +
    '<div class="statgrid">' +
      statBox('Peak hour', peakVal > 0 ? pad2(peakHour) + ':00' : '—') +
      statBox('Peak day', peakDowVal > 0 ? DOW[peakDow] : '—') +
      statBox('Commits / day', avgDay) +
      statBox('Active days', activeDays || '—') +
    '</div>' +
    '<div class="fldlabel" style="margin:16px 0 8px">Commits by hour of day</div>' +
    hourBars(byHour, maxHour) +
  '</div>';

  h += '<div class="sect">Highlights</div><div class="card list">' +
    hlRow(I.commit, 'Most committed repo', topCommitRepo ? topCommitRepo + ' · ' + byRepo[topCommitRepo] + ' commits' : 'No commits yet') +
    hlRow(I.release, 'Most released repo', topRelRepo ? topRelRepo + ' · ' + relByRepo[topRelRepo] + ' releases' : 'No releases yet') +
    hlRow(I.star, 'Most starred repo', topStar ? topStar.name + ' · ' + compact(topStar.stars || 0) + ' stars' : '—') +
    hlRow(I.grid, 'Issues opened', (meta.issues != null && meta.issues >= 0) ? compact(meta.issues) : '—') +
    hlRow(I.fork, 'Pull requests opened', (meta.prs != null && meta.prs >= 0) ? compact(meta.prs) : '—') +
  '</div>';

  var recent = state.feed.filter(function (it) { return it.account === login; }).slice(0, 8);
  if (recent.length) {
    h += '<div class="sect">Recent activity</div>' + feedList(recent, 8);
  }
  return h;
}

function pickPersonal() {
  if (!state.accounts.length) { addAccountSheet(); return; }
  openSheet('Which account is you?',
    '<p class="dim" style="margin:0 4px 14px;line-height:1.55">Your personal dashboard shows the contribution graph, daily activity, streaks and statistics for this account.</p>' +
    '<div class="card list" style="margin:0;background:var(--chip)">' +
      state.accounts.map(function (a) {
        return '<div class="lrow" data-setpersonal="' + esc(a.login) + '">' +
          '<img class="cav" style="width:36px;height:36px" src="' + esc(avatarUrl(a.login, 72)) + '" alt="">' +
          '<div class="lmain"><div class="ltitle">' + esc(a.name || a.login) + '</div>' +
          '<div class="lsub">@' + esc(a.login) + '</div></div>' +
          (state.personal === a.login ? '<span class="achip apk">YOU</span>' : '') +
        '</div>';
      }).join('') +
    '</div>');
}

/* ---------------- notifications ---------------- */
function pushNotify(a, fresh) {
  if (!(window.Tracker && window.Tracker.notify)) return;
  var shown = Math.min(fresh.length, 3);
  for (var i = 0; i < shown; i++) {
    var it = fresh[i];
    var title, body;
    if (it.type === 'release') {
      title = '@' + a.login + ' released ' + (it.title || it.tag || '');
      body = it.repo;
    } else {
      title = '@' + a.login + ' · ' + (it.repo || '');
      body = it.title || 'New commit';
    }
    try { window.Tracker.notify(title, body, it.url || ''); } catch (e) { }
  }
  if (fresh.length > shown) {
    try { window.Tracker.notify('@' + a.login, '+' + (fresh.length - shown) + ' more updates', ''); } catch (e) { }
  }
}

function askNotify(acc) {
  openSheet('Notifications for @' + acc.login + '?',
    '<p class="dim" style="margin:0 4px 16px;line-height:1.55">Get a notification when this account pushes commits, publishes a release or posts other public activity. You can switch this off any time from the account screen.</p>' +
    '<div class="btncol">' +
      '<button class="btn primary btnblock" id="notifYes">Notify me</button>' +
      '<button class="btn ghost btnblock" id="notifNo">Not now</button>' +
    '</div>',
    function () {
      $('#notifNo').onclick = function () {
        acc.notify = false;
        saveAccounts();
        closeSheet();
      };
      $('#notifYes').onclick = function () {
        acc.notify = true;
        acc.seenAt = Date.now();
        saveAccounts();
        closeSheet();
        if (window.Tracker && window.Tracker.askNotifications) {
          try { window.Tracker.askNotifications(); } catch (e) { }
        }
        toast('Notifications on for @' + acc.login);
      };
    });
}

window.__notifPerm = function (ok) {
  if (!ok) toast('Notification permission is off — turn it on in Android settings');
};

/* ---------------- settings ---------------- */
var setTab = 'general';

function appVer() {
  try { return (window.Tracker && window.Tracker.appVersion()) || ''; } catch (e) { return ''; }
}

function settingsTabs() {
  return '<div class="seg" style="margin-bottom:16px">' +
    '<button class="segb' + (setTab === 'general' ? ' on' : '') + '" data-settab="general">Settings</button>' +
    '<button class="segb' + (setTab === 'credits' ? ' on' : '') + '" data-settab="credits">Credits</button>' +
  '</div>';
}

/* About + credits, laid out the same way Gitly does it */
function viewCredits() {
  var h = settingsTabs();
  h += '<div class="card" style="text-align:center;padding:28px 20px">' +
    '<div style="font-size:34px;font-weight:800;letter-spacing:-.5px">GitHub Tracker</div>' +
    '<ul class="creditslist">' +
      '<li>Version ' + esc(appVer() || '2.2') + '</li>' +
      '<li>Public data only — no API, no rate limits</li>' +
      '<li>Not affiliated with GitHub</li>' +
    '</ul></div>';

  h += '<div class="sect">Developer</div>' +
    '<div class="card" style="text-align:center">' +
      '<img class="devav" src="https://github.com/BonkerUnkilBonki.png?size=192" alt="BonkerUnkil (Bonki)" ' +
        'onerror="this.style.visibility=\'hidden\'">' +
      '<div class="devrow"><div class="ltitle">Name</div><div class="lsub">BonkerUnkil (Bonki)</div></div>' +
      '<div class="devrow"><div class="ltitle">Age</div><div class="lsub">20</div></div>' +
      '<div class="devrow" style="border-bottom:none"><div class="ltitle">Profession</div>' +
        '<div class="lsub">Coding, problem solving, and more</div></div>' +
    '</div>';

  var tg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>';
  var gh = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>';

  h += '<div class="sect">Connect</div>' +
    '<div class="card">' +
      '<button class="btn ghost btnblock connectbtn" data-copy="BonkerUnkilBonki">' + tg +
        '<span>Telegram · @BonkerUnkilBonki</span></button>' +
      '<button class="btn ghost btnblock connectbtn" style="margin-top:8px" data-copy="BonkerUnkilBonki">' + gh +
        '<span>GitHub · @BonkerUnkilBonki</span></button>' +
    '</div>';

  h += '<div class="sect">Languages used</div>' +
    '<div class="card"><div class="chips">' +
      '<span class="chip">HTML</span><span class="chip">CSS</span>' +
      '<span class="chip">JavaScript</span><span class="chip">Java</span>' +
    '</div></div>';
  return h;
}

function viewSettings() {
  if (setTab === 'credits') return viewCredits();
  var s = state.settings;
  var auth = store.get('gh:auth', null);
  var h = settingsTabs();

  h += '<div class="card">' +
    '<div class="sect" style="margin:0 0 12px">Appearance</div>' +
    '<div class="seg">' +
      [['light', 'Light'], ['dark', 'Dark'], ['pitch', 'Pitch black']].map(function (t) {
        return '<button class="segb' + (s.theme === t[0] ? ' on' : '') + '" data-theme="' + t[0] + '">' + t[1] + '</button>';
      }).join('') +
    '</div>' +
    '<div class="fldlabel" style="margin-top:16px">Accent</div>' +
    '<div class="accentrow">' +
      ACCENTS.map(function (a) {
        return '<button class="accentdot' + (s.accent === a ? ' on' : '') + '" data-accent="' + a + '" ' +
          'style="background:' + accentColor(a) + '" aria-label="' + a + '"></button>';
      }).join('') +
    '</div>' +
    '<div class="colorrow">' +
      '<input type="color" id="accentPick" value="' + esc(accentValue(s.accent)) + '" aria-label="Custom accent colour">' +
      '<input class="fld" id="accentHex" value="' + esc(accentValue(s.accent).toUpperCase()) + '" maxlength="7" spellcheck="false" autocapitalize="characters">' +
      '<button class="btn primary" id="accentApply">Apply</button>' +
    '</div>' +
    '<p class="tiny" style="text-align:left;margin:8px 2px 0">Type any hex code, e.g. #FF7A1A</p>' +
    '<div class="lrow" style="padding:16px 0 0;border:none" data-toggle="glow">' +
      '<div class="lmain"><div class="ltitle">Glow</div>' +
      '<div class="lsub">Soft accent glow on buttons and cards</div></div>' +
      '<div class="switch' + (s.glow ? ' on' : '') + '"></div></div>' +
    '<div class="lrow" data-toggle="widgetpitch" style="padding:16px 0 0;border:none">' +
      '<div class="lmain"><div class="ltitle">Pitch black widgets</div>' +
      '<div class="lsub">Home screen widgets use pure black to match an OLED screen</div></div>' +
      '<div class="switch' + (state.settings.widgetPitch ? ' on' : '') + '"></div></div>' +
  '</div>';

  h += '<div class="card">' +
    '<div class="sect" style="margin:0 0 12px">Data</div>' +
    '<div class="lrow" style="padding:2px 0 14px;border:none">' +
      '<div class="lmain"><div class="ltitle">Live sync</div>' +
      '<div class="lsub">Keeps syncing the whole time the app is open — nothing to schedule</div></div>' +
      '<span class="achip apk">LIVE</span></div>' +
    '<div class="btncol">' +
      '<button class="btn primary btnblock" data-refresh="1">' + (syncing ? 'Syncing…' : 'Refresh everything now') + '</button>' +
      '<button class="btn ghost btnblock" data-clear="1">Clear cached pages</button>' +
    '</div>' +
    '<div class="syncstat">' + (state.feedAt ? 'Last synced ' + rel(new Date(state.feedAt).toISOString()) : 'Not synced yet') + '</div>' +
  '</div>';

  h += '<div class="card">' +
    '<div class="sect" style="margin:0 0 12px">Account</div>' +
    '<div class="lrow" style="padding:6px 0;border:none">' +
      '<div class="lmain"><div class="ltitle">' + esc(auth ? auth.u : 'Not signed in') + '</div>' +
      '<div class="lsub">Local account · not linked to GitHub</div></div></div>' +
    '<div class="lrow" data-pickpersonal="1" style="padding:12px 0;border:none">' +
      '<div class="lmain"><div class="ltitle">Personal tracker</div>' +
      '<div class="lsub">' + (state.personal ? '@' + esc(state.personal) : 'Not set — choose your account') + '</div></div>' +
      '<span class="lsub">' + I.chev + '</span></div>' +
    '<div class="btncol">' +
      '<button class="btn ghost btnblock" data-signout="1">Sign out</button>' +
      '<button class="btn danger btnblock" data-wipe="1">Delete account and data</button>' +
    '</div>' +
  '</div>';

  h += '<div class="about">GitHub Tracker<br>Public data only — reads github.com pages and Atom feeds.<br>' +
       'No API keys, no GitHub login, no rate limits.<br><span id="verTxt"></span></div>';
  return h;
}

/* the custom colour row is an input, so it needs real listeners rather than
   the delegated click handler */
function wireSettings() {
  var pick = $('#accentPick'), hex = $('#accentHex'), apply = $('#accentApply');
  if (!pick || !hex || !apply) return;
  pick.addEventListener('input', function () { hex.value = pick.value.toUpperCase(); });
  hex.addEventListener('input', function () {
    var v = hex.value.trim();
    if (isHex(v.charAt(0) === '#' ? v : '#' + v)) pick.value = (v.charAt(0) === '#' ? v : '#' + v);
  });
  apply.onclick = function () {
    var v = (hex.value || '').trim();
    if (v.charAt(0) !== '#') v = '#' + v;
    if (!isHex(v)) { toast('Enter a hex colour like #FF7A1A'); return; }
    state.settings.accent = v.toLowerCase();
    saveSettings();
    applySettings();
    render();
    toast('Accent set to ' + v.toUpperCase());
  };
}

function accentColor(a) {
  return ({ blue: '#1B6EF3', purple: '#8B5CF6', green: '#12B76A', pink: '#EC4899',
            amber: '#F59E0B', teal: '#14B8A6', red: '#EF4444', indigo: '#6366F1' })[a] || '#1B6EF3';
}

/* ---------------- account detail ---------------- */
var accTab = 'repos';
var accFeed = {};   // login -> {commits:[], releases:[]}

function viewAccount(login) {
  var a = findAccount(login);
  if (!a) return emptyState('Account not found', 'It may have been removed.', '');
  var repos = visibleRepos(a);
  var h = '';

  h += '<div class="card profile">' +
    '<img class="pav" src="' + esc(avatarUrl(a.login, 240)) + '" alt="">' +
    '<div class="pname">' + esc(a.name || a.login) + '</div>' +
    '<div class="plogin">@' + esc(a.login) + '</div>' +
    (a.bio ? '<p class="pbio">' + esc(a.bio) + '</p>' : '') +
    pstatsRow(a, repos) +
    '<div class="btnrow">' +

      '<button class="btn danger" data-remove="' + esc(a.login) + '">Remove</button>' +
    '</div>' +
    (a.error ? '<p class="loginErr" style="text-align:center">' + esc(a.error) + '</p>' : '') +
  '</div>';

  h += '<div class="card"><div class="notifyrow" data-notifytoggle="' + esc(a.login) + '">' +
    '<div class="wgicon">' + I.bell + '</div>' +
    '<div class="lmain"><div class="ltitle">Notifications</div>' +
    '<div class="lsub">' + (a.notify ? 'On · live updates for this account' : 'Off · tap to get updates') + '</div></div>' +
    '<div class="switch' + (a.notify ? ' on' : '') + '"></div></div></div>';

  h += '<div class="card"><div class="notifyrow" data-managerepos="' + esc(a.login) + '">' +
    '<div class="wgicon">' + I.repo + '</div>' +
    '<div class="lmain"><div class="ltitle">Repositories</div>' +
    '<div class="lsub">' + visibleRepos(a).length + ' of ' + (a.repoList || []).length +
    ' tracked · tap to choose</div></div>' +
    '<span class="lsub">' + I.chev + '</span></div></div>';

  h += '<div class="seg">' +
    [['repos', 'Repos'], ['commits', 'Commits'], ['releases', 'Releases']].map(function (t) {
      return '<button class="segb' + (accTab === t[0] ? ' on' : '') + '" data-acctab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

  if (accTab === 'repos') {
    if (!repos.length) {
      h += '<div class="card"><div class="empty">' +
        (a.error ? 'Could not read the repository list.' : 'No public repositories.') + '</div></div>';
    } else {
      h += repos.map(function (r) {
        return '<div class="card" data-repo="' + esc(a.login + '/' + r.name) + '">' +
          '<div class="rcrow"><div style="min-width:0">' +
            '<div class="rcname">' + esc(r.name) + '</div>' +
            (r.desc ? '<p class="rcdesc">' + esc(r.desc) + '</p>' : '') +
          '</div>' + (r.fork ? '<span class="chip">fork</span>' : '') + '</div>' +
          '<div class="rcmeta">' +
            (r.lang ? '<span><i class="dot" style="background:' + esc(r.color || 'var(--text2)') + '"></i>' + esc(r.lang) + '</span>' : '') +
            (r.stars ? '<span>' + I.star.replace('<svg', '<svg style="width:14px;height:14px"') + ' ' + compact(r.stars) + '</span>' : '') +
            (r.forks ? '<span>' + I.fork.replace('<svg', '<svg style="width:14px;height:14px"') + ' ' + compact(r.forks) + '</span>' : '') +
            (r.updated ? '<span>updated ' + esc(rel(r.updated)) + '</span>' : '') +
          '</div></div>';
      }).join('');
    }
  } else {
    var f = accFeed[a.login] && accFeed[a.login][accTab];
    if (f == null) {
      h += '<div class="spinwrap"><div class="spinner"></div></div>';
      loadAccountFeed(a, accTab);
    } else if (!f.length) {
      h += '<div class="card"><div class="empty">Nothing here.</div></div>';
    } else {
      h += '<div class="card list">' + f.map(function (it) {
        return '<div class="lrow" data-open="' + esc(it.link) + '">' +
          '<div class="eicon ' + (it.kind === 'release' ? 'tag' : 'push') + '">' +
          (it.kind === 'release' ? I.release : I.commit) + '</div>' +
          '<div class="lmain"><div class="ltitle">' + esc(it.title || '(no message)') + '</div>' +
          '<div class="lsub">' + esc(it.repo) + ' · ' + esc(rel(it.updated)) + '</div></div></div>';
      }).join('') + '</div>';
    }
  }
  return h;
}

function loadAccountFeed(a, kind) {
  var token = renderToken;
  var repos = (a.repoList || []).slice(0, REPOS_PER_ACCOUNT);
  var jobs = repos.map(function (r) {
    var fn = kind === 'releases' ? fetchReleases : fetchCommits;
    return fn(a.login, r.name).then(function (items) {
      return items.slice(0, 6).map(function (it) {
        return { kind: kind === 'releases' ? 'release' : 'commit', repo: a.login + '/' + r.name,
                 title: it.title, updated: it.updated, link: it.link };
      });
    }).catch(function () { return []; });
  });
  Promise.all(jobs).then(function (groups) {
    var flat = [].concat.apply([], groups);
    flat.sort(function (x, y) { return String(y.updated || '').localeCompare(String(x.updated || '')); });
    accFeed[a.login] = accFeed[a.login] || {};
    accFeed[a.login][kind] = flat;
    if (token === renderToken) render();
  });
}

/* ---------------- repo detail ---------------- */
var repoTab = 'commits';
var repoCache = {};

function viewRepo(owner, name) {
  var key = owner + '/' + name;
  var c = repoCache[key];
  var h = '';
  var acc = findAccount(owner);
  var meta = null;
  if (acc) {
    (acc.repoList || []).forEach(function (r) { if (r.name === name) meta = r; });
  }

  h += '<div class="card">' +
    '<div class="rcname">' + esc(name) + '</div>' +
    (meta && meta.desc ? '<p class="rcdesc" style="-webkit-line-clamp:4">' + esc(meta.desc) + '</p>' : '') +
    '<div class="chips">' +
      (meta && meta.lang ? '<span class="chip"><i class="dot" style="background:' + esc(meta.color || 'var(--text2)') + '"></i>' + esc(meta.lang) + '</span>' : '') +
      (meta && meta.stars ? '<span class="chip">★ ' + compact(meta.stars) + '</span>' : '') +
      (meta && meta.forks ? '<span class="chip">⑂ ' + compact(meta.forks) + '</span>' : '') +
      (meta && meta.updated ? '<span class="chip">' + esc(rel(meta.updated)) + '</span>' : '') +
    '</div>' +
    '<div class="btnrow">' +
      '<button class="btn ghost" data-open="https://github.com/' + esc(key) + '">Open repo</button>' +
    '</div></div>';

  h += '<div class="seg">' +
    [['commits', 'Commits'], ['releases', 'Releases']].map(function (t) {
      return '<button class="segb' + (repoTab === t[0] ? ' on' : '') + '" data-repotab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

  if (!c) {
    h += '<div class="spinwrap"><div class="spinner"></div></div>';
    loadRepo(key, owner, name);
  } else {
    var items = c[repoTab];
    if (!items || !items.length) {
      h += '<div class="card"><div class="empty">No ' + esc(repoTab) + ' found.</div></div>';
    } else {
      h += '<div class="card list">' + items.map(function (it) {
        var isRel = repoTab === 'releases';
        return '<div class="lrow" data-open="' + esc(it.link) + '">' +
          '<div class="eicon ' + (isRel ? 'tag' : 'push') + '">' + (isRel ? I.release : I.commit) + '</div>' +
          '<div class="lmain"><div class="ltitle">' + esc(it.title || (isRel ? 'Release' : 'Commit')) + '</div>' +
          '<div class="lsub">' + (it.author ? esc(it.author) + ' · ' : '') + esc(rel(it.updated)) + '</div></div></div>';
      }).join('') + '</div>';
    }
  }
  return h;
}

function loadRepo(key, owner, name) {
  var token = renderToken;
  var parts = key.split('/');
  Promise.all([
    fetchCommits(parts[0], parts[1]).catch(function () { return []; }),
    fetchReleases(parts[0], parts[1]).catch(function () { return []; })
  ]).then(function (r) {
    repoCache[key] = { commits: r[0], releases: r[1] };
    if (token === renderToken) render();
  });
}

/* ------------------------------------------------------------------ router */
function parseHash() {
  var h = (location.hash || '#/home').replace(/^#/, '');
  var parts = h.split('/').filter(function (x) { return x !== ''; });
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'u' && parts[1]) return { name: 'account', login: decodeURIComponent(parts[1]) };
  if (parts[0] === 'r' && parts[1] && parts[2]) return { name: 'repo', owner: parts[1], repo: parts[2] };
  if (parts[0] === 'c' && parts[1] && parts[2] && parts[3]) return { name: 'commit', owner: parts[1], repo: parts[2], sha: parts[3] };
  if (parts[0] === 'rel' && parts[1] && parts[2] && parts[3]) {
    return { name: 'release', owner: parts[1], repo: parts[2], tag: decodeURIComponent(parts.slice(3).join('/')) };
  }
  return { name: parts[0] };
}

var TAB_OF = { home: 0, accounts: 0, repos: 0, activity: 1, releases: 2, me: 3 };

function render() {
  if (!store.get('gh:session', false)) return;
  renderToken++;
  var r = parseHash();
  var view = $('#view');
  var title = '', sub = '', back = false, fab = false, refresh = true;

  if (r.name === 'home') {
    title = 'Home';
    sub = state.accounts.length ? state.accounts.length + ' tracked' : 'Nothing tracked yet';
  } else if (r.name === 'accounts') {
    title = 'Accounts';
    sub = 'Public GitHub accounts you follow';
    fab = true;
  } else if (r.name === 'activity') {
    title = 'Activity';
    sub = 'Commits and releases across your accounts';
  } else if (r.name === 'repos') {
    title = 'Repositories';
    sub = 'Every repo across your tracked accounts';
  } else if (r.name === 'releases') {
    title = 'Releases';
    sub = 'APKs, source files and notes from every tracked repo';
  } else if (r.name === 'me') {
    title = 'You';
    sub = state.personal ? '@' + state.personal + ' · personal dashboard' : 'Personal dashboard';
  } else if (r.name === 'settings') {
    title = 'Settings';
    sub = '';
    refresh = false;
  } else if (r.name === 'account') {
    var a = findAccount(r.login);
    title = a ? (a.name || a.login) : r.login;
    sub = '@' + r.login;
    back = true;
    if (a) { state.lastSeen[a.login] = Date.now(); saveSeen(); }
  } else if (r.name === 'repo') {
    title = r.repo;
    sub = r.owner;
    back = true;
  } else if (r.name === 'commit') {
    title = 'Commit';
    sub = r.owner + '/' + r.repo + ' · ' + r.sha.slice(0, 7);
    back = true;
    refresh = false;
  } else if (r.name === 'release') {
    title = r.tag;
    sub = r.owner + '/' + r.repo;
    back = true;
    refresh = false;
  } else {
    title = 'Home';
  }

  var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
  $('#bigTitle').textContent = title;
  $('#bigSub').textContent = offline
    ? (sub ? sub + ' · offline' : 'Offline · showing saved data')
    : sub;
  $('#bigSub').hidden = !sub;
  $('#backBig').hidden = !back;
  $('#backApp').hidden = !back;
  $('#appbarTitle').textContent = title;
  $('#refreshBig').hidden = !refresh;
  $('#fab').hidden = !fab;
  $('#fab').style.display = fab ? '' : 'none';

  if (r.name === 'home') view.innerHTML = viewHome();
  else if (r.name === 'accounts') view.innerHTML = viewAccounts();
  else if (r.name === 'activity') view.innerHTML = viewActivity();
  else if (r.name === 'repos') view.innerHTML = viewRepos();
  else if (r.name === 'releases') view.innerHTML = viewReleases();
  else if (r.name === 'me') view.innerHTML = viewMe();
  else if (r.name === 'settings') view.innerHTML = viewSettings();
  else if (r.name === 'account') view.innerHTML = viewAccount(r.login);
  else if (r.name === 'repo') view.innerHTML = viewRepo(r.owner, r.repo);
  else if (r.name === 'commit') view.innerHTML = viewCommit(r.owner, r.repo, r.sha);
  else if (r.name === 'release') view.innerHTML = viewReleaseDetail(r.owner, r.repo, r.tag);

  // entrance animation on navigation; new rows slide in on refresh
  var routeKey = r.name + '|' + (r.login || '') + '|' + (r.owner || '') + '|' + (r.repo || '');
  var navigated = routeKey !== lastRouteKey;
  if (navigated) lastRouteKey = routeKey;
  view.classList.remove('swap');
  /* no page entrance animation — only new rows slide in */
  paintRows(routeKey, navigated);
  if (r.name === 'releases') autoloadAssets(state.releases);
  if (r.name === 'settings') wireSettings();

  // nav state
  var tabs = document.querySelectorAll('.navbtn');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', Number(tabs[i].dataset.tab) === TAB_OF[r.name]);
  }
  // appbar only when scrolled (the big title handles the top)
  onScroll();
}

function onScroll() {
  var sc = $('#scroller');
  var bar = $('#appbar');
  if (!sc || !bar) return;
  bar.classList.toggle('on', sc.scrollTop > 64);
}

/* --------------------------------------------------------------- actions */
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-go],[data-account],[data-add],[data-refresh],[data-theme],[data-accent],[data-toggle],[data-ttl],[data-clear],[data-signout],[data-wipe],[data-remove],[data-open],[data-repo],[data-filter],[data-acctab],[data-repotab],[data-feed],[data-moreassets],[data-download],[data-pickpersonal],[data-setpersonal],[data-widgetrefresh],[data-notifytoggle],[data-managerepos],[data-togglerepo],[data-stat],[data-difffile],[data-pstat],[data-trackuser],[data-streak],[data-lang],[data-heat],[data-retryassets],[data-settab],[data-copy]') : null;
  if (!t) return;

  if (t.dataset.setfilter) { actFilter = t.dataset.setfilter; go(t.dataset.go || '#/activity'); return; }
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.repo) {
    closeSheet();
    repoCache[t.dataset.repo] = repoCache[t.dataset.repo] || null;
    go('#/r/' + t.dataset.repo);
    return;
  }
  if (t.dataset.account) { closeSheet(); go('#/u/' + encodeURIComponent(t.dataset.account)); return; }
  if (t.dataset.add) { addAccountSheet(); return; }
  if (t.dataset.refresh) { if (!syncing) { clearCachesSoft(); syncAll(false).then(function () { toast('Synced'); }); } return; }
  if (t.dataset.settab) { setTab = t.dataset.settab; render(); return; }
  if (t.dataset.copy) {
    try { if (window.Tracker && window.Tracker.copy) window.Tracker.copy(t.dataset.copy); } catch (e) { }
    toast('@' + t.dataset.copy + ' copied');
    return;
  }
  if (t.dataset.theme) { state.settings.theme = t.dataset.theme; saveSettings(); applySettings(); render(); return; }
  if (t.dataset.accent) { state.settings.accent = t.dataset.accent; saveSettings(); applySettings(); render(); return; }
  if (t.dataset.toggle === 'glow') { state.settings.glow = !state.settings.glow; saveSettings(); applySettings(); render(); return; }
  if (t.dataset.toggle === 'widgetpitch') {
    state.settings.widgetPitch = !state.settings.widgetPitch;
    saveSettings(); applySettings(); pushWidgets(); render();
    toast(state.settings.widgetPitch ? 'Widgets in pitch black' : 'Widgets follow the app theme');
    return;
  }
  if (t.dataset.ttl) { state.settings.ttl = Number(t.dataset.ttl); saveSettings(); render(); return; }
  if (t.dataset.clear) {
    store.keys('gh:c:').forEach(function (k) { store.del(k); });
    repoCache = {}; accFeed = {};
    toast('Cached pages cleared'); render(); return;
  }
  if (t.dataset.signout) {
    stopLive();
    store.set('gh:session', false);
    $('#app').hidden = true; $('#login').hidden = false;
    toast('Signed out'); return;
  }
  if (t.dataset.wipe) {
    confirmSheet('Delete everything?', 'This removes your local account and every tracked username from this phone. GitHub itself is untouched.', 'Delete', function () {
      store.keys('gh:').forEach(function (k) { store.del(k); });
      location.reload();
    });
    return;
  }
  if (t.dataset.remove) {
    var who = t.dataset.remove;
    confirmSheet('Stop tracking @' + who + '?', 'Their data is removed from this phone.', 'Remove', function () {
      removeAccount(who); go('#/accounts'); toast('Removed @' + who);
    });
    return;
  }
  if (t.dataset.widgetrefresh) {
    if (syncing) { toast('Already syncing…'); return; }
    t.classList.add('spin');
    toast('Refreshing…');
    syncAll(false, true).then(function () {
      if (t.dataset.widgetrefresh === 'contrib' && state.personal) {
        contribLoading[state.personal] = false;
        ensureContrib(state.personal);
      }
      toast('Updated');
    });
    return;
  }
  if (t.dataset.notifytoggle) {
    var acc = findAccount(t.dataset.notifytoggle);
    if (!acc) return;
    acc.notify = !acc.notify;
    if (acc.notify) {
      acc.seenAt = Date.now();
      if (window.Tracker && window.Tracker.askNotifications) {
        try { window.Tracker.askNotifications(); } catch (e) { }
      }
    }
    saveAccounts();
    render();
    toast(acc.notify ? 'Notifications on for @' + acc.login : 'Notifications off');
    return;
  }
  if (t.dataset.managerepos) { manageRepos(t.dataset.managerepos); return; }
  if (t.dataset.stat) { statSheet(t.dataset.stat); return; }
  if (t.dataset.togglerepo) {
    var parts = t.dataset.togglerepo.split('/');
    var lg = parts.shift(), nm = parts.join('/');
    var acc = findAccount(lg);
    if (acc) {
      acc.hidden = acc.hidden || [];
      var hi2 = acc.hidden.indexOf(nm);
      if (hi2 >= 0) acc.hidden.splice(hi2, 1); else acc.hidden.push(nm);
      saveAccounts();
      manageRepos(lg);
      render();
    }
    return;
  }
  if (t.dataset.pstat) { pstatSheet(t.dataset.pstatlogin, t.dataset.pstat); return; }
  if (t.dataset.trackuser) { trackUser(t.dataset.trackuser); return; }
  if (t.dataset.streak) { streakSheet(t.dataset.streak); return; }
  if (t.dataset.lang) { langSheet(t.dataset.langlogin, t.dataset.lang); return; }
  if (t.dataset.heat) {
    var hp = String(t.dataset.heat).split('|');
    toast(hp[0] + ' · ' + hp[1] + ' contribution' + (hp[1] === '1' ? '' : 's'));
    return;
  }
  if (t.dataset.pickpersonal) { pickPersonal(); return; }
  if (t.dataset.setpersonal) {
    state.personal = t.dataset.setpersonal;
    store.set('gh:personal', state.personal);
    closeSheet();
    go('#/me');
    syncAll(true, true);
    return;
  }
  if (t.dataset.download) { downloadFile(t.dataset.download, t.dataset.name || ''); return; }
  if (t.dataset.open) { openFeedItem(t.dataset.open); return; }
  if (t.dataset.difffile) {
    var fk = t.dataset.difffile;
    openFiles[fk] = !openFiles[fk];
    render();
    return;
  }
  if (t.dataset.filter) { actFilter = t.dataset.filter; render(); return; }
  if (t.dataset.acctab) {
    accTab = t.dataset.acctab;
    var cur = parseHash();
    if (cur.name === 'account' && accFeed[cur.login]) render(); else render();
    return;
  }
  if (t.dataset.repotab) { repoTab = t.dataset.repotab; render(); return; }
  if (t.dataset.feed) { openFeedItem(t.dataset.feed); return; }
  if (t.dataset.retryassets) {
    delete assetsFail[t.dataset.retryassets];
    render();
    return;
  }
  if (t.dataset.moreassets) { assetsLimit += 8; render(); return; }
});

function clearCachesSoft() {
  /* on an explicit refresh, drop cached HTML pages but keep them for offline reads
     if the network then fails — the fetch helper re-caches on success */
  store.keys('gh:c:').forEach(function (k) {
    var v = store.get(k, null);
    if (v) { v.t = 0; store.set(k, v); }
  });
}

/* Release files are handed to the native DownloadManager, so they land in
   Downloads with a progress notification instead of kicking out to a browser. */
function downloadFile(url, name) {
  if (!url) return;
  if (window.Tracker && window.Tracker.download) {
    toast('Downloading ' + (name || 'file') + '…');
    try { window.Tracker.download(url, name || ''); return; } catch (e) { }
  }
  openUrl(url);
}
window.__dl = function (ok, name, msg) {
  if (!ok) toast('Could not download' + (msg ? ' — ' + msg : ''));
};
window.__dlDone = function (ok, name) {
  if (ok && name) toast('Saved ' + name + ' to Downloads');
};

/* Every link opens inside the app. Nothing is handed to a browser. */
function openFeedItem(url) {
  if (!url) return;
  var m;
  if ((m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/commit\/([0-9a-f]+)/i))) {
    go('#/c/' + m[1] + '/' + m[2] + '/' + m[3]); return;
  }
  if ((m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/releases\/tag\/(.+)$/i))) {
    go('#/rel/' + m[1] + '/' + m[2] + '/' + encodeURIComponent(decodeURIComponent(m[3]))); return;
  }
  if ((m = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?(?:[?#].*)?$/i))) {
    go('#/r/' + m[1] + '/' + m[2]); return;
  }
  if ((m = url.match(/^https?:\/\/github\.com\/([^\/?#]+)\/?(?:[?#].*)?$/i))) {
    go('#/u/' + m[1]); return;
  }
  toast('This link cannot be opened in the app');
}

function openUrl(url) {
  if (!url) return;
  try {
    if (window.Tracker && window.Tracker.openUrl) window.Tracker.openUrl(url);
    else window.open(url, '_blank');
  } catch (e) {}
}

/* ---------------------------------------------------------------- add sheet */
function addAccountSheet() {
  openSheet('Add a GitHub account',
    '<p class="dim" style="margin:0 4px 14px;line-height:1.55">Type any public username, or paste a profile link. No password or token needed.</p>' +
    '<label class="fldlabel" for="addU">GitHub username</label>' +
    '<input class="fld" id="addU" autocapitalize="none" spellcheck="false" placeholder="e.g. torvalds">' +
    '<p class="loginErr" id="addErr"></p>' +
    '<div class="btncol"><button class="btn primary btnblock" id="addGo">Add account</button></div>',
    function () {
      var inp = $('#addU');
      inp.focus();
      var submit = function () {
        var v = inp.value.trim();
        if (!v) return;
        var btn = $('#addGo');
        btn.disabled = true; btn.textContent = 'Checking…';
        $('#addErr').textContent = '';
        addAccount(v).then(function (acc) {
          closeSheet();
          go('#/u/' + encodeURIComponent(acc.login));
          askNotify(acc);
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = 'Add account';
          var msg = friendlyError(err);
          if (/HTTP 404/.test(String((err && err.message) || err))) msg = 'No GitHub user called “' + v + '”.';
          $('#addErr').textContent = msg;
        });
      };
      $('#addGo').onclick = submit;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
}

/* ------------------------------------------------------------------- auth */
var authMode = 'signin';
function hasAuth() { return !!store.get('gh:auth', null); }

function initAuth() {
  var authed = hasAuth();
  authMode = authed ? 'signin' : 'create';
  $('#loginSub').textContent = authed ? 'Sign in to your tracker' : 'Create your local account';
  $('#loginGo').textContent = authed ? 'Sign in' : 'Create account';
  $('#lpWrap').hidden = authed;
  $('#loginSwap').hidden = true;
  $('#loginSwap').parentNode && ($('#loginSwap').style.display = 'none');

  if (store.get('gh:session', false) && authed) {
    showApp();
  } else {
    $('#login').hidden = false;
    $('#app').hidden = true;
  }

  $('#loginGo').onclick = doAuth;
  $('#lp').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAuth(); });
  $('#lp2').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAuth(); });
}

function doAuth() {
  var u = $('#lu').value.trim();
  var p = $('#lp').value;
  var err = $('#loginErr');
  err.textContent = '';
  if (!u) { err.textContent = 'Enter a username.'; return; }
  if (p.length < 4) { err.textContent = 'Use at least 4 characters for the password.'; return; }

  if (authMode === 'create') {
    var p2 = $('#lp2').value;
    if (p !== p2) { err.textContent = 'The two passwords do not match.'; return; }
    var salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set('gh:auth', { u: u, salt: salt, h: sha256(salt + ':' + p), at: Date.now() });
    store.set('gh:session', true);
    showApp();
    toast('Account created');
  } else {
    var a = store.get('gh:auth', null);
    if (!a) { err.textContent = 'No account on this phone.'; return; }
    if (a.u.toLowerCase() !== u.toLowerCase()) { err.textContent = 'Wrong username or password.'; return; }
    if (a.h !== sha256(a.salt + ':' + p)) { err.textContent = 'Wrong username or password.'; return; }
    store.set('gh:session', true);
    showApp();
  }
}

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  applySettings();
  render();
  startLive();
  if (state.accounts.length) syncAll(true, true);
}

/* ------------------------------------------------------------------- boot */
/* navigation stack so the back arrow and the system back gesture step back
   through the app instead of re-rendering the page */
var navStack = [];
var backNav = false;
var prevHash = location.hash || '#/home';

window.addEventListener('hashchange', function () {
  var h = location.hash || '#/home';
  if (!backNav && h !== prevHash) navStack.push(prevHash);
  backNav = false;
  prevHash = h;
  render();
});

/* coming back to the app always re-syncs immediately, then resumes the loop */
document.addEventListener('visibilitychange', function () {
  if (document.hidden) return;
  if (!store.get('gh:session', false)) return;
  liveTickCount = 0;
  startLive();
  syncAll(true, true);
});
window.addEventListener('offline', function () { render(); });
window.addEventListener('online', function () { render();
  if (!store.get('gh:session', false)) return;
  backoffUntil = 0; backoffMs = 0;
  startLive();
  syncAll(true, true);
});
document.addEventListener('scroll', onScroll, true);
window.addEventListener('scroll', onScroll, true);

/* Android back button / gesture */
window.__onBack = function () {
  var s = $('#sheet');
  if (s && !s.hidden) { closeSheet(); return true; }
  if (navStack.length) {
    backNav = true;
    navStack.pop();
    history.back();
    return true;
  }
  var r = parseHash();
  if (r.name !== 'home') { go('#/home'); return true; }
  return false;
};

/* the two on-screen back arrows use the same path */
(function () {
  var a = document.getElementById('backBig'), b = document.getElementById('backApp');
  if (a) a.onclick = function () { window.__onBack(); };
  if (b) b.onclick = function () { window.__onBack(); };
})();

/* version stamp from the shell, if present */
(function () {
  try {
    if (window.Tracker && window.Tracker.appVersion) {
      var v = window.Tracker.appVersion();
      var el = document.getElementById('verTxt');
      if (el && v) el.textContent = 'v' + v;
    }
  } catch (e) {}
})();

/* public hooks used by the tests */
window.GH = { sha256: sha256, atomEntries: atomEntries, parseRepos: parseRepos, state: state,
  isSyncing: function () { return syncing; }, fetchText: fetchText, syncAll: syncAll };

applySettings();
initAuth();
})();
