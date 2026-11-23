/**
 * Gallery themes: token documents compiled by theme.compiler.js when the app starts. Each one has its own palette,
 * typefaces, corners and effects, and a light and a dark variant (`darkMode` says which one is written here; the
 * other is written beside it or balanced from it). `effects` are extra custom properties the component styles read.
 */

const palette = (colors) => Object.fromEntries(['background', 'surface', 'surfaceAccent', 'border', 'text', 'textContrast', 'primary', 'secondary', 'tertiary', 'success', 'warning', 'error'].map((key, i) => [key, colors[i]]));

const theme = (slug, name, description, darkMode, colors, fonts, radii, effects = {}, other = null) => ({
    slug, name, description,
    tokens: {
        darkMode,
        colors: palette(colors),
        other: other && palette(other),
        fonts: { primary: fonts[0], secondary: fonts[1], monospace: fonts[2] },
        radii: { base: radii[0], card: radii[1], input: radii[2], button: radii[3], checkbox: radii[4] ?? '0.25rem', progress: radii[5] ?? '9999px', notification: radii[1], fab: radii[6] ?? '50%' },
        effects
    }
});

const wash = (...layers) => ({ 'page-ambient': layers.join(', '), 'page-ambient-size': '160% 160%', 'page-ambient-motion': 'page-ambient-drift 24s ease-in-out infinite alternate' });
const glow = (tone, size = '22px') => ({ 'card-shadow': `0 0 ${size} -8px color-mix(in srgb, var(--${tone}-color) 55%, transparent)`, 'card-shadow-hover': `0 0 34px -6px color-mix(in srgb, var(--${tone}-color) 75%, transparent)` });
const hard = (x, tone = 'text') => ({ 'card-shadow': `${x} ${x} 0 var(--${tone}-color)`, 'card-shadow-hover': `calc(${x} + 2px) calc(${x} + 2px) 0 var(--${tone}-color)` });
const tint = (tone, share) => `color-mix(in srgb, var(--${tone}-color) ${share}%, transparent)`;

export const GALLERY_THEMES = [
    theme('aurora', 'Aurora', 'Polar night with moving green and violet light', true,
        ['#071A2B', '#0E2A40', '#164059', '#1F4F6B', '#E3F6FF', '#062033', '#3DF2B0', '#A596FF', '#4FC3F7', '#4ADE94', '#FFC861', '#FF7B8A'],
        ['sora', 'syne', 'jetbrains-mono'], ['0.75rem', '1.25rem', '0.75rem', '0.75rem'],
        { ...wash(`radial-gradient(60% 50% at 15% 10%, ${tint('primary', 20)}, transparent 70%)`, `radial-gradient(55% 50% at 85% 25%, ${tint('secondary', 24)}, transparent 70%)`) }),

    theme('ember', 'Ember', 'Charcoal and firelight with tall condensed headings', true,
        ['#1A0F0C', '#2A1813', '#42261C', '#5A3426', '#FFE9DD', '#1A0F0C', '#FF7A3C', '#FFC24B', '#FF6B6B', '#8FCB6B', '#FFC24B', '#FF6F61'],
        ['barlow', 'bebas-neue', 'roboto-mono'], ['0.25rem', '0.375rem', '0.25rem', '0.25rem', '0.125rem', '0.25rem'],
        { ...wash(`radial-gradient(70% 45% at 50% 110%, ${tint('primary', 30)}, transparent 70%)`), ...glow('primary') }),

    theme('sakura', 'Sakura', 'Blossom pink, soft leaf green and gentle round type', false,
        ['#FFF5F7', '#FFFFFF', '#FDE3EA', '#F6CBD8', '#4A2333', '#FFFFFF', '#C2416B', '#2F7D5C', '#F2A7BD', '#2F7D5C', '#B7791F', '#C53030'],
        ['zen-maru-gothic', 'shippori-mincho', 'inconsolata'], ['0.875rem', '1.75rem', '0.875rem', '9999px', '0.375rem'],
        { ...wash(`radial-gradient(50% 40% at 90% 5%, ${tint('tertiary', 35)}, transparent 70%)`) }),

    theme('terminal', 'Terminal', 'Phosphor green on black, all monospace, square edges', true,
        ['#050A06', '#0B140D', '#15281B', '#235A36', '#B8FFC9', '#04140A', '#35E06B', '#E8C547', '#4FD1C5', '#35E06B', '#E8C547', '#FF6B5E'],
        ['ibm-plex-mono', 'vt323', 'ibm-plex-mono'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'page-ambient': `repeating-linear-gradient(0deg, ${tint('primary', 5)} 0 1px, transparent 1px 4px)`, ...glow('primary', '18px') }),

    theme('newsprint', 'Newsprint', 'Ink on grey paper with a red rule and serif headlines', false,
        ['#ECECE8', '#F8F8F5', '#DEDED8', '#BDBDB4', '#161616', '#F8F8F5', '#161616', '#B3151B', '#5B6470', '#22663B', '#8A5A00', '#B3151B'],
        ['source-serif', 'dm-serif-display', 'courier-prime'], ['0', '0', '0', '0', '0', '0', '0'],
        {},
        ['#151514', '#1F1F1D', '#2E2E2B', '#4A4A45', '#EFEDE6', '#151514', '#EFEDE6', '#FF6B6B', '#A9B2BD', '#7CC98A', '#E5B04D', '#FF7A7A']),

    theme('brutalist', 'Brutalist', 'Loud primaries, thick black outlines and hard shadows', false,
        ['#FFE45C', '#FFFFFF', '#FFD0E4', '#0A0A0A', '#0A0A0A', '#FFFFFF', '#2B39FF', '#E0206F', '#00A878', '#0B7A4B', '#9A5B00', '#D0021B'],
        ['space-grotesk', 'archivo-black', 'space-mono'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'edge-width': '2px', ...hard('5px') },
        ['#141414', '#1F1F1F', '#33254A', '#FFE45C', '#FFFBE6', '#0A0A0A', '#FFE45C', '#FF6FAE', '#3DE0B0', '#5FD39A', '#FFC94D', '#FF7A7A']),

    theme('lagoon', 'Lagoon', 'Clear teal water, coral and sun with rounded letters', false,
        ['#E6F9F7', '#FFFFFF', '#C5EFEA', '#9ADBD4', '#06363B', '#FFFFFF', '#007F86', '#C53D27', '#FFC857', '#1B7F4B', '#9A6200', '#C8321F'],
        ['nunito', 'comfortaa', 'fira-code'], ['1rem', '1.5rem', '1rem', '9999px', '0.5rem'],
        { ...wash(`radial-gradient(60% 50% at 10% 100%, ${tint('primary', 18)}, transparent 70%)`, `radial-gradient(45% 40% at 95% 0%, ${tint('tertiary', 30)}, transparent 70%)`) }),

    theme('velvet', 'Velvet', 'Wine-dark stage with rose and old gold', true,
        ['#1C0A17', '#2D1226', '#441C3A', '#62304F', '#FBE9F3', '#1C0A17', '#E9A6C9', '#D4AF6A', '#B79BFF', '#7FD1A0', '#E8BE5A', '#FF8A9A'],
        ['spectral', 'yeseva-one', 'victor-mono'], ['0.125rem', '0.25rem', '0.125rem', '0.125rem', '0.125rem', '0.25rem'],
        { ...wash(`radial-gradient(80% 60% at 50% 0%, ${tint('primary', 14)}, transparent 70%)`) }),

    theme('citrus', 'Citrus', 'Lime, tangerine and lemon with pill-shaped controls', false,
        ['#FBFFE8', '#FFFFFF', '#E9F7B0', '#CFE47A', '#25340A', '#FFFFFF', '#4C7A00', '#C84A00', '#F9C80E', '#2E7D32', '#8F5E00', '#C62828'],
        ['lexend', 'righteous', 'source-code-pro'], ['1rem', '2rem', '9999px', '9999px', '0.5rem'],
        { ...wash(`conic-gradient(from 0deg at 100% 0%, ${tint('tertiary', 26)}, transparent 30%, ${tint('primary', 10)} 60%, transparent)`) }),

    theme('midnight-jazz', 'Midnight Jazz', 'Art deco navy and brass', true,
        ['#0B1026', '#151C3D', '#232D5C', '#4A4A63', '#F2EBD9', '#0B1026', '#E9B44C', '#6FB6EA', '#E0788B', '#7CC79A', '#F0C36A', '#FF8577'],
        ['josefin-sans', 'limelight', 'share-tech-mono'], ['0', '0.125rem', '0', '0', '0', '0'],
        { 'page-ambient': `repeating-conic-gradient(from -30deg at 50% 120%, ${tint('primary', 7)} 0 4deg, transparent 4deg 12deg)` }),

    theme('chalkboard', 'Chalkboard', 'Green slate with pastel chalk and hand lettering', true,
        ['#203A33', '#2A4A41', '#345A4F', '#557C6C', '#F4F7EE', '#1A302A', '#FFE08A', '#FFA9BE', '#9BE0FF', '#A8E6A1', '#FFD166', '#FFA59A'],
        ['patrick-hand', 'cabin-sketch', 'nova-mono'], ['0.5rem', '0.75rem', '0.5rem', '0.5rem'],
        { 'edge-width': '2px' }),

    theme('candy', 'Candy', 'Sweet-shop pastels with a chunky script', false,
        ['#FFF0FB', '#FFFFFF', '#EBDFFF', '#E3BFEF', '#3A1650', '#FFFFFF', '#B5179E', '#0070BD', '#FFB703', '#1E8449', '#9C6100', '#C81E4A'],
        ['baloo-2', 'shrikhand', 'ubuntu-mono'], ['1.25rem', '1.75rem', '1.25rem', '1.25rem', '0.5rem'],
        { ...wash(`radial-gradient(45% 45% at 10% 15%, ${tint('tertiary', 24)}, transparent 70%)`, `radial-gradient(50% 45% at 90% 85%, ${tint('secondary', 18)}, transparent 70%)`) }),

    theme('blueprint', 'Blueprint', 'Drafting blue with a grid and technical lettering', true,
        ['#0B3D78', '#0F4A8F', '#134E97', '#6FA8DC', '#EAF4FF', '#0B3D78', '#FFFFFF', '#FFD166', '#9BDBFF', '#9BE8B4', '#FFD166', '#FFB3A7'],
        ['chakra-petch', 'share-tech-mono', 'share-tech-mono'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'page-ambient': `linear-gradient(${tint('text', 7)} 1px, transparent 1px), linear-gradient(90deg, ${tint('text', 7)} 1px, transparent 1px)`, 'page-ambient-size': '32px 32px' },
        ['#EAF2FB', '#FFFFFF', '#D3E4F6', '#8FB4DC', '#0B2F5E', '#FFFFFF', '#0B4FA0', '#8A5A00', '#1F6FA8', '#1B7A4B', '#8A5A00', '#B83A2E']),

    theme('mesa', 'Mesa', 'Desert clay, turquoise and a wood-type heading', false,
        ['#F6D9B8', '#FFF6EA', '#F0C79A', '#D9A066', '#4A1F12', '#FFF6EA', '#A23B1C', '#14606F', '#E09F3E', '#3F6B2A', '#8A4B00', '#A8201A'],
        ['rubik', 'rye', 'courier-prime'], ['0.375rem', '0.5rem', '0.375rem', '0.375rem'],
        { ...wash(`linear-gradient(180deg, transparent 55%, ${tint('tertiary', 24)})`) }),

    theme('synthwave', 'Synthwave', 'Neon pink and cyan over a violet dusk', true,
        ['#170B3B', '#241356', '#371E7A', '#5A37A8', '#F6E9FF', '#170B3B', '#FF6BDF', '#2DE2E6', '#FFAA55', '#5CF2A0', '#FFD15C', '#FF7B8E'],
        ['rajdhani', 'audiowide', 'kode-mono'], ['0.375rem', '0.625rem', '0.375rem', '0.375rem'],
        { ...wash(`linear-gradient(180deg, transparent 50%, ${tint('primary', 26)})`, `radial-gradient(40% 40% at 50% 0%, ${tint('secondary', 16)}, transparent 70%)`), ...glow('primary', '28px') }),

    theme('arctic', 'Arctic', 'Ice white and glacier blue with light, airy type', false,
        ['#EEF5FA', '#FFFFFF', '#DCEAF4', '#C3D8E6', '#0F2A3D', '#FFFFFF', '#0B6E99', '#5458BD', '#8FD3E8', '#1B7F5C', '#8F6200', '#C03A3A'],
        ['manrope', 'outfit', 'ibm-plex-mono'], ['0.625rem', '1rem', '0.625rem', '0.625rem'],
        { ...wash(`linear-gradient(160deg, ${tint('tertiary', 30)}, transparent 45%)`) }),

    theme('pixel', 'Pixel', 'Arcade night with blocky type and stepped shadows', true,
        ['#20203F', '#2E2E5C', '#44447F', '#7C7CB8', '#FFF6E0', '#20203F', '#FFB52E', '#52D1FF', '#FF8FC0', '#6BE585', '#FFD75E', '#FF8080'],
        ['pixelify-sans', 'silkscreen', 'vt323'], ['0', '0', '0', '0', '0', '0', '0'],
        { 'edge-width': '2px', ...hard('4px', 'border') }),

    theme('botanica', 'Botanica', 'Pressed leaves on sage with leaf-shaped corners', false,
        ['#EEF3EA', '#FCFDFA', '#D9E6D0', '#BCD0AE', '#1F3324', '#FCFDFA', '#2F6B3C', '#A33A63', '#C7A22E', '#2F6B3C', '#80600A', '#B23A32'],
        ['lora', 'cormorant-garamond', 'inconsolata'], ['0.75rem', '1.75rem 0.25rem 1.75rem 0.25rem', '0.5rem', '1rem 0.25rem 1rem 0.25rem', '0.25rem'],
        { ...wash(`radial-gradient(55% 45% at 100% 100%, ${tint('primary', 16)}, transparent 70%)`) }),

    theme('darkroom', 'Darkroom', 'Red safelight and worn typewriter letters', true,
        ['#140606', '#220B0B', '#3A1414', '#5C2320', '#FFD9D2', '#140606', '#FF6A5A', '#FFB199', '#E08A7E', '#C9C27A', '#FFB86B', '#FF8577'],
        ['karla', 'special-elite', 'courier-prime'], ['0.125rem', '0.125rem', '0.125rem', '0.125rem', '0', '0'],
        { ...wash(`radial-gradient(50% 45% at 80% 0%, ${tint('primary', 26)}, transparent 70%)`) }),

    theme('kite', 'Kite', 'Bold primary colours, geometric and playful', false,
        ['#E8F1FF', '#FFFFFF', '#FFE9A8', '#AFC8F2', '#14213D', '#FFFFFF', '#1D4ED8', '#C92A02', '#FFB703', '#157A45', '#8F5B00', '#C92A02'],
        ['gabarito', 'dela-gothic-one', 'fira-code'], ['0.75rem', '0 2rem 0 2rem', '0.75rem', '0 1rem 0 1rem', '0.25rem'],
        { 'page-ambient': `conic-gradient(from 45deg at 88% 12%, ${tint('tertiary', 34)} 0 25%, ${tint('secondary', 14)} 0 50%, ${tint('primary', 14)} 0 75%, transparent 0)`, 'page-ambient-size': '100% 100%' },
        ['#0E1730', '#16223F', '#24345C', '#3A4E80', '#E9F0FF', '#0E1730', '#7DA6FF', '#FF8A66', '#FFC94D', '#5FD39A', '#FFC94D', '#FF8A7A'])
];
