// src/js/toast.js
let container = null;

module.exports = {
    // Show a toast message
    // Type can be: 'success' (green), 'error' (red), 'info' (blue)
    show: (message, type = 'success') => {
        ensureContainer();

        // Create Toast Element
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <i class="fa-solid ${getIcon(type)}"></i>
            <span>${message}</span>
        `;

        // Add to DOM
        container.appendChild(el);

        // Remove after 3 seconds
        setTimeout(() => {
            el.style.animation = 'fadeOut 0.5s forwards';
            el.addEventListener('animationend', () => el.remove());
        }, 3000);
    }
};

// --- HELPERS ---

function ensureContainer() {
    if (!document.getElementById('toast-container')) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    } else {
        container = document.getElementById('toast-container');
    }
}

function getIcon(type) {
    switch (type) {
        case 'success': return 'fa-circle-check';
        case 'error': return 'fa-circle-exclamation';
        default: return 'fa-circle-info';
    }
}