const Toast = require('../../components/Toast.js');
const Modal = require('../../components/Modal.js');
const Input = require('../../components/Input.js');
const Button = require('../../components/Button.js');
const PageHeader = require('../../components/PageHeader.js');
const API = require('../../services/api.js');

class ProfileView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
    }

    async render() {
        const user = this.state.getUser();
        const isGoogleUser = user.google_id === true;
        const content = document.getElementById('content');
        content.dataset.view = 'profile';

        content.innerHTML = `<div class="p-lg text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading Profile...</div>`;

        let locations = [];
        try {
            // Use your centralized state manager instead of calling the API directly!
            locations = await this.state.loadLocations();
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
                    <label class="form-label" style="color: var(--theme-text-primary); font-weight: 500;">Active Working Branch</label>
                    <select id="pActiveBranch" class="form-select" style="background-color: var(--theme-info-surface); border-color: var(--palette-hex-2271b1); font-weight: 600;">
                        ${options}
                    </select>
                    <p class="text-xs text-muted mt-xs"><i class="fa-solid fa-circle-info"></i> You have access to multiple branches. Switching updates your current stock view.</p>
                </div>
            `;
        } else {
            const singleLoc = locations.find(l => String(l.id) === String(allowed[0]));
            branchSwitcherHtml = `
                <div class="form-group mb-md">
                    <label class="form-label" style="color: var(--theme-text-primary); font-weight: 500;">Assigned Branch</label>
                    ${Input.html({value: singleLoc ? singleLoc.name : (allowed[0] ? 'Branch #' + allowed[0] : 'Head Office'), readonly: true, disabled: true, className: 'profile-readonly-input'})}
                    <input type="hidden" id="pActiveBranch" value="${allowed[0] || ''}">
                </div>
            `;
        }

        const currentPassField = !isGoogleUser ? `
            ${Input.field({label: 'Current Password', type: 'password', id: 'pCurrentPass', placeholder: 'Required only to change password', wrapperClass: 'mb-md'})}
        ` : `
            <input type="hidden" id="pCurrentPass" value="">
        `;

        content.innerHTML = `
            ${PageHeader.html({title: 'Profile Settings', icon: 'fa-solid fa-user-gear', subtitle: 'Manage your account details, branch access, and password.', actions: Button.html({text: 'Logout', icon: 'fa-solid fa-right-from-bracket', variant: 'outline', size: 'lg', id: 'profileLogoutBtn', className: 'profile-logout-btn'}), className: 'page-header-surface profile-page-header'})}

            <div class="profile-layout">

                <div class="profile-summary">
                    <div style="width: 84px; height: 84px; background: var(--palette-hex-2271b1); color: var(--palette-name-white); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; font-weight: 600; margin-bottom: 16px; border: 4px solid var(--palette-name-white); box-shadow: 0 2px 4px var(--palette-rgb-0-0-0-0p1);">
                        ${user.name.charAt(0).toUpperCase()}
                    </div>
                    <h2 style="font-size: 18px; color: var(--theme-text-primary); margin-bottom: 8px; font-weight: 600;">${user.name}</h2>
                    <span style="background: var(--palette-hex-dcdcde); color: var(--theme-text-primary); padding: 3px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                        ${user.role}
                    </span>

                    <div style="margin-top: auto; padding-top: 30px; width: 100%;">
                        <div class="text-xs text-muted italic" style="border-top: 1px solid var(--theme-border); padding-top: 15px;">
                            ${isGoogleUser ? '<i class="fa-brands fa-google"></i> Google Account Linked' : '<i class="fa-solid fa-envelope"></i> Standard Email Login'}
                        </div>
                    </div>
                </div>

                <div class="profile-details">
                    <form id="profileForm">
                        <div style="margin-bottom: 30px;">
                            <h3 style="font-size: 14px; font-weight: 600; color: var(--theme-text-primary); border-bottom: 1px solid var(--palette-hex-f0f0f1); padding-bottom: 10px; margin-bottom: 20px;">
                                Account Information
                            </h3>

                            ${Input.field({label: 'Display Name', id: 'pName', value: user.name, required: true, wrapperClass: 'mb-md'})}

                            ${Input.field({label: 'Email Address', type: 'email', id: 'pEmail', value: user.email, readonly: true, disabled: true, className: 'profile-readonly-input', wrapperClass: 'mb-md'})}

                            ${branchSwitcherHtml}
                        </div>

                        <div style="margin-bottom: 30px;">
                            <h3 style="font-size: 14px; font-weight: 600; color: var(--theme-text-primary); border-bottom: 1px solid var(--palette-hex-f0f0f1); padding-bottom: 10px; margin-bottom: 20px;">
                                Security & Password
                            </h3>

                            ${currentPassField}

                            ${Input.field({label: 'New Password', type: 'password', id: 'pNewPass', placeholder: 'Leave blank to keep current'})}
                            ${isGoogleUser ? '<p class="text-xs text-muted mt-xs">Setting a password allows you to login via email later.</p>' : ''}
                        </div>

                        <div style="display: flex; justify-content: flex-end; margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--palette-hex-f0f0f1);">
                            ${Button.html({text: 'Update Profile', type: 'submit', id: 'saveProfileBtn', variant: 'primary', size: 'lg', className: 'profile-save-btn'})}
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('profileLogoutBtn')?.addEventListener('click', () => {
            Modal.open({
                title: 'Confirm Logout',
                body: '<div class="text-center p-md"><p>Are you sure you want to log out?</p></div>',
                confirmText: 'Logout',
                cancelText: 'Cancel',
                onConfirm: async () => this.app.handleLogout()
            });
        });

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
