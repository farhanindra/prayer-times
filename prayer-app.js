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

  /* ---------- IZA Aachen API ---------- */
  // Fetches prayer times from the IZA Aachen endpoint (full year, cached locally).
  // Endpoint: POST https://prayer-times-api.izaachen.de/json

  var IZA_API_URL = "https://prayer-times-api.izaachen.de/json";

  function izaGetStandardOffset(tz) {
    // Derive the standard (non-DST) UTC offset from a timezone string.
    // Use January 1 which is always standard time in the northern hemisphere.
    try {
      var jan = new Date(2026, 0, 1, 12, 0, 0);
      var utcStr = jan.toLocaleString("en-US", { timeZone: "UTC" });
      var tzStr = jan.toLocaleString("en-US", { timeZone: tz });
      return Math.round((new Date(tzStr) - new Date(utcStr)) / 3600000);
    } catch (e) {
      return 1; // default CET
    }
  }

  function izaObservesDST(tz) {
    // Check if a timezone observes DST by comparing Jan and Jul offsets.
    try {
      var jan = new Date(2026, 0, 1, 12, 0, 0);
      var jul = new Date(2026, 6, 1, 12, 0, 0);
      var utcJan = jan.toLocaleString("en-US", { timeZone: "UTC" });
      var tzJan = jan.toLocaleString("en-US", { timeZone: tz });
      var utcJul = jul.toLocaleString("en-US", { timeZone: "UTC" });
      var tzJul = jul.toLocaleString("en-US", { timeZone: tz });
      var offJan = (new Date(tzJan) - new Date(utcJan)) / 3600000;
      var offJul = (new Date(tzJul) - new Date(utcJul)) / 3600000;
      return offJan !== offJul;
    } catch (e) {
      return true;
    }
  }

  function izaCacheKey(year, lat, lng) {
    return "iza_api:" + year + ":" + lat.toFixed(4) + ":" + lng.toFixed(4);
  }

  function izaGetCachedYear(year, lat, lng) {
    try {
      var key = izaCacheKey(year, lat, lng);
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function izaSetCachedYear(year, lat, lng, data) {
    try {
      var key = izaCacheKey(year, lat, lng);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { /* storage full or unavailable */ }
  }

  function izaFetchYear(year, lat, lng, tz, cityLabel) {
    var gmtDiff = izaGetStandardOffset(tz);
    var dst = izaObservesDST(tz);
    var body = {
      taqdir_method: "new_method",
      natural_motion_alignment_interpolation: true,
      longest_day_check: true,
      city: cityLabel || "City",
      dst_deviation: dst,
      fajr_no_taqdir: false,
      gmt_diff_hours: gmtDiff,
      latitude: lat,
      longitude: lng,
      observer_dst: dst,
      year: year
    };
    return fetch(IZA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("IZA API error " + r.status);
      return r.json();
    }).then(function (json) {
      if (!json.times) throw new Error("IZA API: no times in response");
      // Normalize into a flat lookup: { "YYYY-MM-DD": { Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha } }
      var lookup = {};
      for (var monthKey in json.times) {
        var month = parseInt(monthKey, 10);
        var days = json.times[monthKey];
        for (var dayKey in days) {
          var day = parseInt(dayKey, 10);
          var d = days[dayKey];
          var dateStr = year + "-" + (month < 10 ? "0" + month : month) + "-" + (day < 10 ? "0" + day : day);
          // The API returns times in standard (non-DST) timezone.
          // We need to add the DST offset for dates within the DST period.
          var dstExtra = 0;
          if (dst) {
            dstExtra = izaIsDST(year, month, day, tz) ? 60 : 0;
          }
          lookup[dateStr] = {
            Fajr: izaAddMinutes(d.p1.t, dstExtra),
            Sunrise: izaAddMinutes(d.p2.t, dstExtra),
            Dhuhr: izaAddMinutes(d.p3.t, dstExtra),
            Asr: izaAddMinutes(d.p4.t, dstExtra),
            Maghrib: izaAddMinutes(d.p5.t, dstExtra),
            Isha: izaAddMinutes(d.p6.t, dstExtra)
          };
        }
      }
      izaSetCachedYear(year, lat, lng, lookup);
      return lookup;
    });
  }

  function izaIsDST(year, month, day, tz) {
    // Check if a specific date is in DST by comparing its offset to the January offset
    try {
      var jan = new Date(year, 0, 1, 12, 0, 0);
      var target = new Date(year, month - 1, day, 12, 0, 0);
      var utcJan = jan.toLocaleString("en-US", { timeZone: "UTC" });
      var tzJan = jan.toLocaleString("en-US", { timeZone: tz });
      var offJan = (new Date(tzJan) - new Date(utcJan)) / 3600000;
      var utcTarget = target.toLocaleString("en-US", { timeZone: "UTC" });
      var tzTarget = target.toLocaleString("en-US", { timeZone: tz });
      var offTarget = (new Date(tzTarget) - new Date(utcTarget)) / 3600000;
      return offTarget > offJan;
    } catch (e) {
      return false;
    }
  }

  function izaAddMinutes(hhmm, minutes) {
    if (!minutes) return hhmm;
    var parts = hhmm.split(":");
    var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + minutes;
    if (total < 0) total += 1440;
    total = total % 1440;
    var hh = Math.floor(total / 60);
    var mm = total % 60;
    return (hh < 10 ? "0" + hh : "" + hh) + ":" + (mm < 10 ? "0" + mm : "" + mm);
  }

  // In-memory store for the current year's IZA data
  var izaYearCache = null;
  var izaYearCacheKey = "";

  function izaGetDay(dateYMD, lat, lng, tz, cityLabel) {
    var parts = dateYMD.split("-");
    var year = parseInt(parts[0], 10);
    var cacheId = izaCacheKey(year, lat, lng);

    // Check in-memory cache first
    if (izaYearCache && izaYearCacheKey === cacheId) {
      var timings = izaYearCache[dateYMD];
      if (timings) return Promise.resolve({ dateStr: dateYMD, timings: timings });
    }

    // Check localStorage cache
    var cached = izaGetCachedYear(year, lat, lng);
    if (cached) {
      izaYearCache = cached;
      izaYearCacheKey = cacheId;
      var timings = cached[dateYMD];
      if (timings) return Promise.resolve({ dateStr: dateYMD, timings: timings });
    }

    // Fetch from API
    return izaFetchYear(year, lat, lng, tz, cityLabel).then(function (lookup) {
      izaYearCache = lookup;
      izaYearCacheKey = cacheId;
      var timings = lookup[dateYMD];
      if (!timings) throw new Error("IZA API: date " + dateYMD + " not found in response");
      return { dateStr: dateYMD, timings: timings };
    });
  }

  var METHODS = [
    { id: "iza", label: "Islamic Center Aachen (IZA)", desc: "Fajr −18°, Isha −17°, astronomical night-third method (via IZA API)." },
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
    TR: "13", DE: "iza", US: "2", CA: "2",
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
   "dateLine", "times",
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
    // IZA method: fetch from IZA Aachen API (full year cached)
    if (state.method === "iza") {
      var tz = state.loc.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      return izaGetDay(dateYMD, state.loc.lat, state.loc.lng, tz, state.loc.label);
    }

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
      if (state.method !== "iza") prefetchWeek(tz);
    }).catch(function (e) {
      showStatus("Couldn’t load prayer times", "Please check your connection and try again.", [
        { label: "Retry", primary: true, onClick: load },
        { label: "Change city", onClick: openSheet }
      ]);
    });
  }

  function prefetchWeek(tz) {
    // Silently pre-fetch days 2–7 so they're cached for offline use.
    // Days 0 and 1 are already fetched by load().
    for (var d = 2; d <= 7; d++) {
      var dateStr = tzDateStr(tz, d);
      var p = dateStr.split("-");
      var ddmmyyyy = p[2] + "-" + p[1] + "-" + p[0];
      var url = "https://api.aladhan.com/v1/timings/" + ddmmyyyy +
        "?latitude=" + state.loc.lat + "&longitude=" + state.loc.lng +
        "&method=" + state.method;
      fetch(url).catch(function () {});
    }
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
      // after Isha, before midnight → no countdown, day is complete
      current = "Isha";
      next = { key: null, secs: 0, at: null };
      prevTime = null;
    } else if (next.key === "Fajr") {
      // between midnight and Fajr → countdown to Fajr
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
    els.methodSelect.value = state.method;
  }

  function buildGearPopover() {
    var pop = $("gearPopover");
    pop.innerHTML = "";
    var s = suggestedMethod();
    METHODS.forEach(function (m) {
      var b = document.createElement("button");
      b.className = "gear-item" + (m.id === state.method ? " active" : "");
      var name = document.createElement("span");
      name.className = "gear-item-name";
      name.textContent = m.label;
      if (s && s.method && s.method.id === m.id && m.id !== state.method) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Suggested";
        name.appendChild(tag);
      }
      b.appendChild(name);
      b.addEventListener("click", function () {
        state.method = m.id;
        els.methodSelect.value = m.id;
        dismissSuggestion();
        save();
        closeGearPopover();
        load();
      });
      pop.appendChild(b);
    });
  }

  function openGearPopover() {
    buildGearPopover();
    $("gearPopover").classList.add("open");
    $("gearBtn").classList.add("active");
  }

  function closeGearPopover() {
    $("gearPopover").classList.remove("open");
    $("gearBtn").classList.remove("active");
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
  }

  function maybeSuggest() { }

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

  /* ---------- qibla compass ---------- */
  function calcQiblaBearing(lat, lng) {
    // Great-circle bearing from user's position to Mecca (21.4225, 39.8262)
    var mLat = 21.4225 * Math.PI / 180;
    var mLng = 39.8262 * Math.PI / 180;
    var uLat = lat * Math.PI / 180;
    var uLng = lng * Math.PI / 180;
    var dLng = mLng - uLng;
    var x = Math.sin(dLng) * Math.cos(mLat);
    var y = Math.cos(uLat) * Math.sin(mLat) - Math.sin(uLat) * Math.cos(mLat) * Math.cos(dLng);
    var bearing = Math.atan2(x, y) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  function cardinalDir(deg) {
    var dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
  }

  var qiblaState = {
    bearing: null,
    heading: null,
    watching: false,
    permissionGranted: false
  };

  function showQiblaView() {
    $("main").style.display = "none";
    $("qiblaView").style.display = "flex";
    if (state.loc) {
      qiblaState.bearing = calcQiblaBearing(state.loc.lat, state.loc.lng);
      $("qiblaDegrees").textContent = Math.round(qiblaState.bearing) + "° " + cardinalDir(qiblaState.bearing);
    }
    initCompassTicks();
    startCompass();
  }

  function hideQiblaView() {
    $("qiblaView").style.display = "none";
    $("main").style.display = "flex";
    stopCompass();
  }

  function initCompassTicks() {
    var ticks = $("compassTicks");
    if (ticks.children.length > 0) return;
    for (var i = 0; i < 72; i++) {
      var angle = i * 5;
      var isMajor = angle % 30 === 0;
      var len = isMajor ? 10 : 5;
      var r1 = 140 - len;
      var r2 = 140;
      var rad = angle * Math.PI / 180;
      var x1 = 150 + r1 * Math.sin(rad);
      var y1 = 150 - r1 * Math.cos(rad);
      var x2 = 150 + r2 * Math.sin(rad);
      var y2 = 150 - r2 * Math.cos(rad);
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", isMajor ? "var(--muted)" : "var(--line)");
      line.setAttribute("stroke-width", isMajor ? "1.5" : "1");
      ticks.appendChild(line);
    }
  }

  function startCompass() {
    var hint = $("qiblaHint");
    var btn = $("qiblaEnableBtn");

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      // iOS — needs user gesture to request permission
      if (!qiblaState.permissionGranted) {
        hint.textContent = "Compass access is needed to show the Qibla direction.";
        btn.style.display = "inline-block";
        btn.onclick = function () {
          DeviceOrientationEvent.requestPermission().then(function (perm) {
            if (perm === "granted") {
              qiblaState.permissionGranted = true;
              btn.style.display = "none";
              hint.textContent = "Point your phone to find the Qibla direction.";
              listenOrientation();
            } else {
              hint.textContent = "Permission denied. Enable in Settings > Safari.";
            }
          }).catch(function () {
            hint.textContent = "Could not request compass permission.";
          });
        };
      } else {
        btn.style.display = "none";
        hint.textContent = "Point your phone to find the Qibla direction.";
        listenOrientation();
      }
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      // Android / non-iOS — no permission needed
      hint.textContent = "Point your phone to find the Qibla direction.";
      btn.style.display = "none";
      listenOrientation();
    } else {
      hint.textContent = "Compass not supported on this device.";
      btn.style.display = "none";
    }
  }

  function listenOrientation() {
    if (qiblaState.watching) return;
    qiblaState.watching = true;
    window.addEventListener("deviceorientation", onOrientation);
  }

  function stopCompass() {
    if (qiblaState.watching) {
      window.removeEventListener("deviceorientation", onOrientation);
      qiblaState.watching = false;
    }
  }

  function onOrientation(e) {
    var heading;
    if (e.webkitCompassHeading !== undefined) {
      // iOS: webkitCompassHeading is degrees from north (clockwise)
      heading = e.webkitCompassHeading;
    } else if (e.alpha !== null) {
      // Android: alpha is degrees counter-clockwise from north
      heading = (360 - e.alpha) % 360;
    } else {
      return;
    }
    qiblaState.heading = heading;
    updateCompassUI(heading);
  }

  function updateCompassUI(heading) {
    // Rotate the entire dial so that north aligns with real north
    var dial = $("compassDial");
    dial.style.transform = "rotate(" + (-heading) + "deg)";

    // The qibla arrow is part of the dial, so position it at the bearing angle.
    var arrow = $("qiblaArrow");
    arrow.setAttribute("transform", "rotate(" + qiblaState.bearing + " 150 150)");

    // Highlight outer ring when pointing toward Qibla (±5°)
    var diff = Math.abs(heading - qiblaState.bearing);
    if (diff > 180) diff = 360 - diff;
    var ring = $("compassRing");
    if (diff <= 5) {
      ring.setAttribute("stroke-width", "10");
      ring.setAttribute("stroke", "var(--accent)");
    } else {
      ring.setAttribute("stroke-width", "1.5");
      ring.setAttribute("stroke", "var(--line)");
    }
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildMethodSelect();

    $("compassBtn").addEventListener("click", showQiblaView);
    $("qiblaBack").addEventListener("click", hideQiblaView);

    $("locBtn").addEventListener("click", openSheet);
    $("gearBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      if ($("gearPopover").classList.contains("open")) {
        closeGearPopover();
      } else {
        openGearPopover();
      }
    });
    document.addEventListener("click", function () { closeGearPopover(); });
    $("gearPopover").addEventListener("click", function (e) { e.stopPropagation(); });
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
