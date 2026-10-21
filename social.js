// Accounts, My List, ratings and comments, backed by Supabase.
// Everything here stays hidden until SUPABASE_URL and SUPABASE_ANON_KEY are set in config.js.
(() => {
  "use strict";

  const CONFIG = window.CONFIG || {};
  const URL_ = (CONFIG.SUPABASE_URL || "").trim();
  const KEY = (CONFIG.SUPABASE_ANON_KEY || "").trim();
  const enabled = Boolean(URL_ && KEY && window.supabase);

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  if (!enabled) {
    window.Social = { enabled: false, mount() {}, mountHomeRow() {} };
    return;
  }

  const db = window.supabase.createClient(URL_, KEY);
  const state = {
    user: null,
    name: "",
    favorites: new Map(), // movie_key -> row
    current: null,        // { meta, actionsEl, commentsEl } for the open movie
    homeRow: null,
  };

  // ---------- Auth ----------

  async function loadProfile() {
    if (!state.user) { state.name = ""; return; }
    const { data } = await db.from("profiles").select("display_name").eq("id", state.user.id).maybeSingle();
    state.name = data?.display_name || state.user.user_metadata?.display_name || state.user.email.split("@")[0];
  }

  async function loadFavorites() {
    state.favorites.clear();
    if (!state.user) return;
    const { data } = await db.from("favorites").select("*").order("created_at", { ascending: false });
    for (const row of data || []) state.favorites.set(row.movie_key, row);
  }

  async function onAuthChange(user) {
    const changed = (user?.id || null) !== (state.user?.id || null);
    state.user = user;
    if (!changed && state.name) return;
    await Promise.all([loadProfile(), loadFavorites()]);
    renderAuthArea();
    renderHomeRow();
    if (state.current) refreshCurrent();
  }

  db.auth.onAuthStateChange((event, session) => {
    // Defer: Supabase recommends not awaiting other calls inside this callback.
    setTimeout(() => {
      onAuthChange(session?.user || null);
      if (event === "PASSWORD_RECOVERY") openAuth("reset");
    }, 0);
  });

  function renderAuthArea() {
    const area = $("#authArea");
    if (!area) return;
    if (!state.user) {
      area.innerHTML = `<button class="btn btn-ghost btn-sm" data-auth="signin">Sign in</button>`;
      return;
    }
    const initial = (state.name || "?").trim().charAt(0).toUpperCase();
    area.innerHTML = `
      <div class="user-menu">
        <button class="avatar" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu">${esc(initial)}</button>
        <div class="menu" role="menu" hidden>
          <div class="menu-head">Signed in as<br><b>${esc(state.name)}</b></div>
          <button role="menuitem" data-menu="list">My List (${state.favorites.size})</button>
          <button role="menuitem" data-menu="settings">Account settings</button>
          <button role="menuitem" data-menu="signout">Sign out</button>
        </div>
      </div>`;
  }

  const authDialog = () => $("#authDialog");

  function openAuth(mode = "signin", note = "") {
    const views = {
      signin: `
        <h2>Welcome back</h2>
        ${note ? `<p class="muted">${esc(note)}</p>` : ""}
        <form data-form="signin">
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required minlength="6"></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-block">Sign in</button>
        </form>
        <p class="auth-links"><button class="link-btn" data-auth="forgot">Forgot password?</button></p>
        <p class="auth-links">New to CineScout? <button class="link-btn" data-auth="signup">Create an account</button></p>`,
      signup: `
        <h2>Create your account</h2>
        <p class="muted">${esc(note || "Save movies to My List, rate them and join the conversation.")}</p>
        <form data-form="signup">
          <label>Display name<input name="name" autocomplete="nickname" required maxlength="40"></label>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="new-password" required minlength="6"></label>
          <label class="check"><input type="checkbox" name="agree" required>
            <span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of Use</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-block">Create account</button>
        </form>
        <p class="auth-links">Already have an account? <button class="link-btn" data-auth="signin">Sign in</button></p>`,
      forgot: `
        <h2>Reset your password</h2>
        <p class="muted">We'll email you a link to set a new one.</p>
        <form data-form="forgot">
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-block">Send reset link</button>
        </form>
        <p class="auth-links"><button class="link-btn" data-auth="signin">Back to sign in</button></p>`,
      settings: `
        <h2>Account settings</h2>
        <p class="muted small">Signed in as ${esc(state.user?.email || "")}</p>
        <form data-form="profile" class="settings-block">
          <h3>Display name</h3>
          <label><span class="sr-only">Display name</span><input name="name" autocomplete="nickname" required maxlength="40" value="${esc(state.name)}"></label>
          <p class="muted small">Shown on your comments, including older ones.</p>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-sm">Save name</button>
        </form>
        <form data-form="password" class="settings-block">
          <h3>Change password</h3>
          <label>Current password<input name="current" type="password" autocomplete="current-password" required></label>
          <label>New password<input name="password" type="password" autocomplete="new-password" required minlength="6"></label>
          <label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" required minlength="6"></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-sm">Update password</button>
        </form>
        <form data-form="delete" class="settings-block danger-zone">
          <h3>Delete account</h3>
          <p class="muted small">This permanently deletes your account, My List, ratings and comments. It can't be undone.</p>
          <label>Type DELETE to confirm<input name="confirmText" autocomplete="off" required pattern="DELETE"></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-danger btn-sm">Delete my account</button>
        </form>`,
      reset: `
        <h2>Choose a new password</h2>
        <form data-form="reset">
          <label>New password<input name="password" type="password" autocomplete="new-password" required minlength="6"></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-block">Save password</button>
        </form>`,
    };
    $("#authBody").innerHTML = views[mode];
    const dlg = authDialog();
    if (!dlg.open) dlg.showModal();
    if (mode !== "settings") $("#authBody input")?.focus();
  }

  async function submitAuth(form) {
    const kind = form.dataset.form;
    const f = Object.fromEntries(new FormData(form));
    const msg = $(".form-msg", form);
    const btn = $("button.btn", form);
    msg.textContent = "";
    msg.className = "form-msg";
    btn.disabled = true;
    try {
      if (kind === "signin") {
        const { error } = await db.auth.signInWithPassword({ email: f.email, password: f.password });
        if (error) throw error;
        authDialog().close();
      } else if (kind === "signup") {
        const { data, error } = await db.auth.signUp({
          email: f.email,
          password: f.password,
          options: { data: { display_name: f.name.trim() }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (data.session) authDialog().close();
        else {
          msg.className = "form-msg ok";
          msg.textContent = "Almost done! Check your email and click the confirmation link.";
        }
      } else if (kind === "forgot") {
        const { error } = await db.auth.resetPasswordForEmail(f.email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        msg.className = "form-msg ok";
        msg.textContent = "If that email has an account, a reset link is on its way.";
      } else if (kind === "profile") {
        const name = f.name.trim();
        if (!name) throw new Error("Please enter a display name.");
        const { error } = await db.from("profiles").update({ display_name: name }).eq("id", state.user.id);
        if (error) throw error;
        await db.auth.updateUser({ data: { display_name: name } });
        state.name = name;
        renderAuthArea();
        if (state.current) refreshCurrent();
        msg.className = "form-msg ok";
        msg.textContent = "Display name saved.";
      } else if (kind === "password") {
        if (f.password !== f.confirm) throw new Error("The new passwords don't match.");
        await reauthenticate(f.current);
        const { error } = await db.auth.updateUser({ password: f.password });
        if (error) throw error;
        form.reset();
        msg.className = "form-msg ok";
        msg.textContent = "Password updated.";
      } else if (kind === "delete") {
        if (f.confirmText !== "DELETE") throw new Error("Type DELETE in capital letters to confirm.");
        await reauthenticate(f.password);
        const { error } = await db.rpc("delete_my_account");
        if (error) throw error;
        await db.auth.signOut({ scope: "local" });
        authDialog().close();
        alert("Your account and its data have been deleted.");
      } else if (kind === "reset") {
        const { error } = await db.auth.updateUser({ password: f.password });
        if (error) throw error;
        authDialog().close();
      }
    } catch (err) {
      msg.textContent = friendlyError(err);
    } finally {
      btn.disabled = false;
    }
  }

  // Sensitive changes ask for the current password first.
  async function reauthenticate(password) {
    const { error } = await db.auth.signInWithPassword({ email: state.user.email, password });
    if (error) throw new Error("Your current password is incorrect.");
  }

  function friendlyError(err) {
    const m = err?.message || String(err);
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox.";
    if (/already registered/i.test(m)) return "That email already has an account. Try signing in.";
    if (/should be different/i.test(m)) return "Your new password must be different from the current one.";
    return m;
  }

  // ---------- Movie page: My List + rating ----------

  function mount(actionsEl, commentsEl, meta) {
    state.current = { actionsEl, commentsEl, meta };
    refreshCurrent();
  }

  function refreshCurrent() {
    const c = state.current;
    if (!c || !c.actionsEl.isConnected) { state.current = null; return; }
    renderActions(c);
    renderComments(c);
  }

  async function renderActions({ actionsEl, meta }) {
    const saved = state.favorites.has(meta.key);
    actionsEl.innerHTML = `
      <div class="social-actions">
        <button class="btn ${saved ? "btn-saved" : "btn-ghost"}" data-fav aria-pressed="${saved}">
          ${saved ? "♥ In My List" : "♡ Add to My List"}
        </button>
        <div class="stars" role="group" aria-label="Your rating">
          ${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-star="${n}" aria-label="Rate ${n} of 5">★</button>`).join("")}
        </div>
        <span class="community muted"></span>
      </div>`;

    const [stats, mine] = await Promise.all([
      db.from("rating_stats").select("average,total").eq("movie_key", meta.key).maybeSingle(),
      state.user
        ? db.from("ratings").select("score").eq("movie_key", meta.key).eq("user_id", state.user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!actionsEl.isConnected) return;
    paintStars(actionsEl, mine.data?.score || 0);
    const s = stats.data;
    $(".community", actionsEl).textContent = s?.total
      ? `★ ${s.average} from ${s.total} CineScout ${s.total === 1 ? "rating" : "ratings"}`
      : "No CineScout ratings yet";
  }

  function paintStars(root, score) {
    root.querySelectorAll(".star").forEach((b) => {
      const on = Number(b.dataset.star) <= score;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(Number(b.dataset.star) === score));
    });
    root.querySelector(".stars").dataset.score = score;
  }

  async function toggleFavorite() {
    const { meta } = state.current;
    if (!state.user) return openAuth("signin", "Sign in to save movies to My List.");
    if (state.favorites.has(meta.key)) {
      await db.from("favorites").delete().eq("user_id", state.user.id).eq("movie_key", meta.key);
      state.favorites.delete(meta.key);
    } else {
      const row = { user_id: state.user.id, movie_key: meta.key, title: meta.title, poster: meta.poster || null, href: meta.href };
      const { error } = await db.from("favorites").upsert(row, { onConflict: "user_id,movie_key", ignoreDuplicates: true });
      if (!error) state.favorites = new Map([[meta.key, row], ...state.favorites]);
    }
    renderActions(state.current);
    renderHomeRow();
    renderAuthArea();
  }

  async function rate(score) {
    const c = state.current;
    if (!state.user) return openAuth("signin", "Sign in to rate movies.");
    const current = Number($(".stars", c.actionsEl).dataset.score || 0);
    if (current === score) {
      await db.from("ratings").delete().eq("user_id", state.user.id).eq("movie_key", c.meta.key);
    } else {
      paintStars(c.actionsEl, score);
      await db.from("ratings").upsert(
        { user_id: state.user.id, movie_key: c.meta.key, score, updated_at: new Date().toISOString() },
        { onConflict: "user_id,movie_key" }
      );
    }
    renderActions(c);
  }

  // ---------- Movie page: comments ----------

  const timeAgo = (iso) => {
    const secs = (new Date(iso) - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
    let v = secs;
    for (const [size, unit] of steps) {
      if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
      v /= size;
    }
  };

  async function renderComments({ commentsEl, meta }) {
    const guestName = store.get("cinescout.guestName") || "";
    commentsEl.innerHTML = `
      <h3 class="section-title">Comments</h3>
      <form class="comment-form" data-form="comment">
        ${state.user
          ? `<p class="muted small">Commenting as <b>${esc(state.name)}</b></p>`
          : `<div class="guest-row">
               <input name="name" placeholder="Your name" maxlength="40" required value="${esc(guestName)}" aria-label="Your name">
               <span class="muted small">Posting as a guest · <button type="button" class="link-btn" data-auth="signin">Sign in</button></span>
             </div>`}
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <textarea name="body" rows="3" maxlength="1000" required placeholder="What did you think?" aria-label="Comment"></textarea>
        <div class="comment-foot">
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-primary btn-sm">Post comment</button>
        </div>
      </form>
      <ul class="comments"><li>${window.CineLoader ? window.CineLoader("Loading comments…", true) : "Loading comments…"}</li></ul>`;
    loadComments(commentsEl, meta);
  }

  async function loadComments(commentsEl, meta) {
    const { data, error } = await db.from("comments")
      .select("id,author_name,is_guest,body,created_at,user_id")
      .eq("movie_key", meta.key)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = $(".comments", commentsEl);
    if (!list) return;
    if (error) { list.innerHTML = `<li class="muted">Couldn't load comments.</li>`; return; }
    list.innerHTML = data.length
      ? data.map((c) => `
          <li class="comment">
            <div class="comment-head">
              <b>${esc(c.author_name)}</b>
              ${c.is_guest ? '<span class="tag">Guest</span>' : ""}
              <span class="muted small">${esc(timeAgo(c.created_at))}</span>
              ${state.user && c.user_id === state.user.id
                ? `<button class="link-btn small" data-del-comment="${c.id}">Delete</button>`
                : `<button class="link-btn small muted-link" data-report-comment="${c.id}">Report</button>`}
            </div>
            <p>${esc(c.body)}</p>
          </li>`).join("")
      : `<li class="muted">No comments yet. Be the first!</li>`;
  }

  async function submitComment(form) {
    const { meta, commentsEl } = state.current;
    const f = Object.fromEntries(new FormData(form));
    const msg = $(".form-msg", form);
    const btn = $("button.btn", form);
    msg.textContent = "";
    if (f.website) return; // bots fill the hidden field
    const body = (f.body || "").trim();
    if (!body) return;
    const row = { movie_key: meta.key, body };
    if (state.user) {
      row.user_id = state.user.id;
      row.author_name = state.name;
    } else {
      row.author_name = (f.name || "").trim();
      row.is_guest = true;
      if (!row.author_name) { msg.textContent = "Please add your name."; return; }
      store.set("cinescout.guestName", row.author_name);
    }
    btn.disabled = true;
    const { error } = await db.from("comments").insert(row);
    btn.disabled = false;
    if (error) { msg.textContent = error.message || "Couldn't post your comment."; return; }
    form.body.value = "";
    loadComments(commentsEl, meta);
  }

  async function reportComment(id, btn) {
    const reason = prompt("Why are you reporting this comment? (spam, abuse, copyright, other)");
    if (reason === null) return;
    const { error } = await db.from("comment_reports").insert({ comment_id: id, reason: reason.trim().slice(0, 300) || "No reason given" });
    if (error) { alert("Couldn't send the report. Please try again."); return; }
    btn.textContent = "Reported";
    btn.disabled = true;
  }

  async function deleteComment(id) {
    if (!confirm("Delete this comment?")) return;
    await db.from("comments").delete().eq("id", id);
    loadComments(state.current.commentsEl, state.current.meta);
  }

  // ---------- Home: My List row ----------

  function mountHomeRow(rowsEl) {
    const sec = document.createElement("section");
    sec.className = "row";
    sec.id = "myList";
    sec.hidden = true;
    rowsEl.prepend(sec);
    window.CineReveal?.(sec);
    state.homeRow = sec;
    renderHomeRow();
  }

  function renderHomeRow() {
    const sec = state.homeRow;
    if (!sec) return;
    const items = [...state.favorites.values()];
    sec.hidden = !state.user || !items.length;
    if (sec.hidden) return;
    sec.innerHTML = `
      <div class="row-head"><h2>My List</h2><small>${items.length} saved</small></div>
      <div class="track">${items.map((m, i) => `
        <a class="card" href="${esc(m.href)}" style="--i:${Math.min(i, 12)}" aria-label="${esc(m.title)}">
          <div class="poster">
            ${m.poster ? `<img loading="lazy" src="${esc(m.poster)}" alt="" onerror="this.remove()">` : ""}
            <div class="ph" ${m.poster ? 'style="z-index:-1"' : ""}>${esc(m.title)}</div>
          </div>
          <div class="card-title">${esc(m.title)}</div>
        </a>`).join("")}</div>`;
  }

  // ---------- Events ----------

  document.addEventListener("click", (e) => {
    const t = e.target;
    const authBtn = t.closest("[data-auth]");
    if (authBtn) { e.preventDefault(); openAuth(authBtn.dataset.auth); return; }
    if (t.closest("[data-close-auth]")) { authDialog().close(); return; }
    if (t.closest("[data-fav]")) { toggleFavorite(); return; }
    const star = t.closest("[data-star]");
    if (star) { rate(Number(star.dataset.star)); return; }
    const del = t.closest("[data-del-comment]");
    if (del) { deleteComment(Number(del.dataset.delComment)); return; }
    const report = t.closest("[data-report-comment]");
    if (report) { reportComment(Number(report.dataset.reportComment), report); return; }

    const avatar = t.closest(".avatar");
    const menu = $(".user-menu .menu");
    if (avatar && menu) {
      menu.hidden = !menu.hidden;
      avatar.setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    const item = t.closest("[data-menu]");
    if (item?.dataset.menu === "signout") db.auth.signOut();
    if (item?.dataset.menu === "settings") openAuth("settings");
    if (item?.dataset.menu === "list") {
      const row = $("#myList");
      if (row && !row.hidden) row.scrollIntoView({ behavior: "smooth", block: "center" });
      else alert("Your list is empty. Open a movie and tap “Add to My List”.");
    }
    if (menu && !menu.hidden && !t.closest(".menu")) menu.hidden = true;
    else if (item && menu) menu.hidden = true;
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === "comment") submitComment(form);
    else submitAuth(form);
  });

  document.addEventListener("click", (e) => {
    if (e.target === authDialog()) authDialog().close();
  });

  db.auth.getSession().then(({ data }) => onAuthChange(data.session?.user || null));
  renderAuthArea();

  window.Social = { enabled: true, mount, mountHomeRow };
})();
