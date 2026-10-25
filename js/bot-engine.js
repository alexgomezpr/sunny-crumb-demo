/*
 * Scripted bot engine: language detection, intent matching, custom-order flow,
 * human handoff. Pure logic, no DOM. The widget (widget.js) renders its output.
 *
 * handle(text) returns { messages: [...], lang, switched }
 *   message = { from: "bot"|"agent"|"system", text?, chips?, summary?, delay? }
 *   chip    = { label, value }  (value starting with "#" is a command token)
 */
(function () {
  var SC = (window.SunnyCrumb = window.SunnyCrumb || {});

  // ---------- text helpers ----------
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9ñ/\-\s"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function hasKw(n, kw) {
    // phrase/word match on normalized text with word boundaries
    var k = norm(kw);
    if (!k) return false;
    var re = new RegExp("(^|\\s)" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=\\s|$)");
    return re.test(n);
  }
  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] !== undefined ? vars[k] : "{" + k + "}";
    });
  }
  function money(n) { return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); }

  // ---------- language detection ----------
  var ES_WORDS = ("hola buenas buenos dias tardes noches gracias quiero quisiera necesito puedo puedes pastel pasteles torta tortas " +
    "horario horarios precio precios cuanto cuanta cuesta cuestan donde direccion ubicacion pedido encargo encargar hablar persona " +
    "favor que como cual cuales tienen tienes venden ofrecen para una unos unas el la los las del con es son estan mi mis " +
    "cumpleanos boda abren cierran abierto cerrado hoy manana domingo sabado lunes tambien pero porque quien alguien sin " +
    "pan dulce rebanada sabor tamano fecha nombre entrega domicilio recoger pagar tarjeta efectivo ayuda humano gusto vale").split(" ");
  var EN_WORDS = ("hi hello hey thanks thank the what whats how much is are do does you your hours open close price prices " +
    "where want need would like cake cakes my a an to can could please order custom person someone talk speak menu " +
    "when today tomorrow address location have sell and with for of it this that i im get pay delivery real human").split(" ");
  var ES_STRONG = ["hola", "gracias", "quiero", "quisiera", "necesito", "cuanto", "cuesta", "donde", "horario", "pastel", "torta", "encargar", "hablar", "buenas", "buenos", "tienen", "precio", "precios"];

  function detectLang(text) {
    var raw = String(text || "");
    var n = norm(raw);
    if (!n || n.charAt(0) === "#") return null;
    var words = n.split(" ");
    var es = 0, en = 0, strong = false;
    if (/[¿¡ñ]/i.test(raw)) es += 2;
    if (/[áéíóú]/i.test(raw)) es += 1;
    words.forEach(function (w) {
      if (ES_WORDS.indexOf(w) >= 0) es++;
      if (EN_WORDS.indexOf(w) >= 0) en++;
      if (ES_STRONG.indexOf(w) >= 0) strong = true;
    });
    if ((es >= 2 && es > en) || (strong && en === 0)) return "es";
    if (en >= 2 && en > es) return "en";
    return null;
  }

  // ---------- intents ----------
  // Ordered by priority (first wins on ties).
  var INTENTS = [
    { id: "human", kw: ["human", "person", "a person", "real person", "someone", "somebody", "agent", "representative", "staff", "employee", "manager", "talk to", "speak to", "speak with", "talk with", "call me",
      "persona", "humano", "alguien", "agente", "asesor", "asesora", "representante", "encargado", "encargada", "hablar con", "atencion al cliente"] },
    { id: "order", kw: ["custom", "custom cake", "order", "order a cake", "special order", "birthday cake", "wedding cake", "quinceanera", "quince", "baby shower", "celebration cake", "book a cake",
      "encargo", "encargar", "por encargo", "pedido", "pedir", "ordenar", "personalizado", "personalizada", "pastel de cumpleanos", "pastel de boda", "torta de cumpleanos", "quiero un pastel", "quiero una torta", "hacer un pedido", "mandar a hacer"] },
    { id: "hoursLocation", kw: ["hours and location", "horario y ubicacion"] },
    { id: "hours", kw: ["hours", "hour", "open", "opening", "close", "closing", "closed", "when", "today", "sunday", "saturday", "monday", "weekend", "schedule", "time",
      "horario", "horarios", "hora", "horas", "abren", "abre", "cierran", "cierra", "abierto", "abiertos", "cerrado", "domingo", "sabado", "lunes", "fin de semana", "a que hora", "cuando"] },
    { id: "location", kw: ["where", "address", "location", "located", "directions", "parking", "find you", "map",
      "donde", "direccion", "ubicacion", "ubicados", "ubicadas", "estacionamiento", "como llego", "llegar", "mapa"] },
    { id: "delivery", kw: ["delivery", "deliver", "pickup", "pick up", "ship", "shipping", "doordash", "uber eats",
      "entrega", "entregan", "domicilio", "envio", "envian", "recoger", "llevan", "a domicilio"] },
    { id: "dietary", kw: ["gluten", "gluten free", "vegan", "nut", "nuts", "peanut", "allergy", "allergies", "allergen", "dairy", "lactose", "sugar free", "keto",
      "sin gluten", "vegano", "vegana", "veganos", "nueces", "mani", "cacahuate", "alergia", "alergias", "alergenos", "lactosa", "sin azucar"] },
    { id: "payment", kw: ["pay", "payment", "card", "cards", "cash", "credit", "apple pay", "zelle",
      "pagar", "pago", "pagos", "tarjeta", "tarjetas", "efectivo", "credito"] },
    { id: "menu", kw: ["menu", "price", "prices", "pricing", "cost", "costs", "how much", "sell", "offer", "pastries", "pastry", "items", "what do you have", "food", "cake", "cakes", "desserts", "coffee",
      "precio", "precios", "cuanto", "cuesta", "cuestan", "valen", "venden", "tienen", "ofrecen", "postres", "pasteles", "carta", "que hay"] },
    { id: "about", kw: ["is this real", "are you real", "fake", "demo", "fictional", "are you a bot", "are you ai", "es real", "eres real", "ficticio", "ficticia", "eres un bot", "eres robot"] },
    { id: "help", kw: ["help", "what can you do", "options", "ayuda", "ayudame", "que puedes hacer", "opciones"] },
    { id: "thanks", kw: ["thanks", "thank you", "thx", "ty", "gracias", "muchas gracias", "mil gracias"] },
    { id: "bye", kw: ["bye", "goodbye", "see you", "adios", "hasta luego", "nos vemos", "chao", "chau"] },
    { id: "greeting", kw: ["hi", "hello", "hey", "good morning", "good afternoon", "hola", "buenas", "buenos dias", "buenas tardes", "buenas noches", "que tal"] },
  ];

  function matchIntent(n) {
    var best = null, bestScore = 0;
    INTENTS.forEach(function (it) {
      var score = 0;
      it.kw.forEach(function (k) { if (hasKw(n, k)) score += norm(k).split(" ").length; });
      if (score > bestScore) { best = it.id; bestScore = score; }
    });
    return best;
  }

  function matchMenuItem(n) {
    var best = null, len = 0;
    SC.MENU.forEach(function (item) {
      item.kw.forEach(function (k) {
        var kk = norm(k);
        if (hasKw(n, kk) && kk.length > len) { best = item; len = kk.length; }
      });
    });
    return best;
  }

  function matchOption(n, options) {
    var best = null, len = 0;
    options.forEach(function (o) {
      o.kw.concat([o.id, o.label.en, o.label.es]).forEach(function (k) {
        var kk = norm(k);
        if (kk && hasKw(n, kk) && kk.length > len) { best = o; len = kk.length; }
      });
    });
    return best;
  }

  // ---------- dates ----------
  var MONTHS = {
    jan: 0, january: 0, ene: 0, enero: 0,
    feb: 1, february: 1, febrero: 1,
    mar: 2, march: 2, marzo: 2,
    apr: 3, april: 3, abr: 3, abril: 3,
    may: 4, mayo: 4,
    jun: 5, june: 5, junio: 5,
    jul: 6, july: 6, julio: 6,
    aug: 7, august: 7, ago: 7, agosto: 7,
    sep: 8, sept: 8, september: 8, septiembre: 8, setiembre: 8,
    oct: 9, october: 9, octubre: 9,
    nov: 10, november: 10, noviembre: 10,
    dec: 11, december: 11, dic: 11, diciembre: 11,
  };
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function mk(y, m, d) {
    var dt = new Date(y, m, d);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
  }

  /** Parse a date the way a customer would type it. Spanish users get day/month order for "14/11". */
  function parseDate(text, lang, now) {
    var today = startOfDay(now || new Date());
    var n = norm(text).replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
    var m, y, mo, d, explicitYear = false;

    if (/\b(tomorrow|manana)\b/.test(n)) { var t = new Date(today); t.setDate(t.getDate() + 1); return t; }
    if (/\b(today|hoy)\b/.test(n)) return today;

    if ((m = n.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; explicitYear = true; }
    else if ((m = n.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/))) {
      var a = +m[1], b = +m[2];
      if (lang === "es") { d = a; mo = b - 1; } else { mo = a - 1; d = b; }
      if (m[3]) { y = +m[3]; if (y < 100) y += 2000; explicitYear = true; }
    } else {
      var words = n.split(" "), monthIdx = -1, monthPos = -1;
      words.forEach(function (w, i) { if (monthIdx < 0 && MONTHS.hasOwnProperty(w)) { monthIdx = MONTHS[w]; monthPos = i; } });
      if (monthIdx < 0) return null;
      // prefer a number right before ("14 de noviembre", "14 nov") or right after ("nov 14")
      var nums = [];
      words.forEach(function (w, i) { if (/^\d{1,4}$/.test(w)) nums.push({ v: +w, i: i }); });
      var dayTok = nums.filter(function (x) { return x.v >= 1 && x.v <= 31; })
        .sort(function (p, q) { return Math.abs(p.i - monthPos) - Math.abs(q.i - monthPos); })[0];
      if (!dayTok) return null;
      d = dayTok.v; mo = monthIdx;
      var yearTok = nums.filter(function (x) { return x.v >= 2000; })[0];
      if (yearTok) { y = yearTok.v; explicitYear = true; }
    }
    if (!explicitYear) {
      y = today.getFullYear();
      var cand = mk(y, mo, d);
      if (cand && cand < today) y += 1;
    }
    return mk(y, mo, d);
  }
  function fmtDate(dt, lang) {
    return dt.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  // ---------- bot ----------
  function createBot(opts) {
    opts = opts || {};
    var cfg = window.BAKERY_BOT_CONFIG || {};
    var state = {
      lang: opts.lang || cfg.defaultLang || "en",
      mode: "idle",        // idle | order | confirm | human | offerHuman
      step: null,          // type | size | date | flavor | name
      order: {},
      misses: 0,
      history: [],         // for a future AI provider
    };
    var now = opts.now || function () { return new Date(); };

    function T() { return SC.T[state.lang]; }
    function bot(text, extra) { return Object.assign({ from: "bot", text: text }, extra || {}); }
    function mainChips() {
      var c = T().chips;
      return [
        { label: c.menu, value: "#menu" }, { label: c.hours, value: "#hours" },
        { label: c.order, value: "#order" }, { label: c.human, value: "#human" },
      ];
    }
    function optChips(list, prefix) {
      return list.map(function (o) { return { label: o.label[state.lang], value: "#" + prefix + ":" + o.id }; });
    }

    // ----- answers -----
    function hoursText() {
      var t = T();
      var lines = SC.BUSINESS.hours.map(function (h) {
        return "• " + h.days[state.lang] + ": " + (h.open ? h.open + " – " + h.close : t.closed);
      }).join("\n");
      return fill(t.hours, { hours: lines });
    }
    function locationText() { return fill(T().location, { address: SC.BUSINESS.address }); }
    function menuText() {
      var t = T(), lang = state.lang, out = [t.menuIntro];
      Object.keys(SC.MENU_CATS).forEach(function (cat) {
        var items = SC.MENU.filter(function (i) { return i.cat === cat; });
        if (!items.length) return;
        out.push("\n**" + SC.MENU_CATS[cat][lang] + "**");
        items.forEach(function (i) { out.push("• " + i.name[lang] + " — $" + money(i.price)); });
      });
      out.push("\n" + t.menuOutro);
      return out.join("\n");
    }
    function itemText(item) {
      return fill(T().itemAnswer, { name: item.name[state.lang], price: money(item.price), desc: item.desc[state.lang] });
    }

    // ----- order flow -----
    function askStep(step) {
      var t = T();
      state.step = step;
      if (step === "type") return bot(t.orderStart, { chips: optChips(SC.ORDER.types, "type").concat([{ label: t.otherType, value: "#type:other" }]) });
      if (step === "size") return bot(t.askSize, { chips: optChips(SC.ORDER.sizes, "size") });
      if (step === "date") return bot(fill(t.askDate, { lead: cfg.minOrderLeadDays || 3 }));
      if (step === "flavor") return bot(t.askFlavor, { chips: optChips(SC.ORDER.flavors, "flavor") });
      if (step === "name") return bot(t.askName);
    }
    function labelOf(list, id, raw) {
      var o = list.filter(function (x) { return x.id === id; })[0];
      return o ? o.label[state.lang] : raw;
    }
    function summaryMsg() {
      var t = T(), o = state.order, size = SC.ORDER.sizes.filter(function (s) { return s.id === o.size; })[0];
      return {
        from: "bot",
        summary: {
          title: t.summaryTitle,
          rows: [
            [t.sType, o.type ? labelOf(SC.ORDER.types, o.type, o.typeRaw) : o.typeRaw],
            [t.sSize, labelOf(SC.ORDER.sizes, o.size)],
            [t.sDate, fmtDate(o.date, state.lang)],
            [t.sFlavor, o.flavor ? labelOf(SC.ORDER.flavors, o.flavor) : o.flavorRaw],
            [t.sName, o.name],
            [t.sEstimate, fill(t.estimateVal, { from: size ? size.from : "?" })],
          ],
          note: t.notice,
        },
        text: t.summaryAsk,
        chips: [{ label: t.confirm, value: "#confirm" }, { label: t.edit, value: "#restartOrder" }, { label: t.cancel, value: "#cancel" }],
      };
    }
    function orderStep(raw, n, token) {
      var t = T(), step = state.step, val;
      var tokenVal = token && token.indexOf(":") > 0 ? token.split(":")[1] : null;

      if (step === "type") {
        if (tokenVal === "other") { state.order.typeOther = true; return [bot(state.lang === "es" ? "¿Cuál es la ocasión?" : "What's the occasion?")]; }
        val = tokenVal ? SC.ORDER.types.filter(function (x) { return x.id === tokenVal; })[0] : matchOption(n, SC.ORDER.types);
        if (val) { state.order.type = val.id; }
        else if (!token && raw.trim().length >= 2 && raw.trim().length <= 60) { state.order.type = null; state.order.typeRaw = raw.trim(); }
        else return [bot(t.badType)];
        return [askStep("size")];
      }
      if (step === "size") {
        val = tokenVal ? SC.ORDER.sizes.filter(function (x) { return x.id === tokenVal; })[0] : matchOption(n, SC.ORDER.sizes);
        if (!val) return [bot(t.badSize, { chips: optChips(SC.ORDER.sizes, "size") })];
        state.order.size = val.id;
        return [askStep("date")];
      }
      if (step === "date") {
        var dt = parseDate(raw, state.lang, now());
        if (!dt) return [bot(t.badDate)];
        var today = startOfDay(now()), lead = cfg.minOrderLeadDays || 3;
        var earliest = new Date(today); earliest.setDate(earliest.getDate() + lead);
        var latest = new Date(today); latest.setFullYear(latest.getFullYear() + 1);
        if (dt < today) return [bot(t.pastDate)];
        if (dt < earliest) return [bot(fill(t.tooSoon, { lead: lead, earliest: fmtDate(earliest, state.lang) }))];
        if (dt > latest) return [bot(t.tooFar)];
        state.order.date = dt;
        return [askStep("flavor")];
      }
      if (step === "flavor") {
        val = tokenVal ? SC.ORDER.flavors.filter(function (x) { return x.id === tokenVal; })[0] : matchOption(n, SC.ORDER.flavors);
        if (val) state.order.flavor = val.id;
        else if (!token && raw.trim().length >= 2 && raw.trim().length <= 60) { state.order.flavor = null; state.order.flavorRaw = raw.trim(); }
        else return [bot(t.askFlavor, { chips: optChips(SC.ORDER.flavors, "flavor") })];
        return [askStep("name")];
      }
      if (step === "name") {
        var name = raw.trim().replace(/\s+/g, " ");
        if (token || !/^[\p{L}][\p{L} .'\-]{0,59}$/u.test(name)) return [bot(t.badName)];
        state.order.name = name;
        state.mode = "confirm"; state.step = null;
        return [summaryMsg()];
      }
      return [];
    }

    // ----- handoff -----
    function startHandoff() {
      var t = T();
      state.mode = "human"; state.step = null; state.misses = 0;
      return [
        bot(t.handoffBot),
        { from: "system", text: t.handoffSystem },
        { from: "agent", name: t.agentName, text: t.agentHello, delay: 1200, chips: [{ label: t.backToBot, value: "#bot" }] },
      ];
    }

    // ----- main entry -----
    function start() {
      return [bot(T().greeting, { chips: mainChips() })];
    }

    function setLang(l) { if (SC.T[l]) state.lang = l; return state.lang; }

    function handle(input) {
      var raw = String(input || "");
      if (!raw.trim()) return { messages: [], lang: state.lang, switched: false };
      var token = raw.charAt(0) === "#" ? raw.trim() : null;
      var n = norm(raw);
      var switched = false;
      state.history.push({ role: "user", content: raw });

      if (!token) {
        var d = detectLang(raw);
        if (d && d !== state.lang) { state.lang = d; switched = true; }
      }
      var t = T();
      var out = [];
      if (switched) out.push({ from: "system", text: t.switchedTo });

      var res = route(raw, n, token);
      out = out.concat(res);
      res.forEach(function (m) { if (m.text) state.history.push({ role: "assistant", content: m.text }); });
      return { messages: out, lang: state.lang, switched: switched };
    }

    function isCancel(n) { return /^(cancel|cancelar|stop|para|salir|exit|nevermind|never mind|olvidalo)$/.test(n); }

    function route(raw, n, token) {
      var t = T();

      // global commands
      if (token === "#bot") { state.mode = "idle"; return [bot(t.backFromHuman, { chips: mainChips() })]; }
      if (token === "#human") return startHandoff();
      if (token === "#cancel" || ((state.mode === "order" || state.mode === "confirm") && isCancel(n))) {
        state.mode = "idle"; state.step = null; state.order = {};
        return [bot(t.orderCancelled, { chips: mainChips() })];
      }

      // live (mock) human chat: everything goes to the "agent"
      if (state.mode === "human") {
        return [{ from: "agent", name: t.agentName, text: t.agentReply, delay: 900, chips: [{ label: t.backToBot, value: "#bot" }] }];
      }

      if (state.mode === "offerHuman") {
        if (token === "#yes" || /^(yes|yeah|yep|sure|ok|okay|si|claro|dale|va|sale|por favor)\b/.test(n)) return startHandoff();
        state.mode = "idle";
        if (token === "#no" || /^(no|nope|nah)\b/.test(n)) return [bot(t.noHandoff, { chips: mainChips() })];
      }

      if (state.mode === "confirm") {
        if (token === "#confirm" || /^(yes|yep|confirm|looks good|send|si|confirmar|enviar|esta bien|todo bien|correcto)\b/.test(n)) {
          var ref = "SC-" + Math.floor(1000 + Math.random() * 9000);
          state.mode = "idle"; state.order = {};
          return [bot(fill(t.orderDone, { ref: ref }), { chips: mainChips(), orderRef: ref })];
        }
        if (token === "#restartOrder" || /^(start over|edit|change|no|empezar de nuevo|cambiar|editar)\b/.test(n)) {
          state.mode = "order"; state.order = {};
          return [askStep("type")];
        }
        return [summaryMsg()];
      }

      if (token === "#restartOrder" || token === "#order") { state.mode = "order"; state.order = {}; return [askStep("type")]; }

      if (state.mode === "order") {
        // let people bail out to a human mid-flow
        if (!token && matchIntent(n) === "human" && state.step !== "name") return startHandoff();
        return orderStep(raw, n, token);
      }

      if (token === "#menu") return [bot(menuText(), { chips: mainChips() })];
      if (token === "#hours") return [bot(fill(t.hoursLocation, { hours: hoursText(), location: locationText() }), { chips: mainChips() })];

      var intent = matchIntent(n);
      var item = matchMenuItem(n);

      // "how much is the tres leches?" -> specific item beats the generic menu
      if (item && (!intent || intent === "menu")) { state.misses = 0; return [bot(itemText(item), { chips: mainChips() })]; }

      switch (intent) {
        case "human": return startHandoff();
        case "order": state.mode = "order"; state.order = {}; state.misses = 0; return [askStep("type")];
        case "hoursLocation": state.misses = 0; return [bot(fill(t.hoursLocation, { hours: hoursText(), location: locationText() }), { chips: mainChips() })];
        case "hours": state.misses = 0; return [bot(hoursText(), { chips: mainChips() })];
        case "location": state.misses = 0; return [bot(locationText(), { chips: mainChips() })];
        case "menu": state.misses = 0; return [bot(menuText(), { chips: mainChips() })];
        case "delivery": return [bot(t.delivery, { chips: mainChips() })];
        case "dietary": return [bot(t.dietary, { chips: mainChips() })];
        case "payment": return [bot(t.payment, { chips: mainChips() })];
        case "about": return [bot(t.about, { chips: mainChips() })];
        case "help": return [bot(t.help, { chips: mainChips() })];
        case "thanks": return [bot(t.thanks, { chips: mainChips() })];
        case "bye": return [bot(t.bye)];
        case "greeting": return [bot(t.greeting, { chips: mainChips() })];
      }

      // Fallback. Hook for a future AI provider (see ai-provider.js).
      if (SC.AIProvider && SC.AIProvider.isEnabled()) {
        return [{ from: "bot", ai: true, history: state.history.slice(), lang: state.lang }];
      }
      state.misses++;
      if (state.misses >= 2) {
        state.mode = "offerHuman";
        return [bot(t.fallback2, { chips: [{ label: t.yes, value: "#yes" }, { label: t.no, value: "#no" }] })];
      }
      return [bot(t.fallback, { chips: mainChips() })];
    }

    return {
      start: start,
      handle: handle,
      setLang: setLang,
      getLang: function () { return state.lang; },
      getState: function () { return state; },
      aiFallbackText: function () { return T().fallback; },
    };
  }

  SC.createBot = createBot;
  SC._internals = { norm: norm, detectLang: detectLang, matchIntent: matchIntent, parseDate: parseDate, matchMenuItem: matchMenuItem };
})();
