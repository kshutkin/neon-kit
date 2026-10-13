class ThemeSwitcher extends HTMLElement {
  connectedCallback() {
    this.#initTheme();
    this.#initPrimaryColor();
    this.#renderButton();
  }

  #renderButton() {
    const currentPrimary = this.#getCurrentPrimaryColor();
    this.innerHTML = `
      <div class="docs-relative">
        <button class="btn theme-toggle-btn docs-cursor-pointer docs-text-sm">
          Theme & Colors
        </button>
        <div class="theme-panel docs-hidden docs-absolute docs-top-full docs-right-0 docs-mt-2 docs-p-6 docs-rounded-lg docs-shadow-lg docs-min-w--5b-280px-5d- docs-max-w--5b-320px-5d- docs-z--5b-1000-5d-" style="background: var(--neon-color-surface, var(--_color-surface)); border: 1px solid var(--neon-color-border, var(--_color-border));">
          <div class="docs-mb-6">
            <h3 class="docs-text-base docs-font-semibold docs-mb-4" style="color: var(--neon-color-ink-primary, var(--_color-ink-primary));">Theme</h3>
            <button class="btn cta theme-toggle docs-w-full docs-cursor-pointer">
              Theme: Automatic
            </button>
          </div>

          <div class="docs-pt-6" style="border-top: 1px solid var(--neon-color-border, var(--_color-border));">
            <h3 class="docs-text-base docs-font-semibold docs-mb-4" style="color: var(--neon-color-ink-primary, var(--_color-ink-primary));">Primary Color</h3>

            <div class="docs-mb-4">
              <div class="primary-color-preview docs-w-full docs-h-16 docs-rounded-md docs-mb-3 docs-border-2" style="background: var(--neon-color-primary, var(--_color-primary)); border-color: var(--neon-color-border, var(--_color-border));"></div>
              <div class="docs-font-mono docs-text-xs docs-text-center docs-mb-4 primary-oklch-display" style="color: var(--neon-color-ink-secondary, var(--_color-ink-secondary));">
                oklch(${currentPrimary.l}% ${currentPrimary.c} ${currentPrimary.h})
              </div>
            </div>

            <div class="docs-mb-4">
              <label class="docs-block docs-text-sm docs-mb-2" style="color: var(--neon-color-ink-primary, var(--_color-ink-primary));">
                Lightness: <span class="primary-l-value">${currentPrimary.l}</span>%
              </label>
              <input type="range"
                class="primary-l-slider docs-w-full"
                min="0"
                max="100"
                value="${currentPrimary.l}"
                step="1"
              >
            </div>

            <div class="docs-mb-4">
              <label class="docs-block docs-text-sm docs-mb-2" style="color: var(--neon-color-ink-primary, var(--_color-ink-primary));">
                Chroma: <span class="primary-c-value">${currentPrimary.c}</span>
              </label>
              <input type="range"
                class="primary-c-slider docs-w-full"
                min="0"
                max="0.5"
                value="${currentPrimary.c}"
                step="0.01"
              >
            </div>

            <div class="docs-mb-4">
              <label class="docs-block docs-text-sm docs-mb-2" style="color: var(--neon-color-ink-primary, var(--_color-ink-primary));">
                Hue: <span class="primary-h-value">${currentPrimary.h}</span>°
              </label>
              <input type="range"
                class="primary-h-slider docs-w-full"
                min="0"
                max="360"
                value="${currentPrimary.h}"
                step="1"
              >
            </div>
            <button class="btn reset-primary-btn docs-w-full docs-mt-2 docs-cursor-pointer">
              Reset to Default
            </button>
          </div>
        </div>
      </div>
    `;

    this.#setTheme(localStorage.getItem("theme") ?? "auto");

    // Toggle panel visibility
    const toggleBtn = this.querySelector(".theme-toggle-btn");
    const panel = this.querySelector(".theme-panel");

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("docs-hidden");
    });

    // Close panel when clicking outside
    document.addEventListener("click", (e) => {
      if (!this.contains(e.target)) {
        panel.classList.add("docs-hidden");
      }
    });

    // Theme toggle
    this.querySelector(".theme-toggle").addEventListener("click", () => {
      const modes = ["auto", "light", "dark"];
      const currentTheme = localStorage.getItem("theme") ?? "auto";
      const newTheme = modes[(modes.indexOf(currentTheme) + 1) % modes.length];
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
        colorPreview.style.background = `var(--neon-color-primary, var(--_color-primary))`;
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
        colorPreview.style.background = `var(--neon-color-primary, var(--_color-primary))`;
      }
    }
  }

  #initTheme() {
    this.#setTheme(localStorage.getItem("theme") ?? "auto");
  }

  #initPrimaryColor() {
    const savedPrimaryColor = this.#loadPrimaryColorFromStorage();
    if (!savedPrimaryColor) {
      const defaultPrimary = this.#getCurrentPrimaryColor();
      this.#setPrimaryColor(defaultPrimary);
      localStorage.setItem("primaryColor", JSON.stringify(defaultPrimary));
    }
  }

  #setTheme(theme) {
    const mode = ["light", "dark"].includes(theme) ? theme : "auto";
    document.documentElement.style.colorScheme = mode === "auto" ? "light dark" : mode;
    const button = this.querySelector(".theme-toggle");
    if (button) {
      button.textContent = `Theme: ${mode === "auto" ? "Automatic" : mode === "light" ? "Light" : "Dark"}`;
    }
  }

  // Primary color management methods
  #readPrimaryColor() {
    const computed = getComputedStyle(document.documentElement);
    const read = (name, fallback) => {
      const value = parseFloat(computed.getPropertyValue(name) || computed.getPropertyValue(name.replace("--neon-", "--_")));
      return Number.isFinite(value) ? value : fallback;
    };
    return { l: read("--neon-primary-lightness", 38), c: read("--neon-primary-chroma", 0.2), h: read("--neon-primary-hue", 245) };
  }

  #getCurrentPrimaryColor() {
    return this.#readPrimaryColor();
  }

  #getDefaultPrimaryColor() {
    const root = document.documentElement;
    const names = ["--neon-primary-lightness", "--neon-primary-chroma", "--neon-primary-hue"];
    const saved = names.map(name => root.style.getPropertyValue(name));
    for (const name of names) {
      root.style.removeProperty(name);
    }
    const defaults = this.#readPrimaryColor();
    names.forEach((name, index) => {
      if (saved[index]) {
        root.style.setProperty(name, saved[index]);
      }
    });
    return defaults;
  }

  #setPrimaryColor(primaryColor) {
    const { l, c, h } = primaryColor;
    const root = document.documentElement;

    // Update primary color components - --neon-color-primary will update automatically via CSS
    root.style.setProperty("--neon-primary-lightness", l);
    root.style.setProperty("--neon-primary-chroma", c);
    root.style.setProperty("--neon-primary-hue", h);

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
