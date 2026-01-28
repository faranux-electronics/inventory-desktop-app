const Toast = require('../components/Toast.js');

class LoginView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const appContainer = document.getElementById('app');
        appContainer.innerHTML = `
      <div class="login-container">
        <div class="login-card">
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
        </div>
      </div>
    `;

        this.attachEvents();
    }

    attachEvents() {
        const form = document.getElementById('loginForm');
        const googleBtn = document.getElementById('googleLoginBtn');
        const loginBtn = document.getElementById('loginBtn');

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
                await this.app.handleLogin({ email, password });
            } catch (e) {
                Toast.error("Login failed");
            } finally {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
            }
        });

        googleBtn.addEventListener('click', async () => {
            googleBtn.disabled = true;
            googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Google...';

            try {
                await this.app.handleGoogleLogin();
            } catch (e) {
                Toast.error("Google login failed");
            } finally {
                googleBtn.disabled = false;
                googleBtn.innerHTML = '<i class="fa-brands fa-google"></i> Sign in with Google';
            }
        });
    }
}

module.exports = LoginView;