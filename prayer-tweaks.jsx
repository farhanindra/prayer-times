/* Tweaks for Prayer Times — applies accent, theme tone, time format */

const PT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#5b7b66",
  "tone": "warm",
  "timeFormat": "12h"
}/*EDITMODE-END*/;

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
}

function PTTweaks() {
  const [t, setTweak] = useTweaks(PT_TWEAK_DEFAULTS);

  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", t.accent);
    if (t.tone !== "night") {
      root.style.setProperty("--accent-soft", hexToRgba(t.accent, 0.09));
    } else {
      root.style.removeProperty("--accent-soft");
    }
    root.setAttribute("data-theme", t.tone);
    window.dispatchEvent(new CustomEvent("pt-tweaks", { detail: t }));
  }, [t.accent, t.tone, t.timeFormat]);

  return (
    <TweaksPanel>
      <TweakSection label="Theme" />
      <TweakColor
        label="Accent"
        value={t.accent}
        options={["#5b7b66", "#6b7a93", "#a4694f", "#8a6d9c"]}
        onChange={(v) => setTweak("accent", v)}
      />
      <TweakRadio
        label="Tone"
        value={t.tone}
        options={["warm", "cool", "night"]}
        onChange={(v) => setTweak("tone", v)}
      />
      <TweakSection label="Display" />
      <TweakRadio
        label="Time format"
        value={t.timeFormat}
        options={["12h", "24h"]}
        onChange={(v) => setTweak("timeFormat", v)}
      />
    </TweaksPanel>
  );
}

const ptTweaksRoot = document.createElement("div");
document.body.appendChild(ptTweaksRoot);
ReactDOM.createRoot(ptTweaksRoot).render(<PTTweaks />);
