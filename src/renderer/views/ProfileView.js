const Toast = require('../components/Toast.js');
const API = require('../services/api.js');

class ProfileView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
    }

    render() {
        const user = this.state.getUser();
        // If has_password is NOT set (old session), assume true for safety, unless google_id is implied?
        // Best to just assume true or false based on the flag.
        // If key is missing, defaults to false which might be risky, but our backend handles the check safely.
        const hasPassword = user.has_password !== false;

        const content = document.getElementById('content');

        // Conditional HTML for Password Field
        const currentPassField = hasPassword ? `
            <div class="form-group mb-md">
                <label class="form-label">Current Password <span class="text-error">*</span></label>
                <input type="password" id="pCurrentPass" class="form-input" required placeholder="Required to save changes">
            </div>
        ` : `
            <div class="alert bg-neutral-100 p-sm rounded mb-md text-sm text-neutral-600">
                <i class="fa-brands fa-google mr-sm"></i> Signed in via Google. No current password required.
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
                            <input type="text" id="pName" class="form-input" value="${user.name}">
                        </div>

                        <div class="form-group mb-md">
                            <label class="form-label">Email Address</label>
                            <input type="email" id="pEmail" class="form-input" value="${user.email}">
                        </div>

                        <hr class="border-b border-neutral-200 my-lg">
                        
                        <h3 class="font-bold mb-sm">Security</h3>
                        
                        ${currentPassField}

                        <div class="form-group mb-lg">
                            <label class="form-label">New Password ${hasPassword ? '(Optional)' : '(Set Password)'}</label>
                            <input type="password" id="pNewPass" class="form-input" placeholder="${hasPassword ? 'Leave blank to keep current' : 'Create a password'}">
                        </div>

                        <button type="submit" class="btn btn-primary" id="saveProfileBtn">Save Changes</button>
                    </form>
                </div>
            </div>
        `;

        this.attachEvents(user, hasPassword);
    }

    attachEvents(user, hasPassword) {
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveProfileBtn');
            const currentPass = document.getElementById('pCurrentPass').value;

            // Only validate current password if the user actually has one
            if(hasPassword && !currentPass) {
                return Toast.error("Current password is required");
            }

            const data = {
                id: user.id,
                name: document.getElementById('pName').value,
                email: document.getElementById('pEmail').value,
                current_password: currentPass, // Send empty if Google user
                new_password: document.getElementById('pNewPass').value
            };

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            try {
                const res = await API.updateProfile(data);

                if (res.status === 'success') {
                    this.state.setUser({ ...user, ...res.user });
                    this.app.renderApp(this.state.getUser());
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