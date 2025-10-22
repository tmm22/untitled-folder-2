'use client';

import { ChangeEvent, useCallback } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
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
  const isGenerating = useTTSStore((state) => state.isGenerating);
  const playbackSpeed = useTTSStore((state) => state.playbackSpeed);
  const volume = useTTSStore((state) => state.volume);
  const isLoopEnabled = useTTSStore((state) => state.isLoopEnabled);

  const { play, pause, stop, setPlaybackSpeed, setVolume, toggleLoop } = useTTSStore((state) => state.actions);

  const canSeek = Number.isFinite(snapshot.duration) && snapshot.duration > 0;
  const sliderMax = canSeek ? snapshot.duration : 1;
  const sliderValue = canSeek ? snapshot.currentTime : 0;

  const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    try {
      const engine = getAudioEngine();
      engine.seek(Number(event.target.value));
    } catch (error) {
      console.error('Failed to seek', error);
    }
  }, []);

  return (
    <CollapsibleSection title="Playback controls" className="flex flex-col gap-6" minHeight={260} maxHeight={640}>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <button
          type="button"
          className="control-button control-button--primary"
          onClick={() => (snapshot.isPlaying ? pause() : play())}
          disabled={isGenerating}
        >
          {snapshot.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="control-button control-button--ghost"
          onClick={() => stop()}
          disabled={isGenerating}
        >
          Stop
        </button>
        <button
          type="button"
          className={`control-button ${isLoopEnabled ? 'control-button--toggle-active' : ''}`}
          onClick={() => toggleLoop()}
          aria-pressed={isLoopEnabled}
        >
          Loop
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-cream-300/80 bg-cream-50/70 px-4 py-4 shadow-inner">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={0.1}
          value={sliderValue}
          onChange={handleSeek}
          disabled={!canSeek}
          aria-label="Seek playback position"
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-cream-300 accent-charcoal-900 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex justify-between text-xs font-semibold text-cocoa-600">
          <span>{formatTime(snapshot.currentTime)}</span>
          <span>{formatTime(snapshot.duration)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-3 rounded-2xl border border-cream-300/80 bg-cream-50/70 px-4 py-4 shadow-inner">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-cocoa-500">Playback speed</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            aria-label="Playback speed"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-cream-300 accent-charcoal-900"
          />
          <span className="text-sm font-medium text-cocoa-600">{playbackSpeed.toFixed(1)}x</span>
        </label>
        <label className="flex flex-col gap-3 rounded-2xl border border-cream-300/80 bg-cream-50/70 px-4 py-4 shadow-inner">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-cocoa-500">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Playback volume"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-cream-300 accent-charcoal-900"
          />
          <span className="text-sm font-medium text-cocoa-600">{Math.round(volume * 100)}%</span>
        </label>
      </div>
    </CollapsibleSection>
  );
}
