// Modal Component
class Modal {
    constructor() {
        this.overlay = null;
        this.onConfirm = null;
        this.init();
    }

    init() {
        if (document.getElementById('modal-overlay')) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'modal-overlay';
        this.overlay.className = 'modal-overlay';
        document.body.appendChild(this.overlay);

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    open(config) {
        const {
            title,
            body,
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            onConfirm,
            size = 'md'
        } = config;

        this.onConfirm = onConfirm;

        this.overlay.innerHTML = `
      <div class="modal modal-${size}">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" id="modal-close-x" title="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
          <button class="btn btn-primary" id="modal-confirm">${confirmText}</button>
        </div>
      </div>
    `;

        this.overlay.classList.add('active');
        this.attachEvents();
    }

    attachEvents() {
        const closeBtn = document.getElementById('modal-close-x');
        const cancelBtn = document.getElementById('modal-cancel');
        const confirmBtn = document.getElementById('modal-confirm');

        closeBtn?.addEventListener('click', () => this.close());
        cancelBtn?.addEventListener('click', () => this.close());

        confirmBtn?.addEventListener('click', async () => {
            if (this.onConfirm) {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

                try {
                    await this.onConfirm();
                    this.close();
                } catch (error) {
                    console.error('Modal confirm error:', error);
                    // Don't close modal on error, allow user to retry
                } finally {
                    if (!this.overlay.classList.contains('active')) return; // Already closed
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm';
                }
            } else {
                this.close();
            }
        });
    }

    close() {
        this.overlay.classList.remove('active');
        this.onConfirm = null;
    }
}

module.exports = new Modal();