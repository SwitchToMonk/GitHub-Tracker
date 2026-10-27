# GitHub Tracker

A local-first Android app that tracks **public** GitHub accounts: their repos,
commits, releases and updates — including the APK and source files attached to
each release.

No GitHub login. No API keys. No API rate limits.

---

## How it reads GitHub

Everything comes from the same public pages a browser would load:

| What | Where |
|---|---|
| Profile (name, bio, followers) | `https://github.com/<user>` |
| Repo list (language, stars, forks, updated) | `https://github.com/<user>?tab=repositories` |
| Commits | `https://github.com/<owner>/<repo>/commits.atom` |
| Releases | `https://github.com/<owner>/<repo>/releases.atom` |
| Release files (APK / source zip / tar.gz) | `https://github.com/<owner>/<repo>/releases/expanded_assets/<tag>` |
| Contribution graph, daily counts, yearly total | `https://github.com/users/<user>/contributions` |

The Atom feeds and the `expanded_assets` fragment are public and not part of the
REST API, so there is no token and no API quota. Requests go through a small
native HTTPS bridge (`Tracker.raw(url, jid)`) because github.com sends no CORS
headers — a page cannot fetch it directly.

**Live sync.** There is no refresh interval to choose. While the app is open it
keeps syncing — a tick every 45 seconds that re-reads the commit, release and
contribution feeds, a full pass (profiles, repo lists, every release) every fifth
tick, and an immediate full sync whenever the app comes back to the foreground or
the network returns. If GitHub starts throttling, the loop backs off (60s, 120s,
240s…) instead of hammering it, and resumes automatically.

Profile and repo pages are cached for two minutes because they rarely change; the
feeds are always re-read. At most three requests run at once.

## Home screen widgets (real AppWidgets)

Three genuine Android home-screen widgets — long-press your launcher, pick
Widgets, find **GitHub Tracker**:

| Widget | Size | Shows |
|---|---|---|
| **Updates** | 4x2 | latest commits, releases and newly created repos |
| **Releases** | 4x2 | latest releases with their files |
| **Contributions** | 3x2 | your personal heatmap, drawn as a bitmap, plus the streak |

They are `AppWidgetProvider`s (`UpdatesWidget`, `ReleasesWidget`,
`ContribWidget`) painted with `RemoteViews`. After every sync the page pushes one
JSON snapshot through `Tracker.widgetSync(...)`, which is cached in
SharedPreferences and repainted — so a widget is never blank, even offline.
Each widget's refresh button repaints from cache immediately and then opens the
app with a `widget_refresh` extra, which runs a real sync and pushes a fresh
snapshot back.

## Animations

The motion system is ported from the Gitly source: staggered `rise` entrance on
navigation, a `refreshSweep` light sweep plus `softIn` settle on refresh,
`.new-in` (slide in + brief tint + left bar) for rows that genuinely arrived,
`.slide-top` for inserted rows, and `.settled` so a row never replays its
entrance. Refresh never blanks the list.

## Notifications

When you add an account the app asks whether you want notifications for it; the
same switch sits on the account screen. With it on, each sync compares what it
just fetched against the previous run and posts an Android notification for new
commits, releases and activity — up to three per account per sync, then one
summary. The first sync after enabling is a silent baseline, so you are never
spammed with history. Android 13+ asks for the notification permission the first
time you enable it.

## Sign-in

The username + password you enter on first launch is **this app's own local
account**, stored on the device as a salted SHA-256 hash. It is not a GitHub
login and is never sent anywhere. Forgetting it means using *Settings → Delete
account and data* and starting again.

## Screens

- **Home** — accounts, totals, account avatars and three live widgets: **Updates**
  (every change, with its own refresh button), **Releases** (latest with APK
  badges) and **Contributions** (mini graph + streak for your personal account)
- **Accounts** — everything you track; tap through to a profile
- **Activity** — merged commit + release feed, filterable
- **Releases** — every release across every tracked repo, with its APK, source
  zip/tar.gz and other files listed inline; tap a file to download it in-app
- **Account** — profile, stats, repos, plus per-account commits and releases
- **Repo** — commits and releases for one repository
- **You** — the personal tracker: contribution graph, daily activity, streaks,
  language breakdown, totals and your top repositories for the account you mark
  as yourself
- **Settings** — light / dark / pitch black, 8 preset accents **plus any custom
  hex colour**, glow, live-sync status, personal account, sign out, wipe

Tapping a file on the Releases screen downloads it in-app through Android's
DownloadManager: it lands in **Downloads** with a progress notification, and an
APK opens the installer straight from that notification.

## Layout

```
web/                     the app (plain HTML/CSS/JS, no build step)
  index.html             shell, login, nav
  gh.js                  all logic: fetch, parse, routes, views
  gh.css                 polish layer: sheet spacing, release cards, motion
  app.css                One UI design system (from the OneBudget source)
  tracker.css            tracker components layered on the design system
  motion.css             spring curves
  fonts/OneGitSans.ttf
android/                 WebView shell
  app/AndroidManifest.xml
  app/java/com/onegit/tracker/MainActivity.java
  app/res/               strings, theme, launcher icons
  build.sh               aapt2 + javac + d8 + zipalign + apksigner (no Gradle)
```

## Building the APK

Needs a JDK 17+ and Android SDK build-tools 34 + platform 34.

```bash
export JDK_BIN=/path/to/jdk/bin
export BT=/path/to/android-sdk/build-tools/34.0.0
export PLATFORM_JAR=/path/to/android-sdk/platforms/android-34/android.jar
export OUT=/path/to/GitHubTracker.apk
bash android/build.sh
```

`build.sh` copies `web/` into `android/app/assets/www/`, compiles the resources,
compiles the single Java class, dexes it, zips, aligns and signs with
`android/debug.keystore` (created on first run).

## Running the web app alone

The page needs the `Tracker` bridge for network access. To try it in a desktop
browser, stub it before `gh.js` loads:

```html
<script>
  window.Tracker = {
    raw(url, jid) {
      fetch(url).then(r => r.text())
        .then(t => window.__raw(jid, true, t))
        .catch(e => window.__raw(jid, false, e.message));
    },
    theme() {}, appVersion() { return 'dev'; }, openUrl(u) { window.open(u); }, copy() {}
  };
</script>
```

(Desktop browsers block those cross-origin reads, so the stub only works behind a
CORS proxy — on the phone the native bridge handles it.)

## Notes

- Reads HTML, so a future GitHub redesign could affect profile/repo parsing.
  The Atom feeds and `expanded_assets` are far more stable.
- Large follower counts appear rounded ("330k") exactly as the page prints them.
- Read-only: the app never posts, stars or writes anything to GitHub.
