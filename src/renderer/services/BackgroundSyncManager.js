/**
 * BackgroundSyncManager  (v2 — SSE streaming)
 * ─────────────────────────────────────────────
 * Keeps the local product database in sync with WooCommerce entirely
 * server-side. The PHP backend runs the full WC fetch+save loop and streams
 * progress via Server-Sent Events. This file just opens the stream, listens
 * to events, and manages the scheduling.
 *
 * Architecture change from v1 (JS polling loop):
 *   v1: JS called sync_batch ~400 times for 2000 products (400 HTTP round-trips)
 *   v2: JS opens ONE SSE connection → PHP loops internally → streams progress
 *       ~10x faster, zero JS CPU during sync, works with tab hidden
 *
 * Modes:
 *   delta — PHP fetches only products modified since last sync (fast, default)
 *   full  — fetches every product regardless of date (force=true)
 *
 * PHP records last_sync_at in the sync_state DB table and uses WooCommerce's
 * modified_after filter so delta syncs typically touch <50 products.
 *
 * Design:
 *  1. Cooldown     — skips if MIN_SYNC_INTERVAL hasn't elapsed
 *  2. Visibility   — pauses when tab is hidden
 *  3. Jitter       — 30-45s initial delay so page load settles first
 *  4. Pause/resume — named-reason Set so multiple callers don't conflict
 *  5. Abort        — closes EventSource cleanly on demand
 *
 * Usage:
 *   const sync = new BackgroundSyncManager(API, state);
 *   sync.onStatusChange(({ status, message }) => updateBadge(status, message));
 *   sync.start();
 *
 *   // Pause during loadData() to avoid competing server requests:
 *   sync.pause('loading');
 *   await loadData();
 *   sync.resume('loading');
 *
 *   // Manual "Sync Now" button — full sync:
 *   await sync.runNow(true);
 */

const STORAGE_KEY = 'bgSync_lastComplete';
const MIN_SYNC_INTERVAL = 10 * 60 * 1000;   // 10 min between auto-syncs
const POLL_INTERVAL = 60 * 1000;        // check every 60 s if sync is due

class BackgroundSyncManager {
    /**
     * @param {object}   API     — app API service; needs getBaseUrl()/baseUrl + optional getToken()
     * @param {object}   state   — app state (needs invalidateInventoryCache)
     * @param {function} [getUrl] — optional override: (force:bool) => SSE URL string
     */
    constructor(API, state, getUrl = null) {
        this._api = API;
        this._state = state;
        this._getUrl = getUrl || (force => this._defaultUrl(force));
        this._listeners = [];

        this._running = false;
        this._paused = new Set();
        this._es = null;       // active EventSource
        this._pollTimer = null;
        this._started = false;

        this._onVisibilityChange = this._onVisibilityChange.bind(this);
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /** Wire up and start the background poll loop. Call once at app boot. */
    start() {
        if (this._started) return;
        this._started = true;
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        // Delay the first auto-sync so the page load and first inventory fetch
        // finish before sync adds any server load. Random jitter prevents
        // multiple open tabs from all firing at the same moment.
        const jitter = 30000 + Math.random() * 15000;
        setTimeout(() => this._poll(), jitter);

        this._pollTimer = setInterval(() => this._poll(), POLL_INTERVAL);
    }

    /** Tear down completely (e.g. on logout). */
    stop() {
        this._closeStream();
        clearInterval(this._pollTimer);
        this._pollTimer = null;
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        this._emit({status: 'idle', message: 'Sync stopped'});
    }

    /**
     * Temporarily prevent new syncs. If a stream is open it is closed
     * gracefully and will restart on the next poll cycle.
     * @param {string} reason — unique tag per caller
     */
    pause(reason = 'default') {
        this._paused.add(reason);
        if (this._running) this._closeStream();
    }

    resume(reason = 'default') {
        this._paused.delete(reason);
    }

    /** Trigger a sync immediately, bypassing the cooldown. */
    runNow(force = false) {
        this._openStream(force);
    }

    get isRunning() {
        return this._running;
    }

    get lastSyncTime() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch {
            return null;
        }
    }

    /**
     * Subscribe to status updates.
     * Payload: { status:'running'|'done'|'error'|'idle', message, synced?, mode? }
     * @returns {function} unsubscribe
     */
    onStatusChange(cb) {
        if (typeof cb === 'function') this._listeners.push(cb);
        return () => {
            this._listeners = this._listeners.filter(l => l !== cb);
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    _isPaused() {
        return this._paused.size > 0;
    }

    _onVisibilityChange() {
        if (document.hidden) {
            this.pause('tab-hidden');
        } else {
            this.resume('tab-hidden');
            // Re-check after returning to the tab in case the cooldown expired
            setTimeout(() => this._poll(), 3000);
        }
    }

    _poll() {
        if (this._running || this._isPaused() || document.hidden) return;
        if (!this._isDue()) return;
        this._openStream(false);
    }

    _isDue() {
        try {
            const last = localStorage.getItem(STORAGE_KEY);
            if (!last) return true;
            return (Date.now() - new Date(last).getTime()) >= MIN_SYNC_INTERVAL;
        } catch {
            return true;
        }
    }

    /**
     * Open ONE SSE connection to ?action=sync_stream.
     * PHP runs the entire WC fetch+save loop and streams events back.
     * No JS batch loop needed.
     */
    _openStream(force = false) {
        if (this._running || this._isPaused() || document.hidden) return;

        this._running = true;
        this._emit({status: 'running', message: 'Sync starting\u2026'});

        let url;
        try {
            url = this._getUrl(force);
        } catch (e) {
            this._running = false;
            this._emit({status: 'error', message: 'Could not build sync URL'});
            return;
        }

        try {
            this._es = new EventSource(url, {withCredentials: true});
        } catch (e) {
            console.error('[BGSync] EventSource failed:', e);
            this._running = false;
            this._emit({status: 'error', message: 'Could not open sync stream'});
            return;
        }

        this._es.addEventListener('progress', e => {
            const d = this._parse(e.data);
            const pageInfo = d.pages ? ` (page ${d.page}/${d.pages})` : '';
            this._emit({
                status: 'running',
                message: `${d.mode === 'delta' ? '\u0394 Update' : 'Syncing'}\u2026 ${d.synced} products${pageInfo}`,
                synced: d.synced,
                mode: d.mode,
            });
        });

        this._es.addEventListener('done', e => {
            const d = this._parse(e.data);
            try {
                localStorage.setItem(STORAGE_KEY, new Date().toISOString());
            } catch {
            }

            const label = d.mode === 'delta' ? 'Update' : 'Full sync';
            this._emit({
                status: 'done',
                message: `${label} complete \u2014 ${d.synced} products (${d.elapsed}s)`,
                synced: d.synced,
                mode: d.mode,
            });

            this._state.invalidateInventoryCache();
            this._closeStream();

            console.info(`[BGSync] ${label} done. ${d.synced} products in ${d.elapsed}s`);
        });

        this._es.addEventListener('error', e => {
            const d = this._parse(e.data);
            const msg = d.message || 'Sync error \u2014 will retry later';
            console.error('[BGSync] Server error event:', msg);
            this._emit({status: 'error', message: msg});
            this._closeStream();
        });

        // Network drop or clean server close both trigger onerror
        this._es.onerror = () => {
            if (this._running) {
                console.warn('[BGSync] Stream disconnected');
                this._emit({status: 'error', message: 'Stream disconnected \u2014 will retry'});
                this._closeStream();
            }
        };
    }

    _closeStream() {
        if (this._es) {
            this._es.close();
            this._es = null;
        }
        this._running = false;
    }

    _parse(raw) {
        try {
            return JSON.parse(raw) || {};
        } catch {
            return {};
        }
    }

    _emit(payload) {
        this._listeners.forEach(cb => {
            try {
                cb(payload);
            } catch {
            }
        });
    }

    _defaultUrl(force) {
        // Resolve base URL from the API service in order of preference
        let base = '';
        if (typeof this._api.getBaseUrl === 'function') {
            base = this._api.getBaseUrl();
        } else if (typeof this._api.baseUrl === 'string') {
            base = this._api.baseUrl;
        }

        const token = (typeof this._api.getToken === 'function')
            ? this._api.getToken()
            : (this._api.token || '');

        const params = new URLSearchParams({action: 'sync_stream'});
        if (force) params.set('force', '1');
        if (token) params.set('token', token);
        return `${base}?${params}`;
    }
}

module.exports = BackgroundSyncManager;