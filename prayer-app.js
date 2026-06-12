/* Prayer Times app logic (vanilla JS) */
(function () {
  "use strict";

  var PRAYERS = [
    { key: "Fajr", en: "Fajr", ar: "الفجر", minor: false },
    { key: "Sunrise", en: "Sunrise", ar: "الشروق", minor: true },
    { key: "Dhuhr", en: "Dhuhr", ar: "الظهر", minor: false },
    { key: "Asr", en: "Asr", ar: "العصر", minor: false },
    { key: "Maghrib", en: "Maghrib", ar: "المغرب", minor: false },
    { key: "Isha", en: "Isha", ar: "العشاء", minor: false }
  ];
  var FIVE = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  var AR = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };

  var METHODS = [
    { id: "3", label: "Muslim World League", desc: "Widely used across Europe and much of the world — a safe default." },
    { id: "2", label: "ISNA (North America)", desc: "Common across the United States and Canada." },
    { id: "4", label: "Umm al-Qura, Makkah", desc: "The official method in Saudi Arabia." },
    { id: "5", label: "Egyptian General Authority", desc: "Egypt, the Levant and much of Africa." },
    { id: "1", label: "Univ. of Islamic Sciences, Karachi", desc: "Pakistan, India, Bangladesh and Afghanistan." },
    { id: "13", label: "Diyanet (Turkey)", desc: "The official method in Turkey." },
    { id: "12", label: "UOIF (France)", desc: "Common among mosques in France." },
    { id: "8", label: "Gulf Region", desc: "UAE, Oman and Bahrain." },
    { id: "9", label: "Kuwait", desc: "The official method in Kuwait." },
    { id: "10", label: "Qatar", desc: "The official method in Qatar." },
    { id: "11", label: "MUIS (Singapore)", desc: "The official method in Singapore." },
    { id: "17", label: "JAKIM (Malaysia)", desc: "The official method in Malaysia." },
    { id: "20", label: "KEMENAG (Indonesia)", desc: "The official method in Indonesia." },
    { id: "21", label: "Morocco", desc: "The official method in Morocco." },
    { id: "15", label: "Moonsighting Committee", desc: "Based on observed twilight; popular in North America and the UK." },
    { id: "0", label: "Shia Ithna-Ashari", desc: "Followed by many Shia communities." }
  ];

  // Typical method by country — used to suggest a sensible choice.
  var COUNTRY_METHOD = {
    SA: "4", EG: "5", SD: "5", LY: "5", SY: "5", LB: "5",
    TR: "13", DE: "13", US: "2", CA: "2",
    PK: "1", IN: "1", BD: "1", AF: "1",
    FR: "12", AE: "8", OM: "8", BH: "8",
    KW: "9", QA: "10", SG: "11",
    MY: "17", BN: "17", ID: "20", MA: "21"
  };

  function methodById(id) {
    var found = null;
    METHODS.forEach(function (m) { if (m.id === id) found = m; });
    return found;
  }

  function countryName(cc) {
    try {
      var dn = new Intl.DisplayNames(["en"], { type: "region" });
      return dn.of(cc.toUpperCase()) || cc;
    } catch (e) { return cc; }
  }

  var state = {
    loc: null,            // { lat, lng, label, tz }
    method: "3",
    today: null,          // { dateStr, timings: {Fajr:"04:15",...} }
    tomorrow: null,
    format24: true,
    timer: null
  };

  /* ---------- elements ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var els = {};
  ["status", "statusMsg", "statusSub", "statusActions", "main", "locName",
   "dateLine", "heroName", "heroAt", "progressBar", "times",
   "methodSelect", "sheet", "searchInput", "results"].forEach(function (k) {
    els[k] = $(k);
  });

  /* ---------- storage ---------- */
  function save() {
    try {
      localStorage.setItem("pt_location", JSON.stringify(state.loc));
      localStorage.setItem("pt_method", state.method);
    } catch (e) { /* ignore */ }
  }
  function restore() {
    try {
      var l = localStorage.getItem("pt_location");
      if (l) state.loc = JSON.parse(l);
      var m = localStorage.getItem("pt_method");
      if (m) state.method = m;
    } catch (e) { /* ignore */ }
  }

  /* ---------- time helpers ---------- */
  function tzNowParts(tz) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    var parts = {};
    fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var h = parseInt(parts.hour, 10) % 24;
    return h * 3600 + parseInt(parts.minute, 10) * 60 + parseInt(parts.second, 10);
  }

  function tzDateStr(tz, offsetDays) {
    var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d); // YYYY-MM-DD
  }

  function cleanTime(t) {
    var m = String(t).match(/\d{1,2}:\d{2}/);
    return m ? m[0] : "00:00";
  }

  function toSecs(hhmm) {
    var p = cleanTime(hhmm).split(":");
    return parseInt(p[0], 10) * 3600 + parseInt(p[1], 10) * 60;
  }

  function fmtTime(hhmm) {
    var p = cleanTime(hhmm).split(":");
    var h = parseInt(p[0], 10), m = p[1];
    if (state.format24) {
      return { t: (h < 10 ? "0" + h : h) + ":" + m, suffix: "" };
    }
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return { t: h12 + ":" + m, suffix: suffix };
  }

  function fmtCountdown(secs) {
    if (secs < 0) secs = 0;
    var h = Math.floor(secs / 3600);
    var m = Math.floor((secs % 3600) / 60);
    var s = secs % 60;
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  /* ---------- views ---------- */
  function showStatus(msg, sub, actions) {
    els.main.style.display = "none";
    els.status.style.display = "flex";
    els.statusMsg.textContent = msg;
    els.statusSub.textContent = sub || "";
    els.statusActions.innerHTML = "";
    (actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.className = "btn" + (a.primary ? " primary" : "");
      b.textContent = a.label;
      b.addEventListener("click", a.onClick);
      els.statusActions.appendChild(b);
    });
    var pulse = els.status.querySelector(".pulse");
    pulse.style.display = actions && actions.length ? "none" : "block";
  }

  function showMain() {
    els.status.style.display = "none";
    els.main.style.display = "flex";
  }

  /* ---------- data ---------- */
  function fetchDay(dateYMD) {
    var p = dateYMD.split("-"); // YYYY-MM-DD
    var ddmmyyyy = p[2] + "-" + p[1] + "-" + p[0];
    var url = "https://api.aladhan.com/v1/timings/" + ddmmyyyy +
      "?latitude=" + state.loc.lat + "&longitude=" + state.loc.lng +
      "&method=" + state.method;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("API error " + r.status);
      return r.json();
    }).then(function (j) {
      if (!j.data || !j.data.timings) throw new Error("Bad response");
      if (!state.loc.tz && j.data.meta && j.data.meta.timezone) {
        state.loc.tz = j.data.meta.timezone;
        save();
      }
      return { dateStr: dateYMD, timings: j.data.timings };
    });
  }

  function load() {
    showStatus("Fetching prayer times…", "");
    var tz = state.loc.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    var todayStr = tzDateStr(tz, 0);
    var tomorrowStr = tzDateStr(tz, 1);
    Promise.all([fetchDay(todayStr), fetchDay(tomorrowStr)]).then(function (days) {
      state.today = days[0];
      state.tomorrow = days[1];
      renderAll();
      showMain();
      startTick();
    }).catch(function (e) {
      showStatus("Couldn’t load prayer times", "Please check your connection and try again.", [
        { label: "Retry", primary: true, onClick: load },
        { label: "Change city", onClick: openSheet }
      ]);
    });
  }

  /* ---------- rendering ---------- */
  function renderAll() {
    els.locName.textContent = state.loc.label || "Your location";
    maybeSuggest();
    var tz = state.loc.tz;
    els.dateLine.textContent = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric"
    }).format(new Date());
    renderList();
    tick();
  }

  function renderList() {
    els.times.innerHTML = "";
    PRAYERS.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "row" + (p.minor ? " minor" : "");
      row.setAttribute("data-prayer", p.key);

      var dot = document.createElement("span");
      dot.className = "dot";

      var name = document.createElement("span");
      name.className = "name-en";
      name.textContent = p.en;

      var ar = document.createElement("span");
      ar.className = "name-ar";
      ar.setAttribute("lang", "ar");
      ar.setAttribute("dir", "rtl");
      ar.textContent = p.ar;

      var f = fmtTime(state.today.timings[p.key]);
      var countdown = document.createElement("span");
      countdown.className = "countdown";

      var time = document.createElement("span");
      time.className = "time";
      time.textContent = f.t;
      if (f.suffix) {
        var sfx = document.createElement("span");
        sfx.className = "ampm";
        sfx.textContent = f.suffix;
        time.appendChild(sfx);
      }

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(ar);
      row.appendChild(countdown);
      row.appendChild(time);
      els.times.appendChild(row);
    });
  }

  function computeNext() {
    var tz = state.loc.tz;
    var now = tzNowParts(tz);
    var next = null, prevTime = null, current = null;

    for (var i = 0; i < FIVE.length; i++) {
      var t = toSecs(state.today.timings[FIVE[i]]);
      if (t > now && !next) {
        next = { key: FIVE[i], secs: t - now, at: state.today.timings[FIVE[i]] };
        prevTime = i === 0 ? null : toSecs(state.today.timings[FIVE[i - 1]]);
      }
      if (t <= now) current = FIVE[i];
    }

    if (!next) {
      // after Isha → tomorrow's Fajr
      var tf = toSecs(state.tomorrow.timings.Fajr);
      next = { key: "Fajr", secs: 86400 - now + tf, at: state.tomorrow.timings.Fajr, tomorrow: true };
      prevTime = toSecs(state.today.timings.Isha);
      current = "Isha";
    } else if (next.key === "Fajr") {
      // between midnight and Fajr → still Isha period
      current = "Isha";
      prevTime = null;
    }

    var total = null;
    if (prevTime !== null) {
      var span = (next.tomorrow ? 86400 + toSecs(next.at) : toSecs(next.at)) - prevTime;
      var elapsed = span - next.secs;
      total = span > 0 ? Math.min(1, Math.max(0, elapsed / span)) : null;
    }
    return { next: next, current: current, progress: total };
  }

  function tick() {
    if (!state.today || !state.loc || !state.loc.tz) return;

    // day rollover → refetch
    var nowDate = tzDateStr(state.loc.tz, 0);
    if (nowDate !== state.today.dateStr) { load(); return; }

    var c = computeNext();
    var f = fmtTime(c.next.at);
    els.heroName.innerHTML = "";
    var en = document.createTextNode(c.next.key + " ");
    var dotSep = document.createElement("span");
    dotSep.style.color = "var(--muted)";
    dotSep.textContent = "· ";
    var ar = document.createElement("span");
    ar.className = "ar";
    ar.setAttribute("lang", "ar");
    ar.setAttribute("dir", "rtl");
    ar.textContent = AR[c.next.key];
    els.heroName.appendChild(en);
    els.heroName.appendChild(dotSep);
    els.heroName.appendChild(ar);

    els.heroCount && (els.heroCount.textContent = "");
    els.heroAt.textContent = "at " + f.t + (f.suffix ? " " + f.suffix : "") +
      (c.next.tomorrow ? " · tomorrow" : "");

    els.progressBar.style.width = c.progress !== null ? (c.progress * 100).toFixed(2) + "%" : "0%";

    var cdText = fmtCountdown(c.next.secs);
    var rows = els.times.querySelectorAll(".row");
    rows.forEach(function (r) {
      r.classList.toggle("current", r.getAttribute("data-prayer") === c.current);
      var isNext = r.getAttribute("data-prayer") === c.next.key;
      r.classList.toggle("next", isNext);
      var cd = r.querySelector(".countdown");
      if (cd) cd.textContent = isNext ? cdText : "";
    });
  }

  function startTick() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(tick, 1000);
  }

  /* ---------- geolocation ---------- */
  function locate() {
    if (!navigator.geolocation) { geoFailed(); return; }
    showStatus("Finding your location…", "You may be asked to allow location access.");
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = +pos.coords.latitude.toFixed(4);
      var lng = +pos.coords.longitude.toFixed(4);
      state.loc = { lat: lat, lng: lng, label: "Your location", cc: null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
      save();
      load();
      reverseGeocode(lat, lng);
    }, geoFailed, { timeout: 10000, maximumAge: 600000 });
  }

  function geoFailed() {
    showStatus("Location unavailable", "We couldn’t detect your location. You can search for your city instead.", [
      { label: "Search for my city", primary: true, onClick: openSheet },
      { label: "Try again", onClick: locate }
    ]);
  }

  function reverseGeocode(lat, lng) {
    fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat +
      "&lon=" + lng + "&zoom=10&accept-language=en")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var a = j.address || {};
        var city = a.city || a.town || a.village || a.municipality || a.county || a.state;
        if (city) {
          state.loc.label = city + (a.country ? ", " + a.country : "");
          els.locName.textContent = state.loc.label;
        }
        if (a.country_code) state.loc.cc = a.country_code.toUpperCase();
        save();
        maybeSuggest();
      }).catch(function () { /* keep generic label */ });
  }

  /* ---------- city search ---------- */
  var searchTimer = null;

  function openSheet() {
    els.sheet.classList.add("open");
    els.results.innerHTML = "<div class=\"hint\">Type at least 2 letters to search.</div>";
    els.searchInput.value = "";
    setTimeout(function () { els.searchInput.focus(); }, 50);
  }

  function closeSheet() {
    els.sheet.classList.remove("open");
    if (!state.loc) {
      geoFailed();
    }
  }

  function doSearch(q) {
    fetch("https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(q) + "&count=8&language=en&format=json")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = j.results || [];
        els.results.innerHTML = "";
        if (!list.length) {
          els.results.innerHTML = "<div class=\"hint\">No places found for “" +
            q.replace(/[<>&]/g, "") + "”.</div>";
          return;
        }
        list.forEach(function (r) {
          var b = document.createElement("button");
          b.className = "result";
          var n = document.createElement("span");
          n.className = "r-name";
          n.textContent = r.name;
          var d = document.createElement("span");
          d.className = "r-detail";
          d.textContent = [r.admin1, r.country].filter(Boolean).join(", ");
          b.appendChild(n);
          b.appendChild(d);
          b.addEventListener("click", function () {
            state.loc = {
              lat: r.latitude, lng: r.longitude,
              label: r.name + (r.country_code ? ", " + r.country_code.toUpperCase() : ""),
              cc: r.country_code ? r.country_code.toUpperCase() : null,
              tz: r.timezone || null
            };
            save();
            els.sheet.classList.remove("open");
            load();
          });
          els.results.appendChild(b);
        });
      })
      .catch(function () {
        els.results.innerHTML = "<div class=\"hint\">Search failed — check your connection.</div>";
      });
  }

  /* ---------- settings ---------- */
  function buildMethodSelect() {
    METHODS.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      els.methodSelect.appendChild(o);
    });
    els.methodSelect.value = state.method;
    els.methodSelect.addEventListener("change", function () {
      state.method = els.methodSelect.value;
      dismissSuggestion();
      save();
      load();
    });
  }

  /* ---------- method suggestion ---------- */
  function suggestedMethod() {
    var cc = state.loc && state.loc.cc ? state.loc.cc : null;
    if (!cc || !COUNTRY_METHOD[cc]) return null;
    return { cc: cc, method: methodById(COUNTRY_METHOD[cc]) };
  }

  function dismissSuggestion() {
    if (state.loc && state.loc.cc) {
      try { localStorage.setItem("pt_suggest_dismissed", state.loc.cc); } catch (e) { /* ignore */ }
    }
    var hint = $("methodHint");
    if (hint) hint.style.display = "none";
  }

  function maybeSuggest() {
    var hint = $("methodHint");
    if (!hint) return;
    var s = suggestedMethod();
    var dismissed = "";
    try { dismissed = localStorage.getItem("pt_suggest_dismissed") || ""; } catch (e) { /* ignore */ }
    if (!s || !s.method || s.method.id === state.method || dismissed === s.cc) {
      hint.style.display = "none";
      return;
    }
    hint.innerHTML = "";
    var txt = document.createElement("span");
    txt.className = "hint-text";
    txt.textContent = "In " + countryName(s.cc) + ", most follow " + s.method.label + ".";
    var apply = document.createElement("button");
    apply.className = "hint-apply";
    apply.textContent = "Use it";
    apply.addEventListener("click", function () {
      state.method = s.method.id;
      els.methodSelect.value = state.method;
      dismissSuggestion();
      save();
      load();
    });
    var close = document.createElement("button");
    close.className = "hint-close";
    close.setAttribute("aria-label", "Dismiss suggestion");
    close.textContent = "\u00d7";
    close.addEventListener("click", dismissSuggestion);
    hint.appendChild(txt);
    hint.appendChild(apply);
    hint.appendChild(close);
    hint.style.display = "flex";
  }

  /* ---------- method info sheet ---------- */
  function openInfoSheet() {
    var list = $("infoList");
    list.innerHTML = "";
    var s = suggestedMethod();
    METHODS.forEach(function (m) {
      var b = document.createElement("button");
      b.className = "result info-row" + (m.id === state.method ? " active" : "");
      var top = document.createElement("span");
      top.className = "r-name";
      top.textContent = m.label;
      if (m.id === state.method) {
        var cur = document.createElement("span");
        cur.className = "tag";
        cur.textContent = "Current";
        top.appendChild(cur);
      } else if (s && s.method && s.method.id === m.id) {
        var sug = document.createElement("span");
        sug.className = "tag";
        sug.textContent = "Suggested for " + countryName(s.cc);
        top.appendChild(sug);
      }
      var d = document.createElement("span");
      d.className = "r-detail";
      d.textContent = m.desc;
      b.appendChild(top);
      b.appendChild(d);
      b.addEventListener("click", function () {
        state.method = m.id;
        els.methodSelect.value = m.id;
        dismissSuggestion();
        save();
        $("infoSheet").classList.remove("open");
        load();
      });
      list.appendChild(b);
    });
    $("infoSheet").classList.add("open");
  }

  /* ---------- tweaks bridge ---------- */
  window.addEventListener("pt-tweaks", function (e) {
    var t = e.detail || {};
    var f24 = t.timeFormat === "24h";
    if (f24 !== state.format24) {
      state.format24 = f24;
      if (state.today) { renderList(); tick(); }
    }
  });

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildMethodSelect();

    $("locBtn").addEventListener("click", openSheet);
    $("infoBtn").addEventListener("click", openInfoSheet);
    $("infoCancel").addEventListener("click", function () {
      $("infoSheet").classList.remove("open");
    });
    $("sheetCancel").addEventListener("click", closeSheet);
    $("useGps").addEventListener("click", function () {
      els.sheet.classList.remove("open");
      locate();
    });

    els.searchInput.addEventListener("input", function () {
      var q = els.searchInput.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (q.length < 2) {
        els.results.innerHTML = "<div class=\"hint\">Type at least 2 letters to search.</div>";
        return;
      }
      searchTimer = setTimeout(function () { doSearch(q); }, 300);
    });

    restore();
    els.methodSelect.value = state.method;

    if (state.loc && state.loc.lat != null) {
      load();
    } else {
      locate();
    }
  });
})();
