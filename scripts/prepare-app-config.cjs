'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const fileValues = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
const apiUrl = process.env.API_URL || fileValues.API_URL || 'https://api.faranux.com/index.php';
const googleClientId = process.env.GOOGLE_CLIENT_ID || fileValues.GOOGLE_CLIENT_ID || '';
let parsedApiUrl;
try { parsedApiUrl = new URL(apiUrl); } catch (_) { throw new Error('API_URL must be an absolute HTTPS URL'); }
if (parsedApiUrl.protocol !== 'https:' || parsedApiUrl.username || parsedApiUrl.password) {
    throw new Error('API_URL must use HTTPS and contain no embedded credentials');
}
if (!googleClientId || !googleClientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error('Set a valid GOOGLE_CLIENT_ID in the build environment or local .env file');
}

// Package only public settings. Secrets such as GH_TOKEN are never copied.
fs.writeFileSync(path.join(root, 'app-config.json'), JSON.stringify({ API_URL: apiUrl, GOOGLE_CLIENT_ID: googleClientId }, null, 2) + String.fromCharCode(10));
console.log('Prepared app-config.json with public application settings.');
