const KEY = 'faranux_theme_mode';

module.exports = {
    apply() {
        // Normalize any previous dark/system preference to the single supported theme.
        localStorage.setItem(KEY, 'light');
        document.documentElement.dataset.theme = 'light';
        document.documentElement.dataset.themeMode = 'light';
    }
};
