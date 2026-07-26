(function () {
  "use strict";

  const STORAGE_KEY = "githubpage-theme";
  const LIGHT_THEME = "light";
  const DARK_THEME = "dark";
  const root = document.documentElement;
  const lightThemeStyles = document.getElementById("lightThemeStyles");
  let currentTheme = readTheme();

  function readTheme() {
    try {
      const storedTheme = localStorage.getItem(STORAGE_KEY);
      return storedTheme === DARK_THEME || storedTheme === LIGHT_THEME
        ? storedTheme
        : LIGHT_THEME;
    } catch (error) {
      return LIGHT_THEME;
    }
  }

  function updateButton() {
    const button = document.getElementById("themeToggle");
    const text = document.getElementById("themeToggleText");

    if (!button || !text) {
      return;
    }

    const nextThemeName = currentTheme === LIGHT_THEME ? "深色" : "浅色";
    text.textContent = nextThemeName;
    button.setAttribute("aria-label", `切换到${nextThemeName}主题`);
    button.title = `切换到${nextThemeName}主题`;
  }

  function applyTheme(theme, persist) {
    currentTheme = theme === DARK_THEME ? DARK_THEME : LIGHT_THEME;
    root.dataset.theme = currentTheme;
    root.style.colorScheme = currentTheme;

    if (lightThemeStyles) {
      lightThemeStyles.media = currentTheme === LIGHT_THEME ? "all" : "not all";
    }

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, currentTheme);
      } catch (error) {
        // Local file previews can block storage; the current page still switches normally.
      }
    }

    updateButton();
  }

  function bindThemeToggle() {
    const button = document.getElementById("themeToggle");

    if (!button) {
      return;
    }

    updateButton();
    button.addEventListener("click", function () {
      const nextTheme = currentTheme === LIGHT_THEME ? DARK_THEME : LIGHT_THEME;
      applyTheme(nextTheme, true);
    });
  }

  applyTheme(currentTheme, false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindThemeToggle, { once: true });
  } else {
    bindThemeToggle();
  }

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) {
      applyTheme(event.newValue === DARK_THEME ? DARK_THEME : LIGHT_THEME, false);
    }
  });
})();
