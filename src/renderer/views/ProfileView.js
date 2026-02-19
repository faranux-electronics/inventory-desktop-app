//
const Toast = require('../components/Toast.js');
const API = require('../services/api.js');

class ProfileView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
    }

    async render() {
        const user = this.state.getUser();
        const isGoogleUser = user.google_id === true;
        const content = document.getElementById('content');

        content.innerHTML = `<div class="p-lg text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading Profile...</div>`;

        let locations = [];
        try {
            const locRes = await API.getLocations();
            if (locRes.status === 'success') locations = locRes.data;
        } catch (e) {
            console.warn("Could not load locations for profile branch switcher");
        }

        // Branch Switcher Logic
        let branchSwitcherHtml = '';
        const allowed = user.allowed_branches || (user.branch_id ? [user.branch_id] : []);

        if (allowed.length > 1) {
            const options = allowed.map(locId => {
                const loc = locations.find(l => String(l.id) === String(locId));
                const locName = loc ? loc.name : `Branch #${locId}`;
                return `<option value="${locId}" ${String(user.branch_id) === String(locId) ? 'selected' : ''}>${locName}</option>`;
            }).join('');

            branchSwitcherHtml = `
                <div class="form-group mb-md">
                    <label class="form-label" style="color: #2c3338; font-weight: 500;">Active Working Branch</label>
                    <select id="pActiveBranch" class="form-select" style="background-color: #f0f6fb; border-color: #2271b1; font-weight: 600;">
                        ${options}
                    </select>
                    <p class="text-xs text-muted mt-xs"><i class="fa-solid fa-circle-info"></i> You have access to multiple branches. Switching updates your current stock view.</p>
                </div>
            `;
        } else {
            const singleLoc = locations.find(l => String(l.id) === String(allowed[0]));
            branchSwitcherHtml = `
                <div class="form-group mb-md">
                    <label class="form-label" style="color: #2c3338; font-weight: 500;">Assigned Branch</label>
                    <input type="text" class="form-input" style="background: #f6f7f7; color: #646970;" value="${singleLoc ? singleLoc.name : (allowed[0] ? 'Branch #' + allowed[0] : 'Head Office')}" readonly disabled>
                    <input type="hidden" id="pActiveBranch" value="${allowed[0] || ''}">
                </div>
            `;
        }

        const currentPassField = !isGoogleUser ? `
            <div class="form-group mb-md">
                <label class="form-label" style="color: #2c3338; font-weight: 500;">Current Password</label>
                <input type="password" id="pCurrentPass" class="form-input" placeholder="Required only to change password" style="border-color: #8c8f94;">
            </div>
        ` : `
            <input type="hidden" id="pCurrentPass" value="">
        `;

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row">
                    <h1 class="page-title text-neutral-800 font-normal">Profile Settings</h1>
                </div>
            </div>

            <div style="max-width: 900px; background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden; display: flex; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                
                <div style="width: 280px; background: #f8f9fa; border-right: 1px solid #c3c4c7; padding: 40px 24px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                    <div style="width: 84px; height: 84px; background: #2271b1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; font-weight: 600; margin-bottom: 16px; border: 4px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        ${user.name.charAt(0).toUpperCase()}
                    </div>
                    <h2 style="font-size: 18px; color: #1d2327; margin-bottom: 8px; font-weight: 600;">${user.name}</h2>
                    <span style="background: #dcdcde; color: #2c3338; padding: 3px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                        ${user.role}
                    </span>
                    
                    <div style="margin-top: auto; padding-top: 30px; width: 100%;">
                        <div class="text-xs text-muted italic" style="border-top: 1px solid #dcdcde; padding-top: 15px;">
                            ${isGoogleUser ? '<i class="fa-brands fa-google"></i> Google Account Linked' : '<i class="fa-solid fa-envelope"></i> Standard Email Login'}
                        </div>
                    </div>
                </div>

                <div style="flex: 1; padding: 40px;">
                    <form id="profileForm">
                        <div style="margin-bottom: 30px;">
                            <h3 style="font-size: 14px; font-weight: 600; color: #1d2327; border-bottom: 1px solid #f0f0f1; padding-bottom: 10px; margin-bottom: 20px;">
                                Account Information
                            </h3>
                            
                            <div class="form-group mb-md">
                                <label class="form-label" style="color: #2c3338; font-weight: 500;">Display Name</label>
                                <input type="text" id="pName" class="form-input" value="${user.name}" required style="border-color: #8c8f94;">
                            </div>

                            <div class="form-group mb-md">
                                <label class="form-label" style="color: #2c3338; font-weight: 500;">Email Address</label>
                                <input type="email" id="pEmail" class="form-input" value="${user.email}" readonly disabled style="background: #f6f7f7; color: #646970; border-color: #dcdcde;">
                            </div>

                            ${branchSwitcherHtml}
                        </div>

                        <div style="margin-bottom: 30px;">
                            <h3 style="font-size: 14px; font-weight: 600; color: #1d2327; border-bottom: 1px solid #f0f0f1; padding-bottom: 10px; margin-bottom: 20px;">
                                Security & Password
                            </h3>
                            
                            ${currentPassField}

                            <div class="form-group">
                                <label class="form-label" style="color: #2c3338; font-weight: 500;">New Password</label>
                                <input type="password" id="pNewPass" class="form-input" placeholder="Leave blank to keep current" style="border-color: #8c8f94;">
                                ${isGoogleUser ? '<p class="text-xs text-muted mt-xs">Setting a password allows you to login via email later.</p>' : ''}
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0f0f1;">
                            <button type="submit" class="btn btn-primary" id="saveProfileBtn" style="padding: 10px 30px; font-weight: 600; box-shadow: none;">
                                Update Profile
                            </button>
                        </div>
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
            const activeBranch = document.getElementById('pActiveBranch')?.value || null;

            if (!name) return Toast.error("Name is required");

            if (!isGoogleUser && newPass && !currentPass) {
                return Toast.error("Current password is required to set a new password");
            }

            const data = {
                name: name,
                email: user.email,
                current_password: currentPass,
                new_password: newPass,
                active_branch: activeBranch
            };

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            try {
                const res = await API.updateProfile(data);
                if (res.status === 'success') {
                    this.state.setUser(res.user);
                    this.app.renderApp(res.user); // Refresh sidebar/app state
                    this.app.navigate('profile');
                    Toast.success("Profile Updated Successfully!");
                } else {
                    Toast.error(res.message || "Update failed");
                }
            } catch (error) {
                Toast.error("Network Error");
            } finally {
                btn.disabled = false;
                btn.textContent = "Update Profile";
            }
        });
    }
}

module.exports = ProfileView;