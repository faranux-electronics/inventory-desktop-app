const Toast = require('../components/Toast.js');
const API = require('../services/api.js');

class ProfileView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
    }

    render() {
        const user = this.state.getUser();
        const isGoogleUser = user.google_id === true;

        const content = document.getElementById('content');

        const currentPassField = !isGoogleUser ? `
            <div class="form-group mb-md">
                <label class="form-label">Current Password <span class="text-error">*</span></label>
                <input type="password" id="pCurrentPass" class="form-input" placeholder="Required to change password">
            </div>
        ` : `
            <div class="alert bg-neutral-100 p-sm rounded mb-md text-sm text-neutral-600">
                <i class="fa-brands fa-google mr-sm"></i> Signed in via Google. No current password required to set a new password.
                <input type="hidden" id="pCurrentPass" value="">
            </div>
        `;

        content.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">My Profile</h1>
            </div>

            <div class="card" style="max-width: 600px;">
                <div class="p-lg">
                    <div class="flex items-center gap-lg mb-lg border-b border-neutral-200 pb-lg">
                        <div style="width: 70px; height: 70px; background: var(--primary-500); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold;">
                            ${user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 class="font-bold text-lg">${user.name}</h2>
                            <p class="text-muted text-sm badge badge-neutral">${user.role.toUpperCase()}</p>
                        </div>
                    </div>

                    <form id="profileForm">
                        <div class="form-group mb-md">
                            <label class="form-label">Full Name</label>
                            <input type="text" id="pName" class="form-input" value="${user.name}" required>
                        </div>

                        <div class="form-group mb-md">
                            <label class="form-label">Email Address</label>
                            <input type="email" id="pEmail" class="form-input" value="${user.email}" readonly style="background-color: #f5f5f5; cursor: not-allowed;">
                            <small class="text-muted text-xs mt-xs block">Email cannot be changed for security reasons</small>
                        </div>

                        <hr class="border-b border-neutral-200 my-lg">
                        
                        <h3 class="font-bold mb-sm">Security</h3>
                        
                        ${currentPassField}

                        <div class="form-group mb-lg">
                            <label class="form-label">New Password ${isGoogleUser ? '(Set Password)' : '(Optional)'}</label>
                            <input type="password" id="pNewPass" class="form-input" placeholder="${isGoogleUser ? 'Create a password for email login' : 'Leave blank to keep current'}">
                        </div>

                        <button type="submit" class="btn btn-primary" id="saveProfileBtn">Save Changes</button>
                    </form>
                </div>
            </div>
        `;

        this.attachEvents(user, isGoogleUser);
    }

    attachEvents(user, isGoogleUser) {
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveProfileBtn');
            const name = document.getElementById('pName').value.trim();
            const currentPass = document.getElementById('pCurrentPass').value;
            const newPass = document.getElementById('pNewPass').value;

            // Validate name
            if (!name) {
                return Toast.error("Name is required");
            }

            // For non-Google users changing password, current password is required
            if (!isGoogleUser && newPass && !currentPass) {
                return Toast.error("Current password is required to set a new password");
            }

            const data = {
                name: name,
                email: user.email, // Keep current email (backend will validate this)
                current_password: currentPass,
                new_password: newPass
            };

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            try {
                const res = await API.updateProfile(data);

                if (res.status === 'success') {
                    // Update state with new user data
                    this.state.setUser(res.user);
                    this.app.renderApp(res.user);
                    this.app.navigate('profile');
                    Toast.success("Profile Updated");
                } else {
                    Toast.error(res.message || "Update failed");
                }
            } catch (error) {
                Toast.error("Network Error");
            } finally {
                btn.disabled = false;
                btn.textContent = "Save Changes";
            }
        });
    }
}

module.exports = ProfileView;