// Country picker: a searchable dropdown with flags, a "Popular" group and keyboard support.
// On narrow screens the panel opens as a bottom sheet.
(() => {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const ICONS = {
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    chevron: '<svg class="picker-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg class="picker-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  };

  const flag = (code) => code
    ? `<img class="flag" src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'flag flag-code',textContent:'${code}'}))">`
    : `<span class="flag flag-globe">${ICONS.globe}</span>`;

  let uid = 0;

  function CountryPicker(root, opts) {
    const id = `picker${++uid}`;
    const state = {
      codes: opts.codes || [],
      value: opts.value || "",
      open: false,
      active: -1,
      items: [],
    };
    const nameOf = (code) => (code ? opts.nameOf(code) : opts.allLabel);

    root.classList.add("picker");
    if (opts.align === "right") root.classList.add("align-right");
    root.innerHTML = `
      <button type="button" class="picker-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-panel">
        <span class="picker-current"></span>${ICONS.chevron}
      </button>
      <div class="picker-backdrop" hidden></div>
      <div class="picker-panel" id="${id}-panel" hidden>
        <div class="picker-sheet-head">${esc(opts.title || "Choose a country")}</div>
        <label class="picker-search">${ICONS.search}
          <input type="search" placeholder="Search countries" autocomplete="off" spellcheck="false"
            role="combobox" aria-expanded="true" aria-controls="${id}-list" aria-label="Search countries">
        </label>
        <ul class="picker-list" id="${id}-list" role="listbox" aria-label="${esc(opts.title || "Countries")}"></ul>
      </div>`;

    const btn = root.querySelector(".picker-btn");
    const panel = root.querySelector(".picker-panel");
    const backdrop = root.querySelector(".picker-backdrop");
    const input = root.querySelector("input");
    const list = root.querySelector(".picker-list");

    function paintButton() {
      root.querySelector(".picker-current").innerHTML =
        `${flag(state.value)}<span class="picker-label">${esc(nameOf(state.value))}</span>`;
      btn.setAttribute("aria-label", `${opts.label}: ${nameOf(state.value)}`);
    }

    function option(code, i) {
      const selected = code === state.value;
      return `<li role="option" id="${id}-o${i}" data-code="${code}" aria-selected="${selected}" class="${selected ? "is-selected" : ""}">
        ${flag(code)}<span class="opt-name">${esc(nameOf(code))}</span>${ICONS.check}</li>`;
    }

    function renderList() {
      const q = fold(input.value.trim());
      let html = "";
      state.items = [];
      const push = (code) => { html += option(code, state.items.length); state.items.push(code); };

      if (q) {
        state.codes
          .filter((c) => fold(nameOf(c)).includes(q) || c.toLowerCase() === q)
          .sort((a, b) => fold(nameOf(a)).indexOf(q) - fold(nameOf(b)).indexOf(q) || nameOf(a).localeCompare(nameOf(b)))
          .forEach(push);
        if (!state.items.length) html = `<li class="picker-empty">No countries match “${esc(input.value.trim())}”</li>`;
      } else {
        if (opts.allLabel) push("");
        const popular = (opts.popular || []).filter((c) => state.codes.includes(c));
        if (popular.length) {
          html += `<li class="picker-group" role="presentation">Popular</li>`;
          popular.forEach(push);
        }
        html += `<li class="picker-group" role="presentation">All countries A–Z</li>`;
        [...state.codes].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).forEach(push);
      }
      list.innerHTML = html;
      setActive(q ? 0 : Math.max(0, state.items.indexOf(state.value)), !q);
    }

    function setActive(i, center = false) {
      list.querySelector(".is-active")?.classList.remove("is-active");
      state.active = Math.max(0, Math.min(i, state.items.length - 1));
      const el = list.querySelector(`#${id}-o${state.active}`);
      if (!el) { input.removeAttribute("aria-activedescendant"); return; }
      el.classList.add("is-active");
      input.setAttribute("aria-activedescendant", el.id);
      el.scrollIntoView({ block: center ? "center" : "nearest" });
    }

    function open() {
      if (state.open) return;
      state.open = true;
      document.dispatchEvent(new CustomEvent("picker:open", { detail: root }));
      panel.hidden = false;
      backdrop.hidden = false;
      root.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      input.value = "";
      renderList();
      // Avoid popping the keyboard over the sheet on phones; focus the search on desktop.
      if (!matchMedia("(max-width: 720px)").matches) input.focus({ preventScroll: true });
    }

    function close(refocus = false) {
      if (!state.open) return;
      state.open = false;
      panel.hidden = true;
      backdrop.hidden = true;
      root.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      if (refocus) btn.focus();
    }

    function choose(code) {
      close(true);
      if (code === state.value) return;
      state.value = code;
      paintButton();
      opts.onChange(code);
    }

    btn.addEventListener("click", () => (state.open ? close() : open()));
    backdrop.addEventListener("click", () => close());
    input.addEventListener("input", renderList);
    list.addEventListener("click", (e) => {
      const li = e.target.closest("[data-code]");
      if (li) choose(li.dataset.code);
    });
    list.addEventListener("mousemove", (e) => {
      const li = e.target.closest("[data-code]");
      if (li) {
        const i = Number(li.id.split("-o")[1]);
        if (i !== state.active) setActive(i);
      }
    });
    root.addEventListener("keydown", (e) => {
      if (!state.open) {
        if (e.target === btn && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); open(); }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive(state.active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(state.active - 1); }
      else if (e.key === "Home" && e.target !== input) { e.preventDefault(); setActive(0); }
      else if (e.key === "End" && e.target !== input) { e.preventDefault(); setActive(state.items.length - 1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const code = state.items[state.active];
        if (code !== undefined) choose(code);
      } else if (e.key === "Tab") close();
    });
    document.addEventListener("pointerdown", (e) => {
      if (state.open && !root.contains(e.target)) close();
    });
    document.addEventListener("picker:open", (e) => { if (e.detail !== root) close(); });

    paintButton();

    return {
      set(value) { state.value = value || ""; paintButton(); if (state.open) renderList(); },
      setCodes(codes) { state.codes = codes; if (state.open) renderList(); },
      close,
    };
  }

  window.CountryPicker = CountryPicker;
})();
