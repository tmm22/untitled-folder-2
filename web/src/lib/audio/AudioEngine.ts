export interface AudioEngineSnapshot {
  isLoading: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isLooping: boolean;
  sourceUrl?: string;
}

type Listener = (snapshot: AudioEngineSnapshot) => void;

class BrowserAudioEngine {
  private audio: HTMLAudioElement;
  private listeners = new Set<Listener>();
  private snapshot: AudioEngineSnapshot;
  private objectUrl?: string;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.snapshot = {
      isLoading: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
      volume: 0.75,
      isLooping: false,
    };

    this.attachEventListeners();
  }

  private attachEventListeners() {
    this.audio.addEventListener('timeupdate', () => {
      this.updateSnapshot({ currentTime: this.audio.currentTime, duration: this.audio.duration });
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.updateSnapshot({ duration: this.audio.duration, isLoading: false });
    });

    this.audio.addEventListener('waiting', () => {
      this.updateSnapshot({ isLoading: true });
    });

    this.audio.addEventListener('playing', () => {
      this.updateSnapshot({ isLoading: false, isPlaying: true });
    });

    this.audio.addEventListener('pause', () => {
      this.updateSnapshot({ isPlaying: false });
    });

    this.audio.addEventListener('ended', () => {
      if (!this.audio.loop) {
        this.updateSnapshot({ isPlaying: false, currentTime: 0 });
      }
    });
  }

  private updateSnapshot(partial: Partial<AudioEngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AudioEngineSnapshot {
    return this.snapshot;
  }

  async loadFromBase64(base64Audio: string, contentType: string) {
    this.updateSnapshot({ isLoading: true, isPlaying: false });

    const binary = atob(base64Audio);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([buffer], { type: contentType });

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = URL.createObjectURL(blob);
    this.audio.src = this.objectUrl;
    this.audio.load();
    this.updateSnapshot({ sourceUrl: this.objectUrl });
  }

  setVolume(volume: number) {
    this.audio.volume = volume;
    this.updateSnapshot({ volume });
  }

  setPlaybackRate(rate: number) {
    this.audio.playbackRate = rate;
    this.updateSnapshot({ playbackRate: rate });
  }

  setLoop(loop: boolean) {
    this.audio.loop = loop;
    this.updateSnapshot({ isLooping: loop });
  }

  seek(timeSeconds: number) {
    this.audio.currentTime = timeSeconds;
    this.updateSnapshot({ currentTime: timeSeconds });
  }

  async play() {
    await this.audio.play();
    this.updateSnapshot({ isPlaying: true });
  }

  pause() {
    this.audio.pause();
    this.updateSnapshot({ isPlaying: false });
  }

  stop() {
    this.pause();
    this.seek(0);
  }

  teardown() {
    this.audio.pause();
    this.audio.src = '';
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
    this.listeners.clear();
  }
}

let sharedEngine: BrowserAudioEngine | null = null;

export const getAudioEngine = () => {
  if (typeof window === 'undefined') {
    throw new Error('AudioEngine is only available in the browser');
  }

  if (!sharedEngine) {
    sharedEngine = new BrowserAudioEngine();
  }

  return sharedEngine;
};

export type AudioEngine = BrowserAudioEngine;
