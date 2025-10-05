class ThemeSwitcher extends HTMLElement {
  connectedCallback() {
    const isMainWindow = window.top === window.self;

    if (isMainWindow) {
      this.#initMainWindowTheme();
      this.#renderButton();
    } else {
      this.#loadThemeFromStorage();
      this.#setupIframeListener();
    }
  }

  #renderButton() {
    this.innerHTML = `
      <button class="fixed top-6 right-6 p-2 rounded-lg shadow-md bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
        Toggle Theme
      </button>
    `;
    this.querySelector("button").addEventListener("click", () => {
      const currentTheme = document.documentElement.dataset.theme;
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      this.#setTheme(newTheme);
      localStorage.setItem("theme", newTheme);
      this.#notifyIframes(newTheme);
    });
  }

  #setupIframeListener() {
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "theme-sync") {
        this.#setTheme(e.data.theme);
      }
    });
  }

  #notifyIframes(theme, excludeSource = null) {
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        if (iframe.contentWindow && iframe.contentWindow !== excludeSource) {
          iframe.contentWindow.postMessage({ type: "theme-sync", theme }, "*");
        }
      } catch (e) {
        // Cross-origin iframe, skip
        console.warn("Could not notify iframe:", e);
      }
    }
  }

  #initMainWindowTheme() {
    const savedTheme = this.#loadThemeFromStorage();
    if (!savedTheme) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const theme = prefersDark ? "dark" : "light";
      this.#setTheme(theme);
      localStorage.setItem("theme", theme);
    }

    // Notify any iframes of initial theme
    const currentTheme = document.documentElement.dataset.theme;
    if (currentTheme) {
      this.#notifyIframes(currentTheme);
    }
  }

  #loadThemeFromStorage() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      this.#setTheme(savedTheme);
      return savedTheme;
    }
    return null;
  }

  #setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
}

customElements.define("theme-switcher", ThemeSwitcher);
