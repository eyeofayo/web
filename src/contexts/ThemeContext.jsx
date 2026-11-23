import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';
import { injectCustomTheme, removeCustomTheme, customThemeClass, injectThemes, loadThemeFonts } from '../styles/theme.compiler.js';
import { GALLERY_THEMES } from '../styles/theme.gallery.js';

// Import all themes directly to avoid async loading issues and white flashes
import '../styles/themes/modern.css';
import '../styles/themes/minimal.css';
import '../styles/themes/vibrant.css';
import '../styles/themes/admin.css';
import '../styles/themes/pink.css';
import '../styles/themes/variants.css';

const ThemeContext = createContext();

const MODES_KEY = 'themeModes';
const savedModes = () => {
    try { return JSON.parse(localStorage.getItem(MODES_KEY)) || {}; } catch { return {}; }
};
// The Dark theme is now the dark variant of Modern; a person who had chosen it keeps what they saw.
if (localStorage.getItem('selectedTheme') === 'dark') {
    localStorage.setItem('selectedTheme', 'modern');
    localStorage.setItem(MODES_KEY, JSON.stringify({ ...savedModes(), modern: 'dark' }));
}

const CUSTOM_THEME_KEY = 'customThemeDoc';

/** Restore an applied custom theme from localStorage (flash-free boot) */
const restoreCustomTheme = () => {
    try {
        const saved = localStorage.getItem(CUSTOM_THEME_KEY);
        if (!saved) return null;
        const doc = JSON.parse(saved);
        if (doc?.slug && doc?.tokens) {
            injectCustomTheme(doc);
            return doc;
        }
    } catch { /* fall back to built-ins */ }
    return null;
};

// Available themes
const themes = {
  modern: {
    name: 'Modern',
    description: 'Clean and professional design with modern aesthetics'
  },
  minimal: {
    name: 'Minimal',
    description: 'Ultra-clean minimalist design with focus on content'
  },
  vibrant: {
    name: 'Vibrant',
    description: 'Colorful and energetic design with bold styling'
  },
  admin: {
    name: 'Admin',
    description: 'Professional administrative interface design',
    dark: true
  },
  pink: {
    name: 'Pink',
    description: 'Playful and vibrant design with a pink color palette'
  },
  ...Object.fromEntries(GALLERY_THEMES.map(({ slug, name, description, tokens }) => [slug, { name, description, dark: tokens.darkMode }]))
};

injectThemes(GALLERY_THEMES);

// The background a theme gives every page: its `--page-background`, the name of one of Page's backgrounds, or 'none'
// for clear pages. Empty when the theme sets none, and each page keeps its own. Page draws it.
const backgrounds = new Map();
const themeBackground = (name) => {
  if (!backgrounds.has(name)) {
    const probe = document.createElement('div');
    probe.className = `theme-${name}`;
    probe.hidden = true;
    document.body.appendChild(probe);
    backgrounds.set(name, getComputedStyle(probe).getPropertyValue('--page-background').trim());
    probe.remove();
  }
  return backgrounds.get(name);
};

export const ThemeProvider = ({ children, theme: overrideTheme }) => {
  // Check if this is a nested ThemeProvider (override scenario)
  const parentContext = useContext(ThemeContext);
  const isNestedProvider = !!parentContext;

  const [customTheme, setCustomTheme] = useState(() => (isNestedProvider ? null : restoreCustomTheme()));

  // Get initial theme from localStorage or default to 'modern' (only for root provider)
  const [globalTheme, setGlobalTheme] = useState(() => {
    if (isNestedProvider) return null; // Nested providers don't manage global state
    const saved = localStorage.getItem('selectedTheme');
    if (saved?.startsWith('custom-')) {
      const doc = localStorage.getItem(CUSTOM_THEME_KEY);
      try { if (JSON.parse(doc)?.slug && saved === `custom-${JSON.parse(doc).slug}`) return saved; } catch { /* ignore */ }
      return 'modern';
    }
    return saved && themes[saved] ? saved : 'modern';
  });
  
  // Light or dark, remembered for each theme
  const [modes, setModes] = useState(savedModes);

  // Determine the effective current theme
  const currentTheme = isNestedProvider 
    ? ((overrideTheme === 'dark' ? 'modern' : overrideTheme) || parentContext.currentTheme) // Use override or inherit from parent
    : (overrideTheme || globalTheme); // Use override or global theme
  
  const ownMode = currentTheme.startsWith('custom-') ? (customTheme?.tokens?.darkMode ? 'dark' : 'light') : (themes[currentTheme]?.dark ? 'dark' : 'light');
  const mode = isNestedProvider ? parentContext.mode : (modes[currentTheme] || ownMode);

  useEffect(() => {
    loadThemeFonts(GALLERY_THEMES.find((doc) => doc.slug === currentTheme));
  }, [currentTheme]);

  const setMode = (next) => {
    if (isNestedProvider) return parentContext.setMode(next);
    const kept = { ...modes, [currentTheme]: next };
    localStorage.setItem(MODES_KEY, JSON.stringify(kept));
    setModes(kept);
    return undefined;
  };

  // Store theme preference, update body class, and dispatch change event. A layout effect, so the body already
  // carries the theme when the components below read their colours from it.
  useLayoutEffect(() => {
    if (isNestedProvider) return; // Only root provider manages global state
    
    // Store in localStorage (only for global theme changes, not overrides)
    if (!overrideTheme) {
      localStorage.setItem('selectedTheme', currentTheme);
    }

    // Update body class to ensure background color persists during page transitions
    // This prevents the "white flash" issue by ensuring the body always has the current theme class
    [...document.body.classList].forEach(cls => {
      if (cls.startsWith('theme-')) document.body.classList.remove(cls);
    });
    document.body.classList.add(`theme-${currentTheme}`);
    document.body.dataset.mode = mode;
    // The next load paints this ground before the theme's own styles arrive.
    const ground = getComputedStyle(document.body).getPropertyValue('--background-color').trim();
    document.documentElement.style.backgroundColor = ground;
    localStorage.setItem('themeGround', ground);
    
    // Dispatch a custom event that components can listen for
    const themeChangeEvent = new CustomEvent('themechange', { 
      detail: { theme: currentTheme, mode, isOverride: !!overrideTheme } 
    });
    document.dispatchEvent(themeChangeEvent);
  }, [currentTheme, mode, customTheme, isNestedProvider, overrideTheme]);

  const switchTheme = (themeName) => {
    // Re-selecting the applied custom theme (e.g. from the nav switcher)
    if (customTheme && themeName === customThemeClass(customTheme)) {
      setGlobalTheme(themeName);
      return;
    }
    if (themeName === 'dark') {
      const kept = { ...modes, modern: 'dark' };
      localStorage.setItem(MODES_KEY, JSON.stringify(kept));
      setModes(kept);
      setGlobalTheme('modern');
      return;
    }
    if (!themes[themeName]) {
      console.warn(`Theme "${themeName}" does not exist`);
      return;
    }

    // Only root provider can switch global theme
    if (isNestedProvider) {
      console.warn('Cannot switch global theme from nested ThemeProvider. Use the root ThemeProvider.');
      return;
    }

    if (themeName === currentTheme) {
      return; // Already using this theme
    }

    // Switching to a built-in keeps the custom theme registered (and in the
    // switcher) so the user can toggle back — it is only unlisted when
    // explicitly cleared (e.g. the theme gets deleted).
    setGlobalTheme(themeName);
  };

  /** Forget the cached custom theme (e.g. after deleting it) */
  const clearCustomTheme = () => {
    setCustomTheme(null);
    localStorage.removeItem(CUSTOM_THEME_KEY);
    removeCustomTheme();
    if (currentTheme.startsWith('custom-')) {
      setGlobalTheme('modern');
    }
  };

  /** Apply a server-side custom theme document (from Settings → Appearance) */
  const applyCustomTheme = (themeDoc) => {
    if (isNestedProvider) {
      console.warn('Cannot apply a custom theme from a nested ThemeProvider.');
      return;
    }
    if (!themeDoc?.slug || !themeDoc?.tokens) {
      console.warn('applyCustomTheme requires a theme document with slug and tokens');
      return;
    }
    injectCustomTheme(themeDoc);
    backgrounds.delete(customThemeClass(themeDoc));
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(themeDoc));
    setCustomTheme(themeDoc);
    setGlobalTheme(customThemeClass(themeDoc));
  };

  // Get CSS variables as an object for external use
  const getThemeVariables = () => {
    // Theme classes are applied to <body> (see effect above), so CSS custom
    // properties defined under `.theme-*` are scoped there.  Reading from
    // <html> would return empty strings — always read from <body>.
    const cssVars = getComputedStyle(document.body);
    const variables = {};
    
    // Extract commonly used variables
    const varNames = [
      '--background-color', '--text-color', '--text-muted', '--text-contrast-color',
      '--primary-color', '--primary-accent-color',
      '--secondary-color', '--secondary-accent-color',
      '--tertiary-color', '--success-color', '--warning-color', '--error-color',
      '--accent-color', '--surface-color', '--border-color',
      '--code-editor-bg', '--code-editor-line-bg', '--code-editor-line-numbers',
      '--code-editor-cursor', '--code-editor-selection', '--code-editor-border',
      '--code-keyword', '--code-string', '--code-number', '--code-comment',
      '--code-function', '--code-variable', '--code-operator', '--code-tag',
      '--code-attribute', '--code-value'
    ];
    
    varNames.forEach(varName => {
      const value = cssVars.getPropertyValue(varName).trim();
      if (value) {
        variables[varName] = value;
      }
    });
    
    return variables;
  };

  // Expose the applied custom theme alongside the built-ins so consumers
  // (e.g. the navigation theme switcher) can label it correctly.
  const allThemes = customTheme
    ? { ...themes, [customThemeClass(customTheme)]: { name: customTheme.name, description: customTheme.description || 'Custom theme', custom: true } }
    : themes;

  const value = {
    currentTheme,
    mode,
    setMode,
    switchTheme,
    applyCustomTheme,
    clearCustomTheme,
    customTheme,
    availableThemes: Object.keys(allThemes),
    themes: allThemes,
    themeBackground,
    getThemeInfo: (themeName) => allThemes[themeName] || null,
    isNestedProvider,
    isOverride: !!overrideTheme,
    getThemeVariables
  };

  return (
    <ThemeContext.Provider value={value}>
      {isNestedProvider && overrideTheme ? (
        // Nested provider with theme override needs a wrapper to apply theme
        <div 
          className={`theme-override-wrapper theme-${currentTheme}`}
          data-theme={currentTheme}
          data-theme-source="override"
        >
          {children}
        </div>
      ) : (
        children
      )}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};