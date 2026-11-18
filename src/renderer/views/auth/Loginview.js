const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const Button = require('../../components/Button.js');
const Input = require('../../components/Input.js');

class LoginView {
    constructor(app) {
        this.app = app;
        this.googleLoginInProgress = false;
    }

    render() {
        this.renderLoginForm();
    }

    renderLoginForm() {
        const appContainer = document.getElementById('app');
        appContainer.innerHTML = `
      <div class="login-container">
        <aside class="login-visual" aria-label="Arduino Uno inventory illustration">
          <img class="login-arduino-image" src="src/assets/unsplash-arduino.jpg" alt="Photograph of a real Arduino Uno board with its Arduino and UNO markings">
          <div class="login-image-overlay">
            <div class="login-onboarding-copy">
              <h2>Welcome back!</h2>
              <p>Your products, branch stock, transfers, and sales are all ready in one place.</p>
            </div>
          </div>
        </aside>
        <main class="login-panel">
        <div class="login-card" id="loginCard">
          <div class="text-center mb-lg">
            <img class="login-brand-logo" src="src/assets/brand-mark.svg" alt="Faranux ERP logo">
            <h2 class="login-title">FARANUX ERP</h2>
            <p class="text-muted text-sm">Sign in to continue</p>
          </div>

          <form id="loginForm">
            ${Input.field({ label: 'Email Address', type: 'email', id: 'loginEmail', placeholder: 'you@example.com', icon: 'fa-solid fa-envelope', autocomplete: 'username', required: true, autofocus: true })}
            ${Input.field({ label: 'Password', type: 'password', id: 'loginPassword', placeholder: 'Enter your password', icon: 'fa-solid fa-lock', autocomplete: 'current-password', required: true })}

            ${Button.html({ text: 'Sign In', icon: 'fa-solid fa-right-to-bracket', variant: 'primary', size: 'lg', id: 'loginBtn', type: 'submit', className: 'w-full' })}
          </form>

          <div class="login-divider">
            <span>Or continue with</span>
          </div>

          ${Button.html({ text: 'Sign in with Google', icon: 'fa-brands fa-google', variant: 'google', size: 'md', id: 'googleLoginBtn' })}

          ${Button.html({ text: 'Cancel', variant: 'ghost', size: 'md', id: 'cancelGoogleBtn', className: 'w-full mt-sm', hidden: true })}

          <!-- App Version (added here) -->
          <div class="text-center mt-lg pt-md border-t border-neutral-200">
            <span class="text-xs text-neutral-400">
              Faranux ERP <strong id="version-display">v1.1.17</strong>
            </span>
          </div>
        </div>
        </main>
      </div>
    `;

        this.attachEvents();
    }

    // New Screen: Shows when status is 'pending'
    renderPendingApproval() {
        const card = document.getElementById('loginCard');
        if (!card) return;

        card.innerHTML = `
            <div class="text-center fade-in">
                <i class="fa-solid fa-clock-rotate-left text-warning-500" style="font-size: 3rem; margin-bottom: 1rem; display:block;"></i>
                <h2 class="font-bold text-xl mb-sm">Approval Pending</h2>
                <p class="text-neutral-600 mb-lg">Your account has been created but requires Administrator approval before you can access the system.</p>

                <div class="bg-neutral-50 p-md rounded mb-lg border border-neutral-200">
                    <p class="text-sm font-semibold">Please contact your Admin to approve your email.</p>
                </div>

                <button id="checkStatusBtn" class="btn btn-primary w-full mb-md">
                    <i class="fa-solid fa-rotate-right"></i> Check Approval Status
                </button>

                <button id="backToLoginBtn" class="btn btn-ghost w-full">
                    Back to Login
                </button>
            </div>
        `;

        document.getElementById('checkStatusBtn').addEventListener('click', () => this.handleCheckStatus());
        document.getElementById('backToLoginBtn').addEventListener('click', () => this.renderLoginForm());
    }

    attachEvents() {
        const form = document.getElementById('loginForm');
        const googleBtn = document.getElementById('googleLoginBtn');
        const cancelBtn = document.getElementById('cancelGoogleBtn');
        const loginBtn = document.getElementById('loginBtn');

        // Standard Email Login
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                Toast.error("Please fill in all fields");
                return;
            }

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

            try {
                // Call API directly to handle specific status codes
                const res = await API.login(email, password);

                if (res.status === 'success') {
                    this.app.resetAuthenticationFailure?.();
                    this.app.state.setUser(res.user);
                    this.app.renderApp(res.user);
                    this.app.navigate('pos');
                    Toast.success('Welcome back!');
                } else if (res.status === 'pending_approval') {
                    this.renderPendingApproval();
                } else {
                    Toast.error(res.message || 'Login failed');
                }
            } catch (e) {
                Toast.error("Login failed");
            } finally {
                if (document.getElementById('loginBtn')) {
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
                }
            }
        });

        // Google Login
        googleBtn.addEventListener('click', () => this.handleGoogleLogin());

        // Cancel Google Login
        cancelBtn.addEventListener('click', async () => {
            this.googleLoginInProgress = false;

            // Notify main process to cleanup server
            try {
                await globalThis.window?.faranuxDesktop?.cancelGoogleLogin?.();
            } catch (e) {
                console.error('Error cancelling login:', e);
            }

            const btn = document.getElementById('googleLoginBtn');
            const cancel = document.getElementById('cancelGoogleBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-brands fa-google"></i> Sign in with Google';
            }
            if (cancel) {
                cancel.classList.add('hidden');
            }
            Toast.info('Login cancelled');
        });

        // ← NEW: Load version asynchronously
        this.loadAppVersion();
    }

    // NEW METHOD - Fetch and display version
    async loadAppVersion() {
        try {
            const version = await globalThis.window?.faranuxDesktop?.getAppVersion?.();
            const versionEl = document.getElementById('version-display');
            if (versionEl) {
                versionEl.textContent = `v${version}`;
            }
        } catch (err) {
            console.error('Could not load app version:', err);
            // Fallback in case of any error
            const versionEl = document.getElementById('version-display');
            if (versionEl) versionEl.textContent = 'v1.1.17';
        }
    }

    async handleGoogleLogin() {
        if (this.googleLoginInProgress) return;

        const googleBtn = document.getElementById('googleLoginBtn');
        const cancelBtn = document.getElementById('cancelGoogleBtn');

        this.googleLoginInProgress = true;
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Waiting for browser...';

        // Show cancel button
        if (cancelBtn) {
            cancelBtn.classList.remove('hidden');
        }

        try {
            // Get token from Main process
            const token = await globalThis.window?.faranuxDesktop?.loginGoogle?.();

            // Check if user cancelled
            if (!this.googleLoginInProgress) {
                return; // User clicked cancel
            }

            // Verify with Backend
            const res = await API.googleLogin(token);

            if (res.status === 'success') {
                this.app.resetAuthenticationFailure?.();
                this.app.state.setUser(res.user);
                this.app.renderApp(res.user);
                this.app.navigate('pos');
                Toast.success('Welcome back!');
            } else if (res.status === 'pending_approval') {
                this.renderPendingApproval();
            } else {
                Toast.error(res.message || 'Google login failed');
            }
        } catch (error) {
            console.error('Google login error:', error);

            // Don't show error if user cancelled
            if (!this.googleLoginInProgress) {
                return;
            }

            // Show user-friendly error messages
            if (error && error.message) {
                if (error.message.includes('timeout')) {
                    Toast.error('Login timed out. Please try again.');
                } else if (error.message.includes('EADDRINUSE')) {
                    Toast.error('Port 4200 is already in use. Close any other Google sign-in window and try again.');
                } else if (error.message.includes('Server error')) {
                    Toast.error('Authentication server error. Please try again.');
                } else {
                    Toast.error('Google login cancelled or failed');
                }
            } else {
                Toast.error('Google login failed');
            }
        } finally {
            // Always re-enable the button and hide cancel
            this.googleLoginInProgress = false;
            const btn = document.getElementById('googleLoginBtn');
            const cancel = document.getElementById('cancelGoogleBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-brands fa-google"></i> Sign in with Google';
            }
            if (cancel) {
                cancel.classList.add('hidden');
            }
        }
    }

    async handleCheckStatus() {
        const btn = document.getElementById('checkStatusBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';

        try {
            // Re-trigger Google Login to valid status.
            // Usually happens instantly if user is already signed in to browser session.
            await this.handleGoogleLogin();
        } catch (e) {
            Toast.error("Could not verify status. Try again.");
        } finally {
            if (document.getElementById('checkStatusBtn')) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }
}

module.exports = LoginView;
