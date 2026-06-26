/**
 * darkmode.js
 * -----------
 * Dark mode controller for SignBridge.
 * - Reads saved preference from localStorage
 * - Toggles html[data-theme="dark"]
 * - Injects the toggle button into every page's nav
 * - Respects system preference on first visit
 */

(function () {

  const STORAGE_KEY = 'sb_theme';
  const DARK        = 'dark';
  const LIGHT       = 'light';

  // ── Determine initial theme ──────────────────────
  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    // Respect OS preference on first visit
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return DARK;
    return LIGHT;
  }

  // ── Apply theme ──────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    updateToggleIcon(theme);
  }

  // ── Update button icon ───────────────────────────
  function updateToggleIcon(theme) {
    const btns = document.querySelectorAll('.dark-toggle');
    btns.forEach(btn => {
      btn.textContent    = theme === DARK ? '☀️' : '🌙';
      btn.title          = theme === DARK ? 'Switch to light mode' : 'Switch to dark mode';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', theme === DARK ? 'true' : 'false');
    });
  }

  // ── Toggle ───────────────────────────────────────
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || LIGHT;
    applyTheme(current === DARK ? LIGHT : DARK);
  }

  // ── Inject toggle button into nav ────────────────
  function injectToggleButton() {
    const nav = document.getElementById('nav');
    if (!nav) return;

    // Don't inject twice
    if (nav.querySelector('.dark-toggle')) return;

    const btn = document.createElement('button');
    btn.className   = 'dark-toggle';
    btn.textContent = '🌙';
    btn.title       = 'Switch to dark mode';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', toggleTheme);

    // Insert before the hamburger (or at end of nav)
    const hamburger = nav.querySelector('.nav__hamburger');
    const navCta    = nav.querySelector('.nav__cta');
    if (hamburger) {
      nav.insertBefore(btn, hamburger);
    } else if (navCta) {
      nav.insertBefore(btn, navCta.nextSibling);
    } else {
      nav.appendChild(btn);
    }
  }

  // ── Listen for OS theme changes ──────────────────
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      // Only follow OS if user hasn't set a preference
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? DARK : LIGHT);
      }
    });
  }

  // ── Keyboard shortcut: Alt+D ─────────────────────
  document.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      toggleTheme();
    }
  });

  // ── INIT ─────────────────────────────────────────
  // Apply theme immediately (before paint) to avoid flash
  const initialTheme = getInitialTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // Inject button once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectToggleButton();
      updateToggleIcon(initialTheme);
    });
  } else {
    injectToggleButton();
    updateToggleIcon(initialTheme);
  }

})();
