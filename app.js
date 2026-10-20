(() => {
  "use strict";

  const CONFIG = window.CONFIG || {};
  const TMDB_KEY = (CONFIG.TMDB_KEY || "").trim();
  const HAS_KEY = TMDB_KEY.length > 0;
  const IMG = "https://image.tmdb.org/t/p/";
  const IA = "https://archive.org";

  // US public domain covers films released 95+ years ago (1930 and earlier as of 2026).
  const PD_CUTOFF_YEAR = new Date().getFullYear() - 96;

  // Hand-picked public-domain classics with good Internet Archive copies.
  const FREE_CLASSICS = [
    { ia: "Night.Of.The.Living.Dead_1080p", title: "Night of the Living Dead", year: 1968,
      blurb: "Strangers barricade themselves in a Pennsylvania farmhouse as the dead rise outside. George A. Romero's low-budget debut invented the modern zombie film." },
    { ia: "his_girl_friday", title: "His Girl Friday", year: 1940,
      blurb: "A fast-talking newspaper editor schemes to win back his star reporter, who also happens to be his ex-wife, before she quits and remarries." },
    { ia: "Nosferatu_most_complete_version_93_mins.", title: "Nosferatu", year: 1922,
      blurb: "F. W. Murnau's silent horror landmark: an estate agent travels to the castle of the sinister Count Orlok and brings death back with him." },
    { ia: "CarnivalofSouls", title: "Carnival of Souls", year: 1962,
      blurb: "After surviving a car crash, a church organist is drawn to an abandoned lakeside pavilion and haunted by a pale, grinning figure." },
    { ia: "The_General_Buster_Keaton", title: "The General", year: 1926,
      blurb: "Buster Keaton chases his stolen locomotive across enemy lines in one of the greatest action comedies ever filmed, every stunt done for real." },
    { ia: "Detour", title: "Detour", year: 1945,
      blurb: "A hitchhiking pianist's luck turns fatal on the road to Los Angeles in this lean, doom-laden film noir." },
    { ia: "house_on_haunted_hill_ipod", title: "House on Haunted Hill", year: 1959,
      blurb: "Vincent Price offers five guests $10,000 each to survive one night in a house with a murderous past." },
    { ia: "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari", title: "The Cabinet of Dr. Caligari", year: 1920,
      blurb: "A sleepwalker commits murders for a carnival hypnotist, inside twisted painted sets that defined German Expressionism." },
    { ia: "ScarletStreet", title: "Scarlet Street", year: 1945,
      blurb: "Fritz Lang's noir about a meek cashier and amateur painter who falls for a woman who is only after his money." },
    { ia: "TheStranger_0", title: "The Stranger", year: 1946,
      blurb: "Orson Welles directs and stars as a Nazi fugitive hiding as a teacher in a quiet Connecticut town, with a war-crimes investigator closing in." },
    { ia: "mclintok_widescreen", title: "McLintock!", year: 1963,
      blurb: "John Wayne plays a cattle baron whose estranged wife comes home in this rowdy Western comedy." },
    { ia: "royal_wedding", title: "Royal Wedding", year: 1951,
      blurb: "Fred Astaire famously dances on the ceiling in this musical about a brother-and-sister act performing in London." },
    { ia: "The_Little_Shop_of_Horrors.mpeg", title: "The Little Shop of Horrors", year: 1960,
      blurb: "A florist's clerk raises a plant that craves human blood. Roger Corman's cult comedy features an early Jack Nicholson." },
    { ia: "doa-1949", title: "D.O.A.", year: 1949,
      blurb: "Poisoned and with only days to live, an accountant races to find out who killed him." },
    { ia: "plan.-9.-from.-outer.-space.-1957", title: "Plan 9 from Outer Space", year: 1957,
      blurb: "Aliens raise the dead to stop humanity's doomsday weapon in Ed Wood's legendarily bad sci-fi movie." },
  ];

  // Search pages on the original services. Anything not listed falls back to TMDB's watch page.
  const PROVIDER_SEARCH = {
    8: (q) => `https://www.netflix.com/search?q=${q}`,
    9: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`,
    10: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`,
    119: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`,
    337: (q) => `https://www.disneyplus.com/search?q=${q}`,
    15: (q) => `https://www.hulu.com/search?q=${q}`,
    2: (q) => `https://tv.apple.com/search?term=${q}`,
    350: (q) => `https://tv.apple.com/search?term=${q}`,
    3: (q) => `https://play.google.com/store/search?q=${q}&c=movies`,
    192: (q) => `https://www.youtube.com/results?search_query=${q}`,
    73: (q) => `https://tubitv.com/search/${q}`,
  };

  const FALLBACK_REGIONS = ["US", "GB", "CA", "AU", "PH", "IN", "DE", "FR", "ES", "BR", "MX", "JP", "KR", "SG", "NZ"];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) : null);
  const normTitle = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  // Loading indicator: the logo breaking into four pieces and re-forming.
  const loaderHtml = (label = "Loading…", small = false) => `
    <div class="loader${small ? " small" : ""}" role="status">
      <svg viewBox="0 0 100 100" aria-hidden="true">${[0, 1, 2, 3]
        .map((i) => `<g class="piece" clip-path="url(#cs-q${i})"><use href="#cs-mark"/></g>`).join("")}</svg>
      <span>${esc(label)}</span>
    </div>`;
  window.CineLoader = loaderHtml;

  // Start at the top behind the intro instead of restoring an old scroll position.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // The logo intro plays through once, then leaves as soon as the hero image is ready.
  let introClosed = false;
  function finishIntro(now = false) {
    if (introClosed) return;
    introClosed = true;
    const el = document.getElementById("intro");
    if (!el) return;
    const min = document.documentElement.classList.contains("intro-quick") ? 900 : 2300;
    const wait = now ? 0 : Math.max(0, min - performance.now());
    setTimeout(() => {
      el.classList.add("done");
      setTimeout(() => el.remove(), 800);
    }, wait);
  }
  setTimeout(() => finishIntro(), 5000);
  document.getElementById("intro")?.addEventListener("click", () => finishIntro(true));

  const state = {
    region: pickRegion(),
    freeByTmdbId: new Map(), // tmdb id -> classic
    cache: new Map(),
  };

  function pickRegion() {
    let saved = null;
    try { saved = localStorage.getItem("cinescout.region"); } catch {}
    const fromLang = (navigator.language || "").split("-")[1];
    return (saved || CONFIG.REGION || fromLang || "US").toUpperCase();
  }

  // ---------- API helpers ----------

  async function getJSON(url, opts) {
    if (state.cache.has(url)) return state.cache.get(url);
    const p = fetch(url, opts).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
    state.cache.set(url, p);
    p.catch(() => state.cache.delete(url));
    return p;
  }

  function tmdb(path, params = {}) {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    const headers = { accept: "application/json" };
    if (TMDB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${TMDB_KEY}`;
    else url.searchParams.set("api_key", TMDB_KEY);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    return getJSON(url.toString(), { headers });
  }

  function iaSearch(query, rows = 5) {
    const url = new URL(`${IA}/advancedsearch.php`);
    url.searchParams.set("q", query);
    for (const f of ["identifier", "title", "year", "licenseurl", "downloads"]) url.searchParams.append("fl[]", f);
    url.searchParams.append("sort[]", "downloads desc");
    url.searchParams.set("rows", rows);
    url.searchParams.set("output", "json");
    return getJSON(url.toString()).then((d) => d.response.docs);
  }

  const iaThumb = (id) => `${IA}/services/img/${encodeURIComponent(id)}`;
  const iaEmbed = (id) => `${IA}/embed/${encodeURIComponent(id)}`;

  const isOpenLicense = (doc) => /publicdomain|creativecommons/i.test(doc.licenseurl || "");

  // Finds a free, legal copy of a movie on the Internet Archive.
  async function findFreeCopy(movie) {
    const year = yearOf(movie.release_date);
    const curated = state.freeByTmdbId.get(movie.id) ||
      FREE_CLASSICS.find((c) => normTitle(c.title) === normTitle(movie.title) && Math.abs(c.year - year) <= 1);
    if (curated) return curated.ia;
    if (!year) return null;

    const title = String(movie.title).replace(/["\\]/g, "");
    const docs = await iaSearch(
      `title:("${title}") AND year:[${year - 1} TO ${year + 1}] AND collection:feature_films AND mediatype:movies`
    ).catch(() => []);
    const ok = docs.find((d) => isOpenLicense(d) || (year <= PD_CUTOFF_YEAR && Number(d.year) <= PD_CUTOFF_YEAR));
    return ok ? ok.identifier : null;
  }

  // ---------- Rendering ----------

  function posterCard(item, i = 0) {
    const free = item.freeIa || state.freeByTmdbId.has(item.id);
    const img = item.poster_path ? `${IMG}w342${item.poster_path}` : item.thumb;
    const href = item.id ? `#movie/${item.id}` : `#free/${encodeURIComponent(item.freeIa)}`;
    const year = yearOf(item.release_date) || item.year || "";
    const rating = item.vote_average ? `<span class="rating">★ ${item.vote_average.toFixed(1)}</span>` : "";
    return `
      <a class="card" href="${href}" style="--i:${Math.min(i, 12)}" aria-label="${esc(item.title)} ${year}">
        <div class="poster">
          ${img ? `<img loading="lazy" src="${esc(img)}" alt="" onerror="this.remove()">` : ""}
          <div class="ph" ${img ? 'style="z-index:-1"' : ""}>${esc(item.title)}</div>
          ${free ? '<span class="badge badge-free">Free</span>' : ""}
          ${rating}
        </div>
        <div class="card-title">${esc(item.title)}</div>
        <div class="card-meta">${esc(year)}</div>
      </a>`;
  }

  function skeletonCards(n = 8) {
    return Array.from({ length: n }, () => '<div class="card skeleton"><div class="poster"></div></div>').join("");
  }

  function addRow(title, subtitle, genreId) {
    const sec = document.createElement("section");
    sec.className = "row";
    const side = genreId
      ? `<button class="link-btn" data-genre="${genreId}">See all →</button>`
      : subtitle ? `<small>${esc(subtitle)}</small>` : "";
    sec.innerHTML = `
      <div class="row-head"><h2>${esc(title)}</h2>${side}</div>
      <div class="track">${skeletonCards()}</div>`;
    $("#rows").appendChild(sec);
    reveal(sec);
    return {
      fill(items) {
        if (!items.length) return sec.remove();
        sec.querySelector(".track").innerHTML = items.map(posterCard).join("");
      },
      fail() { sec.querySelector(".track").innerHTML = `<p class="muted">Couldn't load this row.</p>`; },
    };
  }

  // Rows animate in as they scroll into view. Without IntersectionObserver they just show.
  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          revealObserver.unobserve(e.target);
        }
      }, { rootMargin: "0px 0px -8% 0px" })
    : null;
  if (revealObserver) document.documentElement.classList.add("js-reveal");

  function reveal(el) {
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add("in");
  }
  window.CineReveal = reveal;

  function renderHero(m) {
    const hero = $("#hero");
    const size = window.innerWidth > 1400 ? "original" : "w1280";
    const bg = m.backdrop_path ? `${IMG}${size}${m.backdrop_path}` : m.thumb;
    const href = m.id ? `#movie/${m.id}` : `#free/${encodeURIComponent(m.freeIa)}`;
    hero.innerHTML = `
      <div class="hero-bg" aria-hidden="true"></div>
      <div class="hero-video" aria-hidden="true"></div>
      <button class="hero-sound" type="button" hidden aria-label="Unmute trailer" aria-pressed="false">🔇</button>
      <div class="hero-inner">
        <div class="eyebrow">${m.freeIa ? "Free to watch" : "Trending this week"}</div>
        <h2 class="hero-title">${esc(m.title)}</h2>
        <p>${esc(m.overview || "")}</p>
        <div class="actions">
          ${m.freeIa ? `<a class="btn btn-free" href="${href}?play">▶ Watch free</a>` : ""}
          <a class="btn ${m.freeIa ? "btn-ghost" : "btn-primary"}" href="${href}">${m.id ? "Details &amp; where to watch" : "Details"}</a>
        </div>
      </div>`;
    showView();
    if (bg) {
      // Fade the backdrop in once it has downloaded, then let it slowly drift.
      const layer = hero.querySelector(".hero-bg");
      const img = new Image();
      img.onload = () => {
        layer.style.backgroundImage = `url("${bg}")`;
        layer.classList.add("loaded");
        finishIntro();
      };
      img.onerror = () => finishIntro();
      img.src = bg;
    }
    if (!bg) finishIntro();
    if (m.id && HAS_KEY) queueHeroTrailer(m.id);
  }

  // ---------- Hero trailer ----------
  // The backdrop image shows first. A muted trailer fades in once the page is idle,
  // and only where it won't hurt: wide screens, no data saver, no reduced motion.

  const heroTrailer = { frame: null, playing: false, visible: true };

  function queueHeroTrailer(id) {
    const conn = navigator.connection || {};
    const slow = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (slow || reduce || window.innerWidth < 720) return;

    const start = () => tmdb(`/movie/${id}/videos`)
      .then((v) => { const key = trailerKey(v); if (key) mountHeroTrailer(key); })
      .catch(() => {});
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    const go = () => setTimeout(() => idle(start), 2500);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }

  function ytCommand(func, args = []) {
    heroTrailer.frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }

  function mountHeroTrailer(key) {
    const box = $("#hero .hero-video");
    if (!box || box.firstChild) return;
    const params = new URLSearchParams({
      autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: key, playsinline: 1,
      rel: 0, iv_load_policy: 3, disablekb: 1, enablejsapi: 1, origin: location.origin,
    });
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?${params}`;
    frame.allow = "autoplay; encrypted-media";
    frame.title = "Trailer";
    frame.tabIndex = -1;
    frame.addEventListener("load", () => {
      frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    });
    box.appendChild(frame);
    heroTrailer.frame = frame;
  }

  // Fade the video in only once YouTube reports it is actually playing.
  window.addEventListener("message", (e) => {
    if (!heroTrailer.frame || e.source !== heroTrailer.frame.contentWindow) return;
    let data;
    try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    if (data?.info?.playerState === 1 && !heroTrailer.playing) {
      heroTrailer.playing = true;
      $("#hero .hero-video")?.classList.add("playing");
      const btn = $("#hero .hero-sound");
      if (btn) btn.hidden = false;
      syncHeroPlayback();
    }
  });

  function syncHeroPlayback() {
    if (!heroTrailer.frame) return;
    const active = heroTrailer.visible && !document.hidden && !$("#detail").open && !$("#hero").hidden;
    ytCommand(active ? "playVideo" : "pauseVideo");
  }

  new IntersectionObserver(([entry]) => {
    heroTrailer.visible = entry.isIntersecting;
    syncHeroPlayback();
  }, { threshold: 0.25 }).observe($("#hero"));
  document.addEventListener("visibilitychange", syncHeroPlayback);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".hero-sound");
    if (!btn) return;
    const unmute = btn.getAttribute("aria-pressed") !== "true";
    ytCommand(unmute ? "unMute" : "mute");
    btn.setAttribute("aria-pressed", String(unmute));
    btn.setAttribute("aria-label", unmute ? "Mute trailer" : "Unmute trailer");
    btn.textContent = unmute ? "🔊" : "🔇";
  });

  // ---------- Free classics ----------

  async function loadFreeClassics() {
    if (!HAS_KEY) {
      return FREE_CLASSICS.map((c) => ({ title: c.title, year: c.year, thumb: iaThumb(c.ia), freeIa: c.ia }));
    }
    const results = await Promise.all(FREE_CLASSICS.map(async (c) => {
      try {
        const r = await tmdb("/search/movie", { query: c.title, year: c.year });
        const hit = r.results.find((m) => normTitle(m.title) === normTitle(c.title)) || r.results[0];
        if (hit) {
          state.freeByTmdbId.set(hit.id, c);
          return { ...hit, freeIa: c.ia };
        }
      } catch {}
      return { title: c.title, year: c.year, thumb: iaThumb(c.ia), freeIa: c.ia };
    }));
    return results;
  }

  // ---------- Home ----------

  async function loadHome() {
    $("#keyNotice").hidden = HAS_KEY;
    window.Social?.mountHomeRow($("#rows"));
    const freeRow = HAS_KEY ? null : addRow("Free classics", "Public domain · stream right here");

    if (!HAS_KEY) {
      const free = await loadFreeClassics();
      freeRow.fill(free);
      renderHero({ ...free[0], overview: FREE_CLASSICS[0].blurb });
      return;
    }

    const rows = [
      ["Trending this week", null, "/trending/movie/week", {}],
      ["Free classics", "Public domain · stream right here", "free", {}],
      ["Popular", null, "/movie/popular", { region: state.region }],
      ["Now in theaters", null, "/movie/now_playing", { region: state.region }],
      ["Comedy", null, "/discover/movie", genreParams(35)],
      ["Romance", null, "/discover/movie", genreParams(10749)],
      ["Action", null, "/discover/movie", genreParams(28)],
      ["Horror", null, "/discover/movie", genreParams(27)],
      ["Animation", null, "/discover/movie", genreParams(16)],
      ["Sci-Fi", null, "/discover/movie", genreParams(878)],
      ["Top rated of all time", null, "/movie/top_rated", {}],
      ["Coming soon", null, "/movie/upcoming", { region: state.region }],
    ];
    const slots = rows.map(([title, sub, , params]) => addRow(title, sub, params.with_genres));

    // Free classics first so FREE badges show on other rows too.
    const free = await loadFreeClassics();
    rows.forEach(([, , path, params], i) => {
      if (path === "free") return slots[i].fill(free);
      tmdb(path, params)
        .then((r) => {
          slots[i].fill(r.results);
          if (i === 0) {
            const top = r.results.find((m) => m.backdrop_path) || r.results[0];
            if (top) renderHero(top);
          }
        })
        .catch((e) => {
          console.error(e);
          slots[i].fail();
          if (i === 0) showKeyError();
        });
    });
  }

  function showKeyError() {
    finishIntro();
    const n = $("#keyNotice");
    n.hidden = false;
    n.innerHTML = `<strong>TMDB didn't accept the key.</strong> Check the value in <code>config.js</code>.`;
  }

  function stripHtml(s) {
    const d = document.createElement("div");
    d.innerHTML = Array.isArray(s) ? s.join(" ") : (s || "");
    return d.textContent.trim();
  }

  // ---------- Search ----------

  let searchTimer;
  async function runSearch(q) {
    const box = $("#searchResults");
    showView();
    if (!q) return;
    $("#searchTitle").textContent = `Results for “${q}”`;
    const grid = $("#searchGrid");
    grid.innerHTML = skeletonCards(12);

    try {
      let items;
      if (HAS_KEY) {
        const r = await tmdb("/search/movie", { query: q, include_adult: "false" });
        items = r.results;
      } else {
        const clean = q.replace(/["\\]/g, "");
        const docs = await iaSearch(
          `title:(${clean}) AND collection:feature_films AND mediatype:movies AND (licenseurl:*publicdomain* OR year:[1800 TO ${PD_CUTOFF_YEAR}])`, 30
        );
        items = docs.map((d) => ({ title: d.title, year: d.year, thumb: iaThumb(d.identifier), freeIa: d.identifier }));
      }
      if ($("#searchInput").value.trim() !== q) return;
      grid.innerHTML = items.length ? items.map(posterCard).join("") : `<p class="muted">No movies found.</p>`;
      box.classList.remove("in");
      void box.offsetWidth; // restart the card animation for each new search
      box.classList.add("in");
    } catch (e) {
      console.error(e);
      grid.innerHTML = `<p class="muted">Search failed. Try again.</p>`;
    }
  }

  // ---------- Detail ----------

  function providerLink(p, title, fallback) {
    const make = PROVIDER_SEARCH[p.provider_id];
    return make ? make(encodeURIComponent(title)) : fallback;
  }

  function providersHtml(wp, title) {
    const r = wp?.results?.[state.region];
    if (!r) return null;
    const groups = [
      ["flatrate", "Stream"],
      ["free", "Free"],
      ["ads", "Free with ads"],
      ["rent", "Rent"],
      ["buy", "Buy"],
    ];
    const html = groups
      .filter(([k]) => r[k]?.length)
      .map(([k, label]) => `
        <div class="watch-group">
          <h4>${label}</h4>
          <div class="providers">
            ${r[k].map((p) => `
              <a class="provider" href="${esc(providerLink(p, title, r.link))}" target="_blank" rel="noopener">
                <img src="${IMG}w92${p.logo_path}" alt="">${esc(p.provider_name)}
              </a>`).join("")}
          </div>
        </div>`).join("");
    return html ? { html, link: r.link } : null;
  }

  function trailerKey(videos) {
    const list = videos?.results || [];
    const yt = list.filter((v) => v.site === "YouTube");
    return (yt.find((v) => v.type === "Trailer" && v.official) || yt.find((v) => v.type === "Trailer") || yt[0])?.key;
  }

  function freeBox(ia, autoplay) {
    return `
      <div class="free-box" id="freeBox">
        <p><strong>Free to watch.</strong> This film is in the public domain, streamed from the Internet Archive.</p>
        <button class="btn btn-free" data-play="${esc(ia)}">▶ Watch free now</button>
        <div id="playerSlot">${autoplay ? playerHtml(iaEmbed(ia)) : ""}</div>
      </div>`;
  }

  function playerHtml(src) {
    return `<div class="player"><iframe src="${esc(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }

  function openDialog(html) {
    $("#detailBody").innerHTML = html;
    const dlg = $("#detail");
    if (!dlg.open) { dlg.showModal(); syncHeroPlayback(); }
    dlg.scrollTop = 0;
  }

  async function showMovie(id, autoplay) {
    openDialog(loaderHtml("Loading movie…"));
    let m;
    try {
      m = await tmdb(`/movie/${id}`, { append_to_response: "videos,credits,watch/providers" });
      state.currentMovie = m;
    } catch (e) {
      openDialog(`<div style="padding:40px">Couldn't load this movie.</div>`);
      return;
    }
    const year = yearOf(m.release_date);
    const runtime = m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : null;
    const yt = trailerKey(m.videos);
    const cast = (m.credits?.cast || []).slice(0, 12);

    openDialog(`
      <div class="d-backdrop" style="${m.backdrop_path ? `background-image:url('${IMG}w1280${m.backdrop_path}')` : ""}"></div>
      <div class="d-main">
        <div class="d-poster">${m.poster_path ? `<img src="${IMG}w500${m.poster_path}" alt="${esc(m.title)} poster">` : ""}</div>
        <div class="d-info">
          <h2 id="detailTitle">${esc(m.title)}</h2>
          ${m.tagline ? `<p class="d-tagline">${esc(m.tagline)}</p>` : ""}
          <div class="d-facts">
            ${year ? `<span>${year}</span>` : ""}
            ${runtime ? `<span>${runtime}</span>` : ""}
            ${m.vote_average ? `<span>★ ${m.vote_average.toFixed(1)} / 10</span>` : ""}
          </div>
          <div class="chips">${(m.genres || []).map((g) => `<span class="chip">${esc(g.name)}</span>`).join("")}</div>
          <p class="d-overview">${esc(m.overview || "No overview available.")}</p>
          <div id="socialActions"></div>

          <div id="freeSlot"></div>

          <div class="where-head">
            <h3 class="section-title">Where to watch</h3>
            <div id="watchRegion"></div>
          </div>
          <div id="whereList">${whereHtml(m)}</div>

          ${yt ? `
            <h3 class="section-title">Trailer</h3>
            <button class="btn btn-ghost" data-trailer="${esc(yt)}">▶ Play trailer</button>
            <div id="trailerSlot"></div>` : ""}

          ${cast.length ? `
            <h3 class="section-title">Cast</h3>
            <div class="cast">${cast.map((c) => `
              <div class="cast-item">
                ${c.profile_path ? `<img loading="lazy" src="${IMG}w185${c.profile_path}" alt="">` : '<div class="ph"></div>'}
                <b>${esc(c.name)}</b><span>${esc(c.character)}</span>
              </div>`).join("")}</div>` : ""}
          <div id="commentsSlot"></div>
        </div>
      </div>`);

    window.CountryPicker($("#watchRegion"), {
      label: "Streaming country",
      title: "Where are you watching?",
      codes: watchRegions.includes(state.region) ? watchRegions : [state.region, ...watchRegions],
      value: state.region,
      popular: POPULAR_COUNTRIES,
      nameOf: regionName,
      align: "right",
      onChange(code) {
        state.region = code;
        try { localStorage.setItem("cinescout.region", code); } catch {}
        $("#whereList").innerHTML = whereHtml(m);
      },
    });

    window.Social?.mount($("#socialActions"), $("#commentsSlot"), {
      key: `tmdb:${m.id}`,
      title: m.title,
      poster: m.poster_path ? `${IMG}w342${m.poster_path}` : null,
      href: `#movie/${m.id}`,
    });

    const ia = await findFreeCopy(m);
    if (ia && location.hash.startsWith(`#movie/${id}`)) $("#freeSlot").innerHTML = freeBox(ia, autoplay);
  }

  async function showFree(ia, autoplay) {
    const c = FREE_CLASSICS.find((x) => x.ia === ia);
    openDialog(loaderHtml("Loading film…"));
    const meta = await getJSON(`${IA}/metadata/${encodeURIComponent(ia)}`).catch(() => null);
    const md = meta?.metadata || {};
    const title = c?.title || stripHtml(md.title) || ia;
    const year = c?.year || md.year || yearOf(md.date) || "";
    openDialog(`
      <div class="d-main" style="margin-top:0;padding-top:32px">
        <div class="d-poster"><img src="${esc(iaThumb(ia))}" alt=""></div>
        <div class="d-info">
          <h2 id="detailTitle" style="margin-top:8px">${esc(title)}</h2>
          <div class="d-facts">${year ? `<span>${esc(year)}</span>` : ""}<span>Internet Archive</span></div>
          <p class="d-overview">${esc(c?.blurb || stripHtml(md.description).slice(0, 500) || "A public-domain film.")}</p>
          <div id="socialActions"></div>
          ${freeBox(ia, autoplay)}
          <p class="muted" style="font-size:13px"><a href="${IA}/details/${encodeURIComponent(ia)}" target="_blank" rel="noopener">View on archive.org</a></p>
          <div id="commentsSlot"></div>
        </div>
      </div>`);

    window.Social?.mount($("#socialActions"), $("#commentsSlot"), {
      key: `ia:${ia}`,
      title,
      poster: iaThumb(ia),
      href: `#free/${encodeURIComponent(ia)}`,
    });
  }

  // ---------- Regions ----------

  function regionName(code) {
    try { return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }).of(code); }
    catch { return code; }
  }

  // Countries TMDB has streaming data for. Used by the "Where to watch" picker on each movie.
  let watchRegions = FALLBACK_REGIONS;

  async function loadRegions() {
    if (!HAS_KEY) return;
    try {
      const r = await tmdb("/watch/providers/regions");
      watchRegions = r.results.map((x) => x.iso_3166_1);
    } catch {}
  }

  // Shown at the top of both country pickers.
  const POPULAR_COUNTRIES = ["US", "GB", "KR", "JP", "PH", "IN", "FR", "ES", "IT", "DE", "CN", "HK", "MX", "BR", "CA", "AU"];

  function whereHtml(m) {
    const where = providersHtml(m["watch/providers"], m.title);
    return where
      ? `${where.html}<p class="muted" style="font-size:13px">Buttons open a search for this title on each service. <a href="${esc(where.link)}" target="_blank" rel="noopener">All options on TMDB</a> · data by JustWatch.</p>`
      : `<p class="muted">Not available to stream in ${esc(regionName(state.region))} right now. Try another country.</p>`;
  }


  // ---------- Browse filters ----------

  const SORT_LABELS = { popular: "Most popular", top: "Top rated", new: "Newest" };
  const SORTS = {
    popular: { sort_by: "popularity.desc", min: 50, minCountry: 5 },
    top: { sort_by: "vote_average.desc", min: 300, minCountry: 30 },
    new: { sort_by: "primary_release_date.desc", min: 20, minCountry: 1 },
  };
  // Most-wanted genres first; any others TMDB adds go at the end.
  const GENRE_ORDER = [28, 35, 10749, 18, 27, 53, 16, 878, 12, 14, 80, 9648, 10751, 99, 36, 10752, 10402, 37, 10770];
  const filter = { genre: "", country: "", sort: "popular", page: 1 };
  const genreNames = new Map();
  let filtersReady = false;
  let browseToken = 0;
  let countryPicker = null;

  function genreParams(id) {
    return { with_genres: id, sort_by: "popularity.desc", "vote_count.gte": 100, include_adult: "false" };
  }

  const isFiltering = () => Boolean(filter.genre || filter.country || filter.sort !== "popular");

  async function initFilters() {
    if (!HAS_KEY) return;
    try {
      const [g, countries] = await Promise.all([tmdb("/genre/movie/list"), tmdb("/configuration/countries")]);
      for (const x of g.genres) genreNames.set(x.id, x.name);
      const ids = [
        ...GENRE_ORDER.filter((id) => genreNames.has(id)),
        ...g.genres.map((x) => x.id).filter((id) => !GENRE_ORDER.includes(id)),
      ];
      $("#genreChips").innerHTML = [
        `<button class="gchip" data-genre="" aria-pressed="true">All</button>`,
        ...ids.map((id) => `<button class="gchip" data-genre="${id}" aria-pressed="false">${esc(genreNames.get(id))}</button>`),
      ].join("");

      const names = new Map(countries.map((c) => {
        const n = regionName(c.iso_3166_1);
        return [c.iso_3166_1, n && n !== c.iso_3166_1 ? n : c.english_name];
      }));
      countryPicker = window.CountryPicker($("#countryPicker"), {
        label: "Country",
        title: "Movies from",
        allLabel: "All countries",
        codes: [...names.keys()],
        value: filter.country,
        popular: POPULAR_COUNTRIES,
        nameOf: (code) => names.get(code) || regionName(code),
        onChange(code) { filter.country = code; applyFilters(); },
      });

      filtersReady = true;
      showView();
    } catch (e) {
      console.error(e);
    }
  }

  function syncFilterUI() {
    document.querySelectorAll(".gchip").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.genre === String(filter.genre)));
    });
    countryPicker?.set(filter.country);
    const seg = $("#sortSeg");
    seg.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.sort === filter.sort)));
    moveSortThumb();
  }

  // Slides the highlight behind the selected sort option.
  function moveSortThumb() {
    const seg = $("#sortSeg");
    const on = seg.querySelector('[aria-checked="true"]');
    if (!on || !on.offsetWidth) return;
    seg.style.setProperty("--thumb-x", `${on.offsetLeft}px`);
    seg.style.setProperty("--thumb-w", `${on.offsetWidth}px`);
    seg.classList.add("ready");
  }
  window.addEventListener("resize", moveSortThumb);

  function browseTitle() {
    const genre = filter.genre ? genreNames.get(Number(filter.genre)) || "Movies" : "All movies";
    const from = filter.country ? ` from ${regionName(filter.country)}` : "";
    return `${genre}${from} · ${SORT_LABELS[filter.sort]}`;
  }

  async function applyFilters({ more = false } = {}) {
    syncFilterUI();
    showView();
    if (!isFiltering()) return;

    const grid = $("#browseGrid");
    const btn = $("#loadMore");
    const token = ++browseToken;
    filter.page = more ? filter.page + 1 : 1;
    if (!more) {
      $("#browseTitle").textContent = browseTitle();
      grid.innerHTML = skeletonCards(12);
      btn.hidden = true;
    }
    btn.disabled = true;

    const sort = SORTS[filter.sort];
    const params = {
      sort_by: sort.sort_by,
      "vote_count.gte": filter.country ? sort.minCountry : sort.min,
      include_adult: "false",
      page: filter.page,
    };
    if (filter.genre) params.with_genres = filter.genre;
    if (filter.country) params.with_origin_country = filter.country;
    if (filter.sort === "new") params["primary_release_date.lte"] = new Date().toISOString().slice(0, 10);

    try {
      const r = await tmdb("/discover/movie", params);
      if (token !== browseToken) return;
      const html = r.results.map(posterCard).join("");
      if (more) grid.insertAdjacentHTML("beforeend", html);
      else {
        grid.innerHTML = html || `<p class="muted">No movies match these filters. Try another genre or country.</p>`;
        const box = $("#browse");
        box.classList.remove("in");
        void box.offsetWidth;
        box.classList.add("in");
      }
      btn.hidden = filter.page >= Math.min(r.total_pages, 500);
    } catch (e) {
      console.error(e);
      if (!more && token === browseToken) grid.innerHTML = `<p class="muted">Couldn't load movies. Try again.</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  function resetFilters() {
    Object.assign(filter, { genre: "", country: "", sort: "popular", page: 1 });
    applyFilters();
  }

  // Decides which sections are visible: search results, filtered browse, or the home rows.
  function showView() {
    const searching = Boolean($("#searchInput").value.trim());
    const browsing = !searching && isFiltering();
    $("#searchResults").hidden = !searching;
    $("#hero").hidden = searching || !$("#hero").childElementCount;
    $("#filters").hidden = searching || !filtersReady;
    if (!$("#filters").hidden) requestAnimationFrame(moveSortThumb);
    $("#browse").hidden = !browsing;
    $("#rows").hidden = searching || browsing;
  }

  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-genre]");
    if (!g) return;
    const fromRow = !g.classList.contains("gchip");
    filter.genre = g.dataset.genre;
    applyFilters();
    if (fromRow) $("#filters").scrollIntoView({ behavior: "smooth", block: "start" });
    else g.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  $("#sortSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b || b.dataset.sort === filter.sort) return;
    filter.sort = b.dataset.sort;
    applyFilters();
  });
  $("#sortSeg").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const keys = Object.keys(SORT_LABELS);
    const i = (keys.indexOf(filter.sort) + (e.key === "ArrowRight" ? 1 : keys.length - 1)) % keys.length;
    filter.sort = keys[i];
    applyFilters();
    $(`#sortSeg [data-sort="${filter.sort}"]`).focus();
  });
  $("#resetFilters").addEventListener("click", resetFilters);
  $("#loadMore").addEventListener("click", () => applyFilters({ more: true }));

  // ---------- Routing ----------

  function route() {
    const [path, query] = location.hash.slice(1).split("?");
    const [kind, id] = path.split("/");
    const autoplay = query === "play";
    if (kind === "movie" && id && HAS_KEY) return showMovie(Number(id), autoplay);
    if (kind === "free" && id) return showFree(decodeURIComponent(id), autoplay);
    const dlg = $("#detail");
    if (dlg.open) { dlg.close(); syncHeroPlayback(); }
  }

  function closeDetail() {
    if (location.hash) history.pushState("", document.title, location.pathname + location.search);
    route();
  }

  // ---------- Events ----------

  document.addEventListener("click", (e) => {
    const play = e.target.closest("[data-play]");
    if (play) {
      $("#playerSlot").innerHTML = playerHtml(iaEmbed(play.dataset.play));
      return;
    }
    const tr = e.target.closest("[data-trailer]");
    if (tr) {
      $("#trailerSlot").innerHTML = playerHtml(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(tr.dataset.trailer)}?autoplay=1&rel=0`);
      tr.remove();
    }
  });

  $("#closeDetail").addEventListener("click", closeDetail);
  $("#detail").addEventListener("cancel", (e) => { e.preventDefault(); closeDetail(); });
  $("#detail").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDetail(); });
  window.addEventListener("hashchange", route);

  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); runSearch($("#searchInput").value.trim()); });
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value.trim()), 350);
  });
  $("#clearSearch").addEventListener("click", () => { $("#searchInput").value = ""; runSearch(""); });
  $("#homeLink").addEventListener("click", (e) => {
    e.preventDefault();
    $("#searchInput").value = "";
    Object.assign(filter, { genre: "", country: "", sort: "popular", page: 1 });
    syncFilterUI();
    runSearch("");
    closeDetail();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  loadRegions();
  initFilters();
  loadHome().then(() => {
    route();
    // Supports links like /?q=batman (also used by Google's site search box).
    const q = new URLSearchParams(location.search).get("q");
    if (q) {
      $("#searchInput").value = q;
      runSearch(q.trim());
    }
  });
})();
