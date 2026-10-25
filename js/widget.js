/*
 * Chat widget UI + page i18n. Renders messages from bot-engine.js.
 * All user-provided text is inserted with textContent / escaped (no HTML injection).
 */
(function () {
  var SC = (window.SunnyCrumb = window.SunnyCrumb || {});
  var cfg = window.BAKERY_BOT_CONFIG;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // tiny, safe markdown: **bold**, *italic*, newlines
  function md(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/\n/g, "<br>");
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  var botEngine, lang;
  var log, chipsBox, input, panel, launcher, form, busy = false;

  // ---------- page i18n ----------
  function applyPageLang() {
    var t = SC.T[lang];
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (n) {
      var k = n.getAttribute("data-i18n");
      if (t[k] !== undefined) n.textContent = t[k];
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (n) {
      n.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (t[p[1]] !== undefined) n.setAttribute(p[0], t[p[1]]);
      });
    });
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang ? "true" : "false");
    });
    renderMenu();
    renderHours();
  }

  function renderMenu() {
    var box = $("#menu-grid");
    if (!box) return;
    box.innerHTML = "";
    Object.keys(SC.MENU_CATS).forEach(function (cat) {
      var items = SC.MENU.filter(function (i) { return i.cat === cat; });
      var card = el("div", "menu-card");
      card.appendChild(el("h3", null, esc(SC.MENU_CATS[cat][lang])));
      var ul = el("ul");
      items.forEach(function (i) {
        var li = el("li");
        li.innerHTML = '<span class="mi-name">' + i.emoji + " " + esc(i.name[lang]) + '</span><span class="mi-price">$' +
          (i.price % 1 === 0 ? i.price.toFixed(0) : i.price.toFixed(2)) + '</span><span class="mi-desc">' + esc(i.desc[lang]) + "</span>";
        ul.appendChild(li);
      });
      card.appendChild(ul);
      box.appendChild(card);
    });
  }
  function renderHours() {
    var box = $("#hours-list");
    if (!box) return;
    box.innerHTML = "";
    SC.BUSINESS.hours.forEach(function (h) {
      var row = el("div", "hours-row");
      row.innerHTML = "<span>" + esc(h.days[lang]) + "</span><span>" + esc(h.open ? h.open + " – " + h.close : SC.T[lang].closed) + "</span>";
      box.appendChild(row);
    });
    var a = $("#address");
    if (a) a.textContent = SC.BUSINESS.address;
  }

  // ---------- chat rendering ----------
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function addUser(text) {
    var row = el("div", "msg msg-user");
    var b = el("div", "bubble");
    b.textContent = text;
    row.appendChild(b);
    log.appendChild(row);
    scrollDown();
  }
  function showTyping() {
    var row = el("div", "msg msg-bot typing-row");
    row.setAttribute("aria-label", SC.T[lang].typing);
    row.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    log.appendChild(row);
    scrollDown();
    return row;
  }
  function renderMsg(m) {
    if (m.from === "system") {
      var s = el("div", "msg msg-system", md(m.text));
      log.appendChild(s);
      return;
    }
    var row = el("div", "msg " + (m.from === "agent" ? "msg-agent" : "msg-bot"));
    if (m.from === "agent") row.appendChild(el("div", "msg-name", esc(m.name || "")));
    if (m.summary) {
      var card = el("div", "summary-card");
      card.setAttribute("data-testid", "order-summary");
      card.appendChild(el("div", "summary-title", "🎂 " + esc(m.summary.title)));
      var dl = el("dl");
      m.summary.rows.forEach(function (r) {
        var dt = el("dt"); dt.textContent = r[0];
        var dd = el("dd"); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      card.appendChild(dl);
      card.appendChild(el("div", "summary-note", esc(m.summary.note)));
      row.appendChild(card);
    }
    if (m.text) row.appendChild(el("div", "bubble", md(m.text)));
    log.appendChild(row);
  }
  function setChips(chips) {
    chipsBox.innerHTML = "";
    (chips || []).forEach(function (c) {
      var b = el("button", "chip");
      b.type = "button";
      b.textContent = c.label;
      b.addEventListener("click", function () { send(c.value, c.label); });
      chipsBox.appendChild(b);
    });
    chipsBox.hidden = !(chips && chips.length);
  }

  function play(messages) {
    var lastChips = null;
    var p = Promise.resolve();
    messages.forEach(function (m) {
      p = p.then(function () {
        var delay = cfg.typingDelayMs ? (m.delay || cfg.typingDelayMs) : 0;
        if (m.from === "system") { renderMsg(m); scrollDown(); return; }
        var ty = delay ? showTyping() : null;
        return wait(delay).then(function () {
          if (ty) ty.remove();
          if (m.ai) return resolveAI(m);
          renderMsg(m);
          if (m.chips) lastChips = m.chips;
          scrollDown();
        });
      });
    });
    return p.then(function () { setChips(lastChips); scrollDown(); });
  }

  function resolveAI(m) {
    // Optional AI mode. Any failure falls back to the scripted answer.
    return SC.AIProvider.reply(m.history, { lang: m.lang, facts: { business: SC.BUSINESS, menu: SC.MENU } })
      .then(function (text) { renderMsg({ from: "bot", text: text }); })
      .catch(function (err) {
        console.warn("[bakery-bot] AI provider failed, using scripted fallback:", err.message);
        renderMsg({ from: "bot", text: botEngine.aiFallbackText() });
      });
  }

  function send(value, label) {
    if (busy) return;
    var text = String(value || "").trim();
    if (!text) return;
    busy = true;
    setChips(null);
    addUser(label || text);
    var res = botEngine.handle(text);
    if (res.lang !== lang) { lang = res.lang; applyPageLang(); }
    return play(res.messages).then(function () { busy = false; input.focus({ preventScroll: true }); });
  }

  function setLang(l) {
    if (l === lang) return;
    lang = botEngine.setLang(l);
    applyPageLang();
    if (log.children.length) {
      renderMsg({ from: "system", text: SC.T[lang].switchedTo });
      setChips(chipsFor());
      scrollDown();
    }
  }
  function chipsFor() {
    var c = SC.T[lang].chips;
    var st = botEngine.getState();
    if (st.mode !== "idle") return null;
    return [{ label: c.menu, value: "#menu" }, { label: c.hours, value: "#hours" }, { label: c.order, value: "#order" }, { label: c.human, value: "#human" }];
  }

  function restart() {
    botEngine = SC.createBot({ lang: lang });
    log.innerHTML = "";
    busy = true;
    return play(botEngine.start()).then(function () { busy = false; });
  }

  function openChat() {
    panel.hidden = false;
    document.body.classList.add("chat-open");
    launcher.setAttribute("aria-expanded", "true");
    setTimeout(function () { input.focus({ preventScroll: true }); }, 50);
    if (!log.children.length) {
      busy = true;
      return play(botEngine.start()).then(function () { busy = false; });
    }
    return Promise.resolve();
  }
  function closeChat() {
    panel.hidden = true;
    document.body.classList.remove("chat-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  function init() {
    lang = cfg.defaultLang;
    botEngine = SC.createBot({ lang: lang });
    log = $("#chat-log"); chipsBox = $("#chat-chips"); input = $("#chat-input");
    panel = $("#chat-panel"); launcher = $("#chat-launcher"); form = $("#chat-form");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = "";
      send(v);
    });
    launcher.addEventListener("click", function () { panel.hidden ? openChat() : closeChat(); });
    $("#chat-close").addEventListener("click", closeChat);
    $("#chat-restart").addEventListener("click", restart);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) closeChat(); });
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); });
    });
    document.querySelectorAll("[data-open-chat]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var cmd = b.getAttribute("data-open-chat");
        var ready = panel.hidden ? openChat() : Promise.resolve();
        if (cmd) ready.then(function () { send(cmd, SC.T[lang].chips.order); });
      });
    });
    applyPageLang();
    SC.widget = { open: openChat, close: closeChat, send: send, setLang: setLang, restart: restart };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
