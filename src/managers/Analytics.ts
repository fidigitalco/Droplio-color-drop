/**
 * Anonymous gameplay stats for the games admin panel
 * (games.164.68.119.214.sslip.io).
 *
 * Sent: a random install id made on first launch (not an ad id, not tied to the
 * device or a person), platform, app version, OS version, locale and gameplay
 * events (sessions, levels, rewarded ads). The server turns the IP into a
 * country and does not keep it. Development builds and Expo Go send nothing.
 *
 * Events are queued in AsyncStorage, sent in batches every 30 s and when the
 * app goes to the background. Offline play only queues (capped at 500).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AppState, type AppStateStatus, Platform } from 'react-native';

const ENDPOINT = 'https://games.164.68.119.214.sslip.io/api/v1/events';
const INGEST_KEY = 'QVl5iDjUt2ftT257n8G3ppk6';
const STORAGE_KEY = 'droplio.analytics.v1';
const FLUSH_EVERY_MS = 30_000;
const MAX_QUEUE = 500;
const BATCH = 100;

type Params = Record<string, string | number | boolean | null>;
type QueuedEvent = { name: string; at: number; params: Params };

const enabled = !__DEV__ && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

function randomId(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function locale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 16);
  } catch {
    return '';
  }
}

class AnalyticsImpl {
  private installId = '';
  private queue: QueuedEvent[] = [];
  private inFlight = 0;
  private sessionStart = 0;
  private started = false;
  private loaded = false;
  private pending: QueuedEvent[] = []; // events tracked before storage was read

  init() {
    if (!enabled || this.started) return;
    this.started = true;
    this.beginSession();
    this.load().then(() => this.flush());
    setInterval(() => this.flush(), FLUSH_EVERY_MS);
    AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        this.beginSession();
      } else if (s === 'background') {
        this.endSession();
        this.flush();
        this.save();
      }
    });
  }

  track(name: string, params: Params = {}) {
    if (!enabled) return;
    const e = { name, at: Math.floor(Date.now() / 1000), params };
    if (!this.loaded) {
      this.pending.push(e);
      return;
    }
    this.queue.push(e);
    if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE);
  }

  private beginSession() {
    if (this.sessionStart) return;
    this.sessionStart = Date.now();
    this.track('session_start');
  }

  private endSession() {
    if (!this.sessionStart) return;
    const sec = Math.round((Date.now() - this.sessionStart) / 1000);
    this.sessionStart = 0;
    this.track('session_end', { sec });
  }

  private async load() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data.installId === 'string') this.installId = data.installId;
      if (data && Array.isArray(data.queue)) this.queue = data.queue;
    } catch {
      // unreadable state: start fresh
    }
    if (this.installId.length < 16) this.installId = randomId();
    this.loaded = true;
    this.queue = [...this.queue, ...this.pending].slice(-MAX_QUEUE);
    this.pending = [];
    this.save();
  }

  private save() {
    if (!this.loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ installId: this.installId, queue: this.queue })).catch(() => {});
  }

  async flush(): Promise<void> {
    if (!enabled || !this.loaded || this.inFlight || this.queue.length === 0) return;
    const batch = this.queue.slice(0, BATCH);
    this.inFlight = batch.length;
    let drop = false;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: INGEST_KEY,
          install_id: this.installId,
          platform: Platform.OS,
          app_version: Constants.expoConfig?.version ?? '',
          os_version: String(Platform.Version),
          locale: locale(),
          events: batch,
        }),
      });
      // 200: delivered. 400/403: the server will never accept it, so drop it
      // rather than retry forever. Anything else: keep for later.
      drop = res.status === 200 || res.status === 400 || res.status === 403;
    } catch {
      drop = false; // offline
    }
    const sent = this.inFlight;
    this.inFlight = 0;
    if (drop) {
      this.queue = this.queue.slice(sent);
      this.save();
      if (this.queue.length) this.flush();
    }
  }
}

export const Analytics = new AnalyticsImpl();
