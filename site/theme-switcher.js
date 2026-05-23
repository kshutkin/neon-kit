class ThemeSwitcher extends HTMLElement {
  connectedCallback() {
    this.#initTheme();
    this.#initPrimaryColor();
    this.#renderButton();
  }

  #renderButton() {
    const currentPrimary = this.#getCurrentPrimaryColor();
    this.innerHTML = `
      <div class="relative">
        <button class="btn theme-toggle-btn cursor-pointer text-sm">
          Theme & Colors
        </button>
        <div class="theme-panel hidden absolute top-full right-0 mt-2 p-6 rounded-lg shadow-lg min-w-[280px] max-w-[320px] z-[1000]" style="background: var(--color-surface); border: 1px solid var(--color-border);">
          <div class="mb-6">
            <h3 class="text-base font-semibold mb-4" style="color: var(--color-ink-primary);">Theme</h3>
            <button class="btn cta theme-toggle w-full cursor-pointer">
              Toggle Light/Dark
            </button>
          </div>

          <div class="pt-6" style="border-top: 1px solid var(--color-border);">
            <h3 class="text-base font-semibold mb-4" style="color: var(--color-ink-primary);">Primary Color</h3>

            <div class="mb-4">
              <div class="primary-color-preview w-full h-16 rounded-md mb-3 border-2" style="background: var(--color-primary); border-color: var(--color-border);"></div>
              <div class="font-mono text-xs text-center mb-4 primary-oklch-display" style="color: var(--color-ink-secondary);">
                oklch(${currentPrimary.l}% ${currentPrimary.c} ${currentPrimary.h})
              </div>
            </div>

            <div class="mb-4">
              <label class="block text-sm mb-2" style="color: var(--color-ink-primary);">
                Lightness: <span class="primary-l-value">${currentPrimary.l}</span>%
              </label>
              <input type="range"
                class="primary-l-slider w-full"
                min="0"
                max="100"
                value="${currentPrimary.l}"
                step="1"
              >
            </div>

            <div class="mb-4">
              <label class="block text-sm mb-2" style="color: var(--color-ink-primary);">
                Chroma: <span class="primary-c-value">${currentPrimary.c}</span>
              </label>
              <input type="range"
                class="primary-c-slider w-full"
                min="0"
                max="0.5"
                value="${currentPrimary.c}"
                step="0.01"
              >
            </div>

            <div class="mb-4">
              <label class="block text-sm mb-2" style="color: var(--color-ink-primary);">
                Hue: <span class="primary-h-value">${currentPrimary.h}</span>°
              </label>
              <input type="range"
                class="primary-h-slider w-full"
                min="0"
                max="360"
                value="${currentPrimary.h}"
                step="1"
              >
            </div>
            <button class="btn reset-primary-btn w-full mt-2 cursor-pointer">
              Reset to Default
            </button>
          </div>
        </div>
      </div>
    `;

    // Toggle panel visibility
    const toggleBtn = this.querySelector(".theme-toggle-btn");
    const panel = this.querySelector(".theme-panel");

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("hidden");
    });

    // Close panel when clicking outside
    document.addEventListener("click", (e) => {
      if (!this.contains(e.target)) {
        panel.classList.add("hidden");
      }
    });

    // Theme toggle
    this.querySelector(".theme-toggle").addEventListener("click", () => {
      const currentTheme = document.documentElement.dataset.theme;
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      this.#setTheme(newTheme);
      localStorage.setItem("theme", newTheme);
    });

    // Primary color sliders
    const lSlider = this.querySelector(".primary-l-slider");
    const cSlider = this.querySelector(".primary-c-slider");
    const hSlider = this.querySelector(".primary-h-slider");
    const lValue = this.querySelector(".primary-l-value");
    const cValue = this.querySelector(".primary-c-value");
    const hValue = this.querySelector(".primary-h-value");
    const oklchDisplay = this.querySelector(".primary-oklch-display");
    const colorPreview = this.querySelector(".primary-color-preview");

    const updatePrimaryColor = () => {
      const l = parseFloat(lSlider.value);
      const c = parseFloat(cSlider.value);
      const h = parseFloat(hSlider.value);

      lValue.textContent = l;
      cValue.textContent = c;
      hValue.textContent = h;
      oklchDisplay.textContent = `oklch(${l}% ${c} ${h})`;

      this.setPrimaryColor(l, c, h);

      // Update color preview (using CSS variable so it updates automatically)
      if (colorPreview) {
        colorPreview.style.background = `var(--color-primary)`;
      }
    };

    lSlider.addEventListener("input", updatePrimaryColor);
    cSlider.addEventListener("input", updatePrimaryColor);
    hSlider.addEventListener("input", updatePrimaryColor);

    // Reset to default
    this.querySelector(".reset-primary-btn").addEventListener("click", () => {
      this.resetPrimaryColor();
    });

    // Update panel when primary color changes externally
    this.#updatePanelDisplay();
  }

  #updatePanelDisplay() {
    const primary = this.#getCurrentPrimaryColor();
    const lSlider = this.querySelector(".primary-l-slider");
    const cSlider = this.querySelector(".primary-c-slider");
    const hSlider = this.querySelector(".primary-h-slider");
    const lValue = this.querySelector(".primary-l-value");
    const cValue = this.querySelector(".primary-c-value");
    const hValue = this.querySelector(".primary-h-value");
    const oklchDisplay = this.querySelector(".primary-oklch-display");
    const colorPreview = this.querySelector(".primary-color-preview");

    if (lSlider && cSlider && hSlider) {
      lSlider.value = primary.l;
      cSlider.value = primary.c;
      hSlider.value = primary.h;

      if (lValue) lValue.textContent = primary.l;
      if (cValue) cValue.textContent = primary.c;
      if (hValue) hValue.textContent = primary.h;
      if (oklchDisplay) oklchDisplay.textContent = `oklch(${primary.l}% ${primary.c} ${primary.h})`;
      // Color preview uses CSS variable so it updates automatically
      if (colorPreview) {
        colorPreview.style.background = `var(--color-primary)`;
      }
    }
  }

  #initTheme() {
    const savedTheme = this.#loadThemeFromStorage();
    if (!savedTheme) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const theme = prefersDark ? "dark" : "light";
      this.#setTheme(theme);
      localStorage.setItem("theme", theme);
    }
  }

  #initPrimaryColor() {
    const savedPrimaryColor = this.#loadPrimaryColorFromStorage();
    if (!savedPrimaryColor) {
      const defaultPrimary = this.#getCurrentPrimaryColor();
      this.#setPrimaryColor(defaultPrimary);
      localStorage.setItem("primaryColor", JSON.stringify(defaultPrimary));
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

    // Update theme switcher styles to match new theme
    this.#updateThemeStyles();
  }

  #updateThemeStyles() {
    // Tokens are themed at the CSS level — `var(--color-*)` resolves to the
    // active theme's value via the `[data-theme="dark"]` override block. No
    // per-theme JS branching needed.
    const surface = "var(--color-surface)";
    const inkPrimary = "var(--color-ink-primary)";
    const inkSecondary = "var(--color-ink-secondary)";
    const border = "var(--color-border)";
    const primary = "var(--color-primary)";

    // Update panel background
    const panel = this.querySelector(".theme-panel");
    if (panel) {
      panel.style.background = surface;
      panel.style.borderColor = border;
    }

    // Update all text elements
    const textElements = this.querySelectorAll("h3, label, .primary-oklch-display");
    textElements.forEach(el => {
      if (el.classList.contains("primary-oklch-display")) {
        el.style.color = inkSecondary;
      } else {
        el.style.color = inkPrimary;
      }
    });

    // Update borders
    const borders = this.querySelectorAll(".theme-panel > div[class*='pt-6']");
    borders.forEach(el => {
      el.style.borderTopColor = border;
    });

    // Update color preview
    const colorPreview = this.querySelector(".primary-color-preview");
    if (colorPreview) {
      colorPreview.style.background = primary;
      colorPreview.style.borderColor = border;
    }
  }

  // Primary color management methods
  #getCurrentPrimaryColor() {
    const root = document.documentElement;
    const lightness = getComputedStyle(root)
      .getPropertyValue("--primary-lightness")
      .trim();
    const chroma = getComputedStyle(root)
      .getPropertyValue("--primary-chroma")
      .trim();
    const hue = getComputedStyle(root)
      .getPropertyValue("--primary-hue")
      .trim();

    return {
      l: parseFloat(lightness) || 60,
      c: parseFloat(chroma) || 0.15,
      h: parseFloat(hue) || 220,
    };
  }

  #getDefaultPrimaryColor() {
    const root = document.documentElement;
    // Save current inline overrides
    const savedL = root.style.getPropertyValue("--primary-lightness");
    const savedC = root.style.getPropertyValue("--primary-chroma");
    const savedH = root.style.getPropertyValue("--primary-hue");
    // Temporarily remove inline overrides to read stylesheet defaults
    root.style.removeProperty("--primary-lightness");
    root.style.removeProperty("--primary-chroma");
    root.style.removeProperty("--primary-hue");
    // Read the defaults from the stylesheet
    const computed = getComputedStyle(root);
    const defaults = {
      l: parseFloat(computed.getPropertyValue("--primary-lightness")) || 60,
      c: parseFloat(computed.getPropertyValue("--primary-chroma")) || 0.15,
      h: parseFloat(computed.getPropertyValue("--primary-hue")) || 220,
    };
    // Restore inline overrides
    if (savedL) root.style.setProperty("--primary-lightness", savedL);
    if (savedC) root.style.setProperty("--primary-chroma", savedC);
    if (savedH) root.style.setProperty("--primary-hue", savedH);
    return defaults;
  }

  #setPrimaryColor(primaryColor) {
    const { l, c, h } = primaryColor;
    const root = document.documentElement;

    // Update primary color components - --color-primary will update automatically via CSS
    root.style.setProperty("--primary-lightness", l);
    root.style.setProperty("--primary-chroma", c);
    root.style.setProperty("--primary-hue", h);

    // Update panel display if it exists
    this.#updatePanelDisplay();
  }

  #loadPrimaryColorFromStorage() {
    const savedPrimaryColor = localStorage.getItem("primaryColor");
    if (savedPrimaryColor) {
      try {
        const primaryColor = JSON.parse(savedPrimaryColor);
        this.#setPrimaryColor(primaryColor);
        return primaryColor;
      } catch (e) {
        console.warn("Failed to parse saved primary color:", e);
      }
    }
    return null;
  }

  // Public API methods
  setPrimaryColor(l, c, h) {
    const primaryColor = { l, c, h };
    this.#setPrimaryColor(primaryColor);
    localStorage.setItem("primaryColor", JSON.stringify(primaryColor));
  }

  getPrimaryColor() {
    return this.#getCurrentPrimaryColor();
  }

  getDefaultPrimaryColor() {
    return this.#getDefaultPrimaryColor();
  }

  resetPrimaryColor() {
    const defaults = this.#getDefaultPrimaryColor();
    this.setPrimaryColor(defaults.l, defaults.c, defaults.h);
  }
}

customElements.define("theme-switcher", ThemeSwitcher);
