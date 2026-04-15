const Toast = require('../../../components/Toast.js');
const API = require('../../../services/api.js');
const NAV_ITEMS = require('../../../config/navRegistry.js');

const ROLES = ['admin', 'manager', 'cashier'];

class NavPermissionsPanel {
    constructor(stateManager) {
        this.state = stateManager;
        // permissions shape: { admin: { transfers: true, pos: false, ... }, manager: {...}, cashier: {...} }
        this.permissions = {};
    }

    async render(container) {
        container.innerHTML = `<div class="p-md text-muted">Loading navigation config...</div>`;
        try {
            const res = await API.getNavPermissions();
            // Merge server config over defaults so any missing keys still render
            this.permissions = this._mergeWithDefaults(res.status === 'success' ? res.data : {});
        } catch (e) {
            this.permissions = this._mergeWithDefaults({});
        }
        container.innerHTML = this._buildHtml();
        this._attachEvents(container);
    }

    /** Fill in any gaps in the server config using defaultRoles from the registry */
    _mergeWithDefaults(serverConfig) {
        const result = {};
        for (const role of ROLES) {
            result[role] = {};
            for (const item of NAV_ITEMS) {
                if (item.locked) continue; // locked items are always on — not shown in config UI
                const serverVal = serverConfig?.[role]?.[item.key];
                result[role][item.key] = serverVal !== undefined
                    ? serverVal
                    : item.defaultRoles.includes(role);
            }
        }
        return result;
    }

    _buildHtml() {
        const configurableItems = NAV_ITEMS.filter(i => !i.locked);

        const headerCols = ROLES.map(r =>
            `<th style="padding: 10px 16px; text-align: center; color: #2271b1; font-size: 12px; text-transform: uppercase; letter-spacing: .04em;">${r}</th>`
        ).join('');

        const rows = configurableItems.map(item => {
            const cells = ROLES.map(role => {
                const checked = this.permissions[role][item.key] ? 'checked' : '';
                return `
                    <td style="padding: 10px 16px; text-align: center;">
                        <label class="nav-perm-toggle" style="display: inline-flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" class="nav-perm-cb" 
                                data-role="${role}" data-key="${item.key}" 
                                ${checked}
                                style="width: 16px; height: 16px; accent-color: #2271b1; cursor: pointer;">
                        </label>
                    </td>`;
            }).join('');

            return `
                <tr style="border-bottom: 1px solid #f0f0f1;">
                    <td style="padding: 10px 16px;">
                        <span style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #2c3338;">
                            <i class="fa-solid ${item.icon}" style="width: 16px; color: #8c8f94;"></i>
                            ${item.label}
                        </span>
                    </td>
                    ${cells}
                </tr>`;
        }).join('');

        return `
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #856404;">
                <i class="fa-solid fa-circle-info"></i>
                Changes apply immediately after saving. Users must reload the app to see updated navigation.
                <b>Locked items</b> (e.g. Notifications) are always visible and cannot be configured here.
            </div>

            <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                        <tr>
                            <th style="padding: 10px 16px; text-align: left; color: #2c3338; font-size: 13px; font-weight: 600;">Navigation Item</th>
                            ${headerCols}
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>

            <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
                <button id="saveNavPermsBtn" class="btn btn-primary" style="padding: 8px 20px; font-weight: 500;">
                    <i class="fa-solid fa-floppy-disk"></i> Save Navigation Config
                </button>
            </div>
        `;
    }

    _attachEvents(container) {
        // Live-update internal state on checkbox change
        container.querySelectorAll('.nav-perm-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                this.permissions[cb.dataset.role][cb.dataset.key] = cb.checked;
            });
        });

        container.querySelector('#saveNavPermsBtn')?.addEventListener('click', () => this._save());
    }

    async _save() {
        const btn = document.getElementById('saveNavPermsBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        try {
            const res = await API.saveNavPermissions(this.permissions);
            if (res.status === 'success') {
                // Flush cached permissions so Sidebar re-renders with fresh config on next navigate
                this.state.setNavPermissions(this.permissions);
                Toast.success("Navigation config saved.");
            } else {
                Toast.error(res.message || "Failed to save config.");
            }
        } catch (e) {
            Toast.error("Unexpected error saving config.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Navigation Config';
        }
    }
}

module.exports = NavPermissionsPanel;