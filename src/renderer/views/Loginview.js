const Toast = require('../components/Toast.js');
const { ipcRenderer } = require('electron');
const API = require('../services/api.js');

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
        <div class="login-card" id="loginCard">
          <div class="text-center mb-lg">
            <div class="login-icon">
              <i class="fa-solid fa-box-open"></i>
            </div>
            <h2 class="login-title">Faranux Inventory</h2>
            <p class="text-muted text-sm">Sign in to continue</p>
          </div>

          <form id="loginForm">
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <div class="form-input-icon">
                <i class="fa-solid fa-envelope"></i>
                <input type="email" id="loginEmail" class="form-input" placeholder="you@example.com" required autofocus>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Password</label>
              <div class="form-input-icon">
                <i class="fa-solid fa-lock"></i>
                <input type="password" id="loginPassword" class="form-input" placeholder="Enter your password" required>
              </div>
            </div>

            <button type="submit" class="btn btn-primary w-full btn-lg" id="loginBtn">
              <i class="fa-solid fa-right-to-bracket"></i>
              Sign In
            </button>
          </form>

          <div class="login-divider">
            <span>Or continue with</span>
          </div>

          <button id="googleLoginBtn" class="btn btn-google">
            <i class="fa-brands fa-google"></i>
            Sign in with Google
          </button>
          
          <button id="cancelGoogleBtn" class="btn btn-ghost w-full mt-sm" style="display: none;">
            Cancel
          </button>
        </div>
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
                    this.app.state.setUser(res.user);
                    this.app.renderApp(res.user);
                    this.app.navigate('dashboard');
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
                await ipcRenderer.invoke('cancel-google-login');
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
                cancel.style.display = 'none';
            }
            Toast.info('Login cancelled');
        });
    }

    async handleGoogleLogin() {
        const googleBtn = document.getElementById('googleLoginBtn');
        const cancelBtn = document.getElementById('cancelGoogleBtn');

        this.googleLoginInProgress = true;
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Waiting for browser...';

        // Show cancel button
        if (cancelBtn) {
            cancelBtn.style.display = 'block';
        }

        try {
            // Get token from Main process
            const token = await ipcRenderer.invoke('login-google');

            // Check if user cancelled
            if (!this.googleLoginInProgress) {
                return; // User clicked cancel
            }

            // Verify with Backend
            const res = await API.googleLogin(token);

            if (res.status === 'success') {
                this.app.state.setUser(res.user);
                this.app.renderApp(res.user);
                this.app.navigate('dashboard');
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
                    Toast.error('Login server busy. Please wait a moment and try again.');
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
                cancel.style.display = 'none';
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