/**
 * Compiles a theme token document (see file-server/models/theme.model.js)
 * into the CSS custom-property contract the component library consumes,
 * scoped under `.theme-<className>`. Derived values (accents, shadows,
 * code editor palette) follow the same conventions as the built-in themes.
 *
 * Every theme has a light and a dark variant. The document holds one of them
 * (`darkMode` says which); the other comes from `tokens.other` or is balanced
 * from the first by `oppositeColors`. <body data-mode> picks the one shown.
 */

import { getFontFamily, ensureFontsLoaded } from './font.registry.js';

const mix = (a, pct, b = 'transparent') => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

// ---------------------------------------------------------------------------
// Colour maths: contrast (WCAG) and OKLCH, for #rrggbb colours
// ---------------------------------------------------------------------------
const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
const rgbOf = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
const hexOf = (rgb) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gamma = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

const luminance = (hex) => {
    const [r, g, b] = rgbOf(hex).map(linear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
};

/** `share` of colour a (0 to 1) over colour b */
export const blend = (a, b, share) => {
    const [x, y] = [rgbOf(a), rgbOf(b)];
    return hexOf(x.map((v, i) => v * share + y[i] * (1 - share)));
};

const oklchOf = (hex) => {
    const [r, g, b] = rgbOf(hex).map(linear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(A, B), H: Math.atan2(B, A) };
};

const fromOklch = (L, C, H) => {
    for (let chroma = C; ; chroma -= 0.005) {
        const c = Math.max(0, chroma);
        const [A, B] = [c * Math.cos(H), c * Math.sin(H)];
        const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
        const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
        const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
        const rgb = [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        ];
        if (c === 0 || rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return hexOf(rgb.map((v) => gamma(Math.max(0, v))));
    }
};

/** The colour moved step by step toward `toward` until it reads on every fill */
const readable = (color, fills, toward, target) => {
    for (let share = 1; share >= 0; share -= 0.04) {
        const tried = blend(color, toward, share);
        if (fills.every((fill) => contrast(tried, fill) >= target)) return tried;
    }
    return toward;
};

const labelOn = (fill, choices) => {
    const ranked = [...choices, '#FFFFFF', '#111111'].filter(isHex);
    return ranked.find((choice) => contrast(choice, fill) >= 4.5) || ranked.sort((a, b) => contrast(b, fill) - contrast(a, fill))[0];
};

/**
 * The other variant of a palette, balanced by eye's lightness (OKLCH): grounds keep the theme's hue at a low
 * colourfulness, cards sit one step off the page, and the brand colours keep their hue but move to a lightness
 * that reads on the new ground, a little less colourful on dark so they do not glare.
 */
export const oppositeColors = (colors, dark) => {
    if (![colors.background, colors.surface, colors.text, colors.primary, colors.secondary].every(isHex)) return null;
    const grounds = [colors.background, colors.surfaceAccent, colors.surface].filter(isHex).map(oklchOf);
    const ground = grounds.sort((a, b) => b.C - a.C)[0];
    const hue = ground.C > 0.012 ? ground.H : oklchOf(colors.text).C > 0.02 ? oklchOf(colors.text).H : oklchOf(colors.primary).H;
    const tint = Math.min(0.05, Math.max(ground.C, 0.006));
    const at = (L, C) => fromOklch(L, C, hue);
    const brand = (color) => {
        if (!isHex(color)) return color;
        const { L, C, H } = oklchOf(color);
        if (dark) return fromOklch(Math.min(0.62, Math.max(0.4, Math.min(L, 0.52))), C, H);
        return fromOklch(Math.max(0.74, Math.min(L, 0.86)), Math.min(C, 0.17), H);
    };
    const shared = {
        primary: brand(colors.primary), primaryAccent: brand(colors.primaryAccent || colors.primary),
        secondary: brand(colors.secondary), secondaryAccent: brand(colors.secondaryAccent || colors.secondary),
        tertiary: brand(colors.tertiary || colors.primary), tertiaryAccent: brand(colors.tertiaryAccent || colors.tertiary || colors.primary),
        success: brand(colors.success || '#10b981'), warning: brand(colors.warning || '#f59e0b'), error: brand(colors.error || '#dc2626')
    };
    return dark
        ? { ...shared, background: at(0.955, Math.min(tint, 0.032)), surface: at(0.99, Math.min(tint * 0.3, 0.01)), surfaceAccent: at(0.915, Math.min(tint * 1.2, 0.055)), border: at(0.86, Math.min(tint, 0.03)), text: at(0.28, Math.min(tint * 1.2, 0.06)), textContrast: '#FFFFFF', shadow: 'rgba(0, 0, 0, 0.12)' }
        : { ...shared, background: at(0.19, tint * 0.7), surface: at(0.25, tint * 0.85), surfaceAccent: at(0.33, tint), border: at(0.42, tint), text: at(0.945, Math.min(tint, 0.02)), textContrast: at(0.17, tint * 0.6), shadow: 'rgba(0, 0, 0, 0.4)' };
};

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/** The part of the contract that differs between a theme's two variants */
export const colorVars = (c, dark) => {
    const tertiary = c.tertiary || c.primaryAccent || c.primary;
    const neutral = c.neutral || mix(c.text, 60, c.background);
    const border = c.border || mix(c.text, 20, c.background);
    const surfaceAccent = c.surfaceAccent || mix(c.surface, 80, dark ? '#ffffff' : '#000000');
    const shadow = c.shadow || (dark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)');
    const success = c.success || '#10b981';
    const warning = c.warning || '#f59e0b';
    const error = c.error || '#dc2626';

    const fills = [c.background, c.surface, surfaceAccent].filter(isHex);
    const solid = fills.length > 1 && isHex(c.text);
    const tinted = (color) => (isHex(color) ? [...fills, blend(color, c.surface, 0.18)] : fills);
    const ink = (color) => (solid && isHex(color) ? readable(color, tinted(color), c.text, 4.5) : color);
    const label = (fill) => (isHex(fill) ? labelOn(fill, [c.textContrast, c.text]) : c.textContrast);
    const muted = solid ? readable(blend(c.text, c.background, 0.62), fills, c.text, 4.5) : mix(c.text, 70, c.background);
    const edge = solid ? readable(blend(c.text, c.surface, 0.34), [c.surface, c.background], c.text, 3) : border;

    return `
    color-scheme: ${dark ? 'dark' : 'light'};
    --primary-color: ${c.primary};
    --primary-accent-color: ${c.primaryAccent || c.primary};
    --secondary-color: ${c.secondary};
    --secondary-accent-color: ${c.secondaryAccent || c.secondary};
    --tertiary-color: ${tertiary};
    --tertiary-accent-color: ${c.tertiaryAccent || tertiary};
    --neutral-color: ${neutral};
    --neutral-accent-color: ${c.neutralAccent || neutral};
    --success-color: ${success};
    --success-accent-color: ${mix(success, 80, '#000000')};
    --warning-color: ${warning};
    --warning-accent-color: ${mix(warning, 80, '#000000')};
    --error-color: ${error};
    --error-accent-color: ${mix(error, 80, '#000000')};
    --background-color: ${c.background};
    --surface-color: ${c.surface};
    --surface-accent-color: ${surfaceAccent};
    --border-color: ${border};
    --border-light: ${mix(border, 50, c.background)};
    --control-border-color: ${edge};
    --text-color: ${c.text};
    --text-contrast-color: ${c.textContrast};
    --text-muted: ${muted};
    --primary-text-color: ${ink(c.primary)};
    --secondary-text-color: ${ink(c.secondary)};
    --tertiary-text-color: ${ink(tertiary)};
    --success-text-color: ${ink(success)};
    --warning-text-color: ${ink(warning)};
    --error-text-color: ${ink(error)};
    --primary-contrast-color: ${label(c.primary)};
    --secondary-contrast-color: ${label(c.secondary)};
    --tertiary-contrast-color: ${label(tertiary)};
    --success-contrast-color: ${label(success)};
    --warning-contrast-color: ${label(warning)};
    --error-contrast-color: ${label(error)};
    --focus-ring-color: ${ink(c.primary)};
    --backdrop-color: ${mix(c.background, 30, 'rgba(0, 0, 0, 0.55)')};

    --shadow-color: ${shadow};
    --shadow-color-hover: ${shadow};
    --shadow-sm: 0 1px 2px ${shadow};
    --shadow-md: 0 6px 16px -6px ${shadow};
    --shadow-lg: 0 14px 28px -10px ${shadow};
    --shadow-xl: 0 22px 44px -14px ${shadow};

    --code-background: ${dark ? mix(c.background, 85, '#000000') : mix(c.surface, 60, '#ffffff')};
    --code-foreground: ${c.text};
    --code-gutter: ${surfaceAccent};
    --code-line-number: ${muted};
    --code-line-highlight: ${mix(c.primary, 10)};
    --code-selection: ${mix(c.primary, 25)};
    --code-cursor: ${c.primary};
    --code-keyword: ${ink(c.primary)};
    --code-string: ${ink(success)};
    --code-number: ${ink(warning)};
    --code-comment: ${muted};
    --code-function: ${ink(c.secondary)};
    --code-variable: ${c.text};
    --code-operator: ${ink(tertiary)};
    --code-type: ${ink(c.tertiaryAccent || tertiary)};`;
};

export const modeSelector = (className, mode) => `body[data-mode="${mode}"] .theme-${className}, body[data-mode="${mode}"].theme-${className}`;

export const compileThemeTokens = (tokens, className) => {
    const c = tokens.colors || {};
    const f = tokens.fonts || {};
    const r = tokens.radii || {};
    const dark = !!tokens.darkMode;
    const other = tokens.other || oppositeColors(c, dark);

    const fontPrimary = getFontFamily(f.primary);
    const fontSecondary = getFontFamily(f.secondary, fontPrimary);
    const fontMono = getFontFamily(f.monospace, "'JetBrains Mono', monospace");

    const weights = ['light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'];
    const weightVariants = (name, family) => weights.map(w => `--font-family-${name}-${w}: ${family};`).join('\n    ');

    const vars = `${colorVars(c, dark)}

    --font-family: ${fontPrimary};
    ${weights.map(w => `--font-family-${w}: ${fontPrimary};`).join('\n    ')}
    --font-family-primary: ${fontPrimary};
    ${weightVariants('primary', fontPrimary)}
    --font-family-secondary: ${fontSecondary};
    ${weightVariants('secondary', fontSecondary)}
    --font-family-monospace: ${fontMono};
    --font-family-mono: ${fontMono};
    --font-family-code: ${fontMono};
    --font-weight-light: 300;
    --font-weight-regular: 400;
    --font-weight-medium: 500;
    --font-weight-semi-bold: 600;
    --font-weight-bold: 700;
    --font-weight-extra-bold: 800;
    --font-weight-black: 900;

    --border-radius: ${r.base ?? '0.375rem'};
    --card-radius: ${r.card ?? '0.5rem'};
    --input-radius: ${r.input ?? r.base ?? '0.375rem'};
    --button-radius: ${r.button ?? r.base ?? '0.375rem'};
    --checkbox-radius: ${r.checkbox ?? '0.25rem'};
    --fab-radius: ${r.fab ?? '50%'};
    --progress-radius: ${r.progress ?? '9999px'};
    --notification-radius: ${r.notification ?? r.card ?? '0.5rem'};
    ${Object.entries(tokens.effects || {}).map(([name, value]) => `--${name}: ${value};`).join('\n    ')}`;

    return `.theme-${className} {${vars}\n}\nbody.theme-${className} {\n    background-color: var(--background-color);\n    color: var(--text-color);\n    font-family: ${fontPrimary};\n}`
        + (other ? `\n${modeSelector(className, dark ? 'light' : 'dark')} {${colorVars(other, !dark)}\n}` : '');
};

/** Put compiled CSS in its own <style>, replacing what that id held */
const putStyle = (id, css) => {
    let styleEl = document.getElementById(id);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = id;
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
};

const STYLE_ID = 'fsone-custom-theme';

/** Inject (or replace) the compiled CSS for a custom theme and load its fonts */
export const injectCustomTheme = (themeDoc) => {
    const className = customThemeClass(themeDoc);
    putStyle(STYLE_ID, compileThemeTokens(themeDoc.tokens, className));
    ensureFontsLoaded(Object.values(themeDoc.tokens?.fonts || {}));
    return className;
};

/** Inject a list of built-in theme documents; a theme's fonts load when it is first used */
export const injectThemes = (docs) => putStyle('built-in-themes', docs.map((doc) => compileThemeTokens(doc.tokens, doc.slug)).join('\n'));

export const loadThemeFonts = (doc) => ensureFontsLoaded(Object.values(doc?.tokens?.fonts || {}));

export const removeCustomTheme = () => {
    document.getElementById(STYLE_ID)?.remove();
};

/** The theme class slug used for an applied custom theme */
export const customThemeClass = (themeDoc) => `custom-${themeDoc.slug}`;
