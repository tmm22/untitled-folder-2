'use client';

import { ChangeEvent, useCallback } from 'react';
import { getAudioEngine } from '@/lib/audio/AudioEngine';
import { useTTSStore } from '@/modules/tts/store';
import { useAudioSnapshot } from '@/modules/tts/hooks/useAudioSnapshot';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
};

export function PlaybackControls() {
  const snapshot = useAudioSnapshot();
  const { isGenerating, isPlaying, playbackSpeed, volume, isLoopEnabled } = useTTSStore((state) => ({
    isGenerating: state.isGenerating,
    isPlaying: state.isPlaying,
    playbackSpeed: state.playbackSpeed,
    volume: state.volume,
    isLoopEnabled: state.isLoopEnabled,
  }));

  const { play, pause, stop, setPlaybackSpeed, setVolume, toggleLoop } = useTTSStore((state) => state.actions);

  const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    try {
      const engine = getAudioEngine();
      engine.seek(Number(event.target.value));
    } catch (error) {
      console.error('Failed to seek', error);
    }
  }, []);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-800/60 bg-slate-950/50 p-4 shadow-lg shadow-slate-900/40">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-sky-500 px-4 py-2 font-medium text-white shadow hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          onClick={() => (snapshot.isPlaying ? pause() : play())}
          disabled={isGenerating}
        >
          {snapshot.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-600"
          onClick={() => stop()}
          disabled={isGenerating}
        >
          Stop
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            isLoopEnabled
              ? 'border-sky-500/70 bg-sky-500/10 text-sky-200'
              : 'border-slate-700 text-slate-300 hover:bg-slate-800'
          }`}
          onClick={() => toggleLoop()}
        >
          Loop
        </button>
        <span className="ml-auto text-sm text-slate-400">
          {formatTime(snapshot.currentTime)} / {formatTime(snapshot.duration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={Number.isFinite(snapshot.duration) && snapshot.duration > 0 ? snapshot.duration : 0}
        step={0.1}
        value={snapshot.currentTime}
        onChange={handleSeek}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-slate-400">Playback speed</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700"
          />
          <span className="text-xs text-slate-500">{playbackSpeed.toFixed(1)}x</span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-slate-400">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700"
          />
          <span className="text-xs text-slate-500">{Math.round(volume * 100)}%</span>
        </label>
      </div>
    </section>
  );
}
