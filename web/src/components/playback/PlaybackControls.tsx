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
  const isPlaying = useTTSStore((state) => state.isPlaying);
  const playbackSpeed = useTTSStore((state) => state.playbackSpeed);
  const volume = useTTSStore((state) => state.volume);
  const isLoopEnabled = useTTSStore((state) => state.isLoopEnabled);

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
    <CollapsibleSection title="Playback controls" className="flex flex-col gap-5" minHeight={240} maxHeight={640}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="control-button control-button--primary px-6"
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
        >
          Loop
        </button>
        <span className="ml-auto text-sm text-cocoa-500">
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
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-cream-300 accent-charcoal-900"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-cocoa-600">Playback speed</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-cream-300 accent-charcoal-900"
          />
          <span className="text-xs text-cocoa-500">{playbackSpeed.toFixed(1)}x</span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-cocoa-600">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-cream-300 accent-charcoal-900"
          />
          <span className="text-xs text-cocoa-500">{Math.round(volume * 100)}%</span>
        </label>
      </div>
    </CollapsibleSection>
  );
}
