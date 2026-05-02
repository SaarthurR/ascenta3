(function (global) {
  const TAG_STYLES = {
    Racing: { palette: ["#dc2626", "#f97316", "#991b1b"], motif: "racing" },
    Driving: { palette: ["#0f766e", "#06b6d4", "#164e63"], motif: "driving" },
    Arcade: { palette: ["#7c3aed", "#ec4899", "#4338ca"], motif: "arcade" },
    Sports: { palette: ["#15803d", "#22c55e", "#166534"], motif: "sports" },
    Puzzle: { palette: ["#b45309", "#f59e0b", "#92400e"], motif: "puzzle" },
    Shooter: { palette: ["#991b1b", "#ef4444", "#7f1d1d"], motif: "shooter" },
    Sandbox: { palette: ["#4338ca", "#60a5fa", "#312e81"], motif: "sandbox" },
    Action: { palette: ["#be123c", "#f97316", "#7e22ce"], motif: "action" },
    Idle: { palette: ["#0f766e", "#14b8a6", "#155e75"], motif: "idle" },
    Sim: { palette: ["#334155", "#6366f1", "#0f172a"], motif: "sim" },
    Art: { palette: ["#c026d3", "#8b5cf6", "#f472b6"], motif: "art" },
    default: { palette: ["#1f2937", "#3b82f6", "#111827"], motif: "default" },
  };
  const COLORWAYS = [
    { from: "#ef4444", to: "#7f1d1d", accent: "#fca5a5" },
    { from: "#0ea5e9", to: "#1d4ed8", accent: "#93c5fd" },
    { from: "#22c55e", to: "#166534", accent: "#86efac" },
    { from: "#f97316", to: "#c2410c", accent: "#fdba74" },
    { from: "#8b5cf6", to: "#5b21b6", accent: "#c4b5fd" },
    { from: "#e11d48", to: "#9f1239", accent: "#fda4af" },
    { from: "#14b8a6", to: "#115e59", accent: "#99f6e4" },
    { from: "#eab308", to: "#a16207", accent: "#fde68a" },
    { from: "#06b6d4", to: "#0f766e", accent: "#a5f3fc" },
    { from: "#f59e0b", to: "#b45309", accent: "#fcd34d" },
    { from: "#6366f1", to: "#3730a3", accent: "#a5b4fc" },
    { from: "#10b981", to: "#047857", accent: "#6ee7b7" },
  ];

  function safeString(value) {
    return typeof value === "string" ? value : "";
  }

  function escapeText(value) {
    return safeString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hashString(value) {
    let hash = 2166136261;
    const input = safeString(value);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRng(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function hexToRgb(hex) {
    const clean = safeString(hex).replace("#", "");
    const normalized = clean.length === 3
      ? clean.split("").map((part) => part + part).join("")
      : clean.padEnd(6, "0").slice(0, 6);
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }

  function rgbToHex(rgb) {
    return `#${[rgb.r, rgb.g, rgb.b]
      .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function mixHex(first, second, amount) {
    const left = hexToRgb(first);
    const right = hexToRgb(second);
    return rgbToHex({
      r: left.r + (right.r - left.r) * amount,
      g: left.g + (right.g - left.g) * amount,
      b: left.b + (right.b - left.b) * amount,
    });
  }

  function alpha(hex, opacity) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function normalizeText(value) {
    return safeString(value)
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z0-9#]+;/gi, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function splitTokens(value) {
    return normalizeText(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function splitIdTokens(value) {
    return safeString(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function shouldPreferId(game) {
    const rawTitle = safeString(game && game.title);
    const cleanedTitle = normalizeText(rawTitle);
    const letters = cleanedTitle.match(/\p{L}/gu) || [];
    return (
      /&[a-z0-9#]+;|\$\{[^}]+\}|play it now|coolmathgames\.com/i.test(rawTitle) ||
      letters.length < 2
    );
  }

  function buildBadgeText(game) {
    if (!shouldPreferId(game)) {
      const titleTokens = splitTokens(game && game.title);
      if (titleTokens.length >= 2) {
        const left = titleTokens[0];
        const right = titleTokens[1];
        if (/^\d+$/.test(left)) {
          return (left + right.slice(0, 1)).slice(0, 3).toUpperCase();
        }
        return (left.slice(0, 1) + right.slice(0, 1)).toUpperCase();
      }
      if (titleTokens.length === 1) {
        const token = titleTokens[0];
        if (/^\d+$/.test(token)) {
          return token.slice(0, 4);
        }
        return token.slice(0, 2).toUpperCase();
      }
    }

    const idTokens = splitIdTokens(game && game.id);
    if (idTokens.length >= 2) {
      return (idTokens[0].slice(0, 1) + idTokens[1].slice(0, 1)).toUpperCase();
    }
    if (idTokens.length === 1) {
      const token = idTokens[0];
      if (/^\d+$/.test(token)) {
        return token.slice(0, 4);
      }
      return token.slice(0, 2).toUpperCase();
    }
    return "??";
  }

  function orbitDots(rand) {
    let markup = "";
    const count = 4 + Math.floor(rand() * 4);
    for (let index = 0; index < count; index += 1) {
      const cx = 14 + rand() * 92;
      const cy = 14 + rand() * 92;
      const radius = 1.5 + rand() * 4.5;
      markup += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="#fff" opacity="${(0.14 + rand() * 0.28).toFixed(2)}"/>`;
    }
    return markup;
  }

  function sweepLines(rand) {
    const y1 = 22 + rand() * 18;
    const y2 = 84 - rand() * 18;
    const x = 18 + rand() * 12;
    return `<path d="M${x.toFixed(1)} ${y1.toFixed(1)} H${(104 - x).toFixed(1)}" stroke="#fff" stroke-width="2" opacity="0.18" stroke-dasharray="5 7"/>
<path d="M${(x + 8).toFixed(1)} ${y2.toFixed(1)} H${(96 - x).toFixed(1)}" stroke="#fff" stroke-width="2" opacity="0.14" stroke-dasharray="8 9"/>`;
  }

  function badgeBlock(text, fill) {
    const width = Math.max(24, 16 + text.length * 10);
    return `<g transform="translate(${104 - width} 86)">
  <rect width="${width}" height="20" rx="10" fill="${fill}" opacity="0.88"/>
  <text x="${width / 2}" y="14" text-anchor="middle" font-size="${text.length > 3 ? 10 : 11}" font-weight="700" letter-spacing="0.12em" fill="#fff">${escapeText(text)}</text>
</g>`;
  }

  function drawRacing(rand) {
    const lean = -6 + rand() * 12;
    return `<g transform="rotate(${lean.toFixed(2)} 60 60)">
  <path d="M46 16 L74 16 L84 104 L56 104 Z" fill="#fff" opacity="0.92"/>
  <path d="M60 22 V98" stroke="#0a0a0f" stroke-width="3" opacity="0.28" stroke-dasharray="7 8"/>
  <path d="M50 32 L58 96" stroke="#0a0a0f" stroke-width="1.8" opacity="0.16"/>
  <path d="M70 32 L62 96" stroke="#0a0a0f" stroke-width="1.8" opacity="0.16"/>
</g>
<circle cx="38" cy="84" r="8" fill="#fff" opacity="0.32"/>
<circle cx="82" cy="84" r="8" fill="#fff" opacity="0.32"/>`;
  }

  function drawDriving(rand) {
    const rise = 42 + rand() * 10;
    return `<path d="M24 ${rise.toFixed(1)} H96" stroke="#fff" stroke-width="2.5" opacity="0.18" stroke-dasharray="7 9"/>
<path d="M30 72 L42 54 H78 L92 72 L84 82 H38 Z" fill="#fff" opacity="0.92"/>
<path d="M46 54 L54 42 H70 L78 54 Z" fill="#fff" opacity="0.74"/>
<circle cx="44" cy="84" r="8" fill="#fff" opacity="0.92"/>
<circle cx="80" cy="84" r="8" fill="#fff" opacity="0.92"/>`;
  }

  function drawArcade(rand) {
    const offset = 34 + rand() * 12;
    return `<rect x="${offset.toFixed(1)}" y="28" width="24" height="24" rx="4" fill="#fff" opacity="0.92" transform="rotate(45 60 40)"/>
<path d="M16 84 L34 66 L50 82 L70 62 L90 82 L104 68" stroke="#fff" stroke-width="3.5" fill="none" opacity="0.72"/>
<rect x="24" y="26" width="10" height="10" rx="2" fill="#fff" opacity="0.35"/>
<rect x="86" y="30" width="8" height="8" rx="2" fill="#fff" opacity="0.28"/>`;
  }

  function drawSports(rand) {
    const variant = Math.floor(rand() * 2);
    if (variant === 0) {
      return `<circle cx="60" cy="58" r="28" stroke="#fff" stroke-width="4" opacity="0.92"/>
<path d="M32 58 H88" stroke="#fff" stroke-width="3" opacity="0.9"/>
<path d="M60 30 V86" stroke="#fff" stroke-width="3" opacity="0.9"/>
<path d="M40 40 C72 48, 72 68, 40 78" stroke="#fff" stroke-width="3" fill="none" opacity="0.72"/>
<path d="M80 40 C48 48, 48 68, 80 78" stroke="#fff" stroke-width="3" fill="none" opacity="0.72"/>`;
    }
    return `<ellipse cx="60" cy="58" rx="30" ry="20" fill="#fff" opacity="0.92" transform="rotate(-18 60 58)"/>
<path d="M40 58 H80" stroke="#0a0a0f" stroke-width="4" opacity="0.9" transform="rotate(-18 60 58)"/>
<path d="M49 48 V68" stroke="#0a0a0f" stroke-width="2" opacity="0.72" transform="rotate(-18 49 58)"/>
<path d="M60 44 V72" stroke="#0a0a0f" stroke-width="2" opacity="0.72" transform="rotate(-18 60 58)"/>
<path d="M71 48 V68" stroke="#0a0a0f" stroke-width="2" opacity="0.72" transform="rotate(-18 71 58)"/>`;
  }

  function drawPuzzle(rand) {
    const gap = 6 + rand() * 4;
    return `<rect x="20" y="24" width="34" height="34" rx="9" fill="#fff" opacity="0.9"/>
<rect x="${(60 + gap).toFixed(1)}" y="24" width="34" height="34" rx="9" fill="#fff" opacity="0.72"/>
<rect x="20" y="${(60 + gap).toFixed(1)}" width="34" height="34" rx="9" fill="#fff" opacity="0.72"/>
<rect x="${(60 + gap).toFixed(1)}" y="${(60 + gap).toFixed(1)}" width="34" height="34" rx="9" fill="#fff" opacity="0.9"/>
<circle cx="54" cy="41" r="5" fill="#fff" opacity="0.9"/>
<circle cx="79" cy="60" r="5" fill="#fff" opacity="0.9"/>`;
  }

  function drawShooter(rand) {
    const radius = 22 + rand() * 8;
    return `<circle cx="60" cy="58" r="${radius.toFixed(1)}" stroke="#fff" stroke-width="3.5" opacity="0.9"/>
<circle cx="60" cy="58" r="4.5" fill="#fff" opacity="0.95"/>
<path d="M60 18 V38" stroke="#fff" stroke-width="3" opacity="0.9"/>
<path d="M60 78 V98" stroke="#fff" stroke-width="3" opacity="0.9"/>
<path d="M20 58 H40" stroke="#fff" stroke-width="3" opacity="0.9"/>
<path d="M80 58 H100" stroke="#fff" stroke-width="3" opacity="0.9"/>
<path d="M30 88 L90 28" stroke="#fff" stroke-width="2.5" opacity="0.26"/>`;
  }

  function drawSandbox(rand) {
    const lift = 18 + rand() * 8;
    return `<rect x="24" y="${lift.toFixed(1)}" width="72" height="58" rx="10" fill="#fff" opacity="0.9"/>
<rect x="24" y="${lift.toFixed(1)}" width="72" height="18" rx="10" fill="#0a0a0f" opacity="0.16"/>
<path d="M38 ${(lift + 26).toFixed(1)} H52 V${(lift + 40).toFixed(1)} H38 Z" fill="#0a0a0f" opacity="0.12"/>
<path d="M56 ${(lift + 34).toFixed(1)} H72 V${(lift + 48).toFixed(1)} H56 Z" fill="#0a0a0f" opacity="0.1"/>
<path d="M74 ${(lift + 20).toFixed(1)} L92 ${(lift + 32).toFixed(1)}" stroke="#fff" stroke-width="4" opacity="0.88"/>`;
  }

  function drawAction(rand) {
    const slash = 18 + rand() * 6;
    return `<path d="M${slash.toFixed(1)} 84 L52 26 L68 26 L102 84 L84 84 L72 64 L48 64 L36 84 Z" fill="#fff" opacity="0.9"/>
<path d="M50 58 H70" stroke="#0a0a0f" stroke-width="3" opacity="0.18"/>
<path d="M26 34 L44 46" stroke="#fff" stroke-width="3" opacity="0.34"/>
<path d="M78 72 L98 86" stroke="#fff" stroke-width="3" opacity="0.34"/>`;
  }

  function drawIdle(rand) {
    const bars = [
      70 - rand() * 8,
      58 - rand() * 6,
      46 - rand() * 10,
    ];
    return `<circle cx="44" cy="44" r="14" fill="#fff" opacity="0.92"/>
<circle cx="60" cy="56" r="14" fill="#fff" opacity="0.76"/>
<circle cx="76" cy="68" r="14" fill="#fff" opacity="0.56"/>
<rect x="26" y="${bars[0].toFixed(1)}" width="8" height="${(94 - bars[0]).toFixed(1)}" rx="4" fill="#fff" opacity="0.38"/>
<rect x="90" y="${bars[2].toFixed(1)}" width="8" height="${(94 - bars[2]).toFixed(1)}" rx="4" fill="#fff" opacity="0.28"/>`;
  }

  function drawSim(rand) {
    const rows = 3 + Math.floor(rand() * 2);
    let sliders = "";
    for (let index = 0; index < rows; index += 1) {
      const y = 40 + index * 14;
      const knob = 46 + rand() * 36;
      sliders += `<path d="M34 ${y} H86" stroke="#0a0a0f" stroke-width="2.2" opacity="0.2"/>
<circle cx="${knob.toFixed(1)}" cy="${y}" r="4.5" fill="#fff" opacity="0.92"/>`;
    }
    return `<rect x="24" y="26" width="72" height="64" rx="10" fill="#fff" opacity="0.9"/>
<rect x="24" y="26" width="72" height="14" rx="10" fill="#0a0a0f" opacity="0.16"/>
${sliders}`;
  }

  function drawArt(rand) {
    const one = 24 + rand() * 12;
    const two = 22 + rand() * 12;
    return `<path d="M20 72 C${one.toFixed(1)} 34, 82 34, 100 72" stroke="#fff" stroke-width="4" opacity="0.72" fill="none"/>
<path d="M20 48 C40 88, 78 88, 100 48" stroke="#fff" stroke-width="3" opacity="0.54" fill="none"/>
<path d="M20 92 C42 60, ${two.toFixed(1)} 60, 100 92" stroke="#fff" stroke-width="2.2" opacity="0.34" fill="none"/>
<circle cx="60" cy="60" r="10" fill="#fff" opacity="0.88"/>
<circle cx="60" cy="60" r="18" fill="#fff" opacity="0.24"/>`;
  }

  function drawDefault(rand) {
    const angle = rand() * 360;
    return `<rect x="26" y="26" width="68" height="68" rx="18" fill="#fff" opacity="0.9" transform="rotate(${angle.toFixed(1)} 60 60)"/>
<circle cx="60" cy="60" r="20" fill="#0a0a0f" opacity="0.12"/>`;
  }

  const motifByName = {
    racing: drawRacing,
    driving: drawDriving,
    arcade: drawArcade,
    sports: drawSports,
    puzzle: drawPuzzle,
    shooter: drawShooter,
    sandbox: drawSandbox,
    action: drawAction,
    idle: drawIdle,
    sim: drawSim,
    art: drawArt,
    default: drawDefault,
  };

  function pickColorSlot(game, seed) {
    if (typeof (game && game._catalogIndex) === "number") {
      return positiveModulo((game._catalogIndex * 7) + 3, COLORWAYS.length);
    }
    return positiveModulo(seed, COLORWAYS.length);
  }

  function pickColors(game, style, rand, seed) {
    const palette = style.palette;
    const slot = pickColorSlot(game, seed);
    const colorway = COLORWAYS[slot];
    const base = palette[Math.floor(rand() * palette.length)];
    const secondary = palette[Math.floor(rand() * palette.length)];
    const tertiary = palette[Math.floor(rand() * palette.length)];
    return {
      slot,
      from: mixHex(colorway.from, base, 0.16 + rand() * 0.1),
      to: mixHex(colorway.to, secondary, 0.2 + rand() * 0.1),
      accent: mixHex(colorway.accent, tertiary, 0.18 + rand() * 0.12),
    };
  }

  function generateGameArt(game) {
    const style = TAG_STYLES[game && game.tag] || TAG_STYLES.default;
    const seed = hashString(`${safeString(game && game.id)}|${safeString(game && game.title)}|${safeString(game && game.tag)}`);
    const rand = createRng(seed);
    const badge = buildBadgeText(game);
    const colors = pickColors(game, style, rand, seed);
    const motif = motifByName[style.motif] || motifByName.default;
    const badgeFill = alpha(colors.accent, 0.85);
    return {
      bg: `linear-gradient(135deg,${colors.from},${colors.to})`,
      svg: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="artGlow-${seed}" x1="18" y1="18" x2="102" y2="102" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${alpha("#ffffff", 0.34)}"/>
      <stop offset="100%" stop-color="${alpha(colors.accent, 0.05)}"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="100" height="100" rx="24" fill="url(#artGlow-${seed})" opacity="0.9"/>
  ${orbitDots(rand)}
  ${sweepLines(rand)}
  ${motif(rand)}
  ${badgeBlock(badge, badgeFill)}
</svg>`,
    };
  }

  global.ASCENTA_GENERATED_ART = {
    buildBadgeText,
    generateGameArt,
    pickColorSlot,
  };
})(typeof window !== "undefined" ? window : globalThis);
