# Faranux ERP Desktop App

### Roles
- Admin: Can do everything (Manage users, settings, inventory).
- Manager: Can manage inventory, transfers, orders (No user creation).
- Cashier: Can only process orders. 
- Accountant: Can only view reports/history.

## Features

- **Point of Sale (POS)**: Streamlined interface for processing customer orders and handling multiple carts.
- **Inventory & Stock Transfers**: Manage local stock, track incoming transfers, and reorder fulfillment priority by branching.
- **Product Management**: View, import, and organize product catalogs.
- **User & Profile Management**: Add staff, assign roles, and handle authentication securely.
- **System Logs & Notifications**: Integrated logging and native OS notifications for system events.

### Real-Time Live Cart Display
The application includes a real-time Live Cart Display feature that shows cart contents on a separate web-enabled display:

- **Real-time Updates**: Cart items, quantities, and totals update every second via polling
- **Web-Based Display**: Accessible through any web browser on customer-facing devices
- **Payment QR Codes**: Generates QR codes that link to payment processing
- **Connection Monitoring**: Shows reconnection status and handles network interruptions with auto-reload
- **Responsive Design**: Works on various screen sizes and orientations
- **Idle State**: Displays branded waiting screen when no cart is active
- **Payment Confirmation**: Shows "PAID" stamp animation when transaction is complete
- **Multi-Cart Support**: Select which cart to display when using multiple simultaneous sales

#### Live Cart Setup
1. Enable Live Cart Display in the POS Payment Panel settings (gear icon → Settings)
2. Configure a unique Register ID (e.g., "till-1", "till-2") for the POS terminal
3. Access the Live Cart Display page on a customer-facing device using the URL format:
   ```
   public/index.html?api=<API_URL>&register=<REGISTER_ID>
   ```
4. Use the eye icon (👁️) on cart tabs to select which cart is shown on the display

#### Configuration Parameters
- `api`: API base URL (e.g., `https://api.example.com` or `http://localhost:8000`)
- `register`: Unique register identifier for the POS terminal (must match the Register ID in POS settings)

### Reusable UI Components
The application includes several reusable vanilla JS UI components (located in `src/renderer/components/`) to maintain consistency and ease of development:

- **Resizer (`Resizer.js`)**: A versatile drag-to-resize divider that can be used to add adjustable split-panes. Supports both horizontal and vertical orientations and is currently used in the POS and Transfers views.
- **Modal (`Modal.js`)**: A generic modal component for dialogs and action confirmations.
- **Toast (`Toast.js`)**: A lightweight notification system for temporary flash messages.
- **Button (`Button.js`)**: Reusable button string generator with multiple stylistic variants (primary, outlined, ghost).


## Release and Update Workflow

- Source code is maintained in [inventory-desktop-app](https://github.com/faranux-electronics/inventory-desktop-app).
- Installers and auto-update files are published in [faranux-erp-app](https://github.com/faranux-electronics/faranux-erp-app/releases). This repository is public so installed apps can check for updates without storing a GitHub credential in the app.
- Releases are created by pushing a version tag such as `v1.4.5`. The GitHub Actions workflow builds the installer and uploads the release files to `faranux-erp-app`.

### Required GitHub Actions secrets

In the source repository, configure `GOOGLE_CLIENT_ID` and `API_URL` as repository secrets. Also add `RELEASES_TOKEN`: a fine-grained token owned by `faranux-electronics`, limited to the `faranux-erp-app` repository, with **Contents: Read and write**. The workflow uses it only to publish release artifacts. Never put this token in `.env`, the packaged app, or source code.

### Existing installation migration

The transition release is also uploaded to the existing `inventory-desktop-app` update feed so installed copies can update and switch to the new feed. Keep `inventory-desktop-app` public until all deployed devices have installed the transition release. If the source repository is made private before an older installation updates, that installation cannot read the old feed and must be updated manually from the public releases page.


## Installation Guide

### System Requirements
- Windows 10 or later
- 4GB RAM minimum
- 500MB free disk space

### Installation Steps

1. Download the latest installer from the [Faranux ERP releases page](https://github.com/faranux-electronics/faranux-erp-app/releases).

2. When you run the installer, Windows SmartScreen might show a warning message. To proceed with the installation:
   - Click on "More info" or "..." (three dots)
   - Click "Run anyway"
   
   > **Note**: This warning appears because the app is not signed with a Microsoft-verified certificate. The application is safe to install.

3. Follow the installation wizard prompts:
   - Choose installation directory
   - Create desktop shortcut (optional)
   - Click "Install"

4. Once installation is complete, launch the application from:
   - Desktop shortcut (if created)
   - Start menu under "Faranux MIS"
   - Installation directory

### First Time Setup
1. Log in using your assigned credentials or the default admin credentials.
2. Navigate to Settings to configure your system preferences.
3. Add or update user roles if necessary.
4. Begin adding inventory and processing sales.
