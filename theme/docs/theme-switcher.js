class ThemeSwitcher extends HTMLElement {

    connectedCallback() {
        this.#render();
        this.#initTheme();
    }

    #render() {
        this.innerHTML = `
      <button class="fixed top-6 right-6 p-2 rounded-lg shadow-md bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
        Toggle Theme
      </button>
    `;
        this.querySelector('button').addEventListener('click', () => {
            const currentTheme = document.documentElement.dataset.theme;
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = newTheme;
            localStorage.setItem('theme', newTheme);
        });
    }

    #initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.dataset.theme = savedTheme;
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
        }
    }
}

customElements.define('theme-switcher', ThemeSwitcher);
