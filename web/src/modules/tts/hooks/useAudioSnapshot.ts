'use client';

import { useEffect, useState } from 'react';
import { getAudioEngine, type AudioEngineSnapshot } from '@/lib/audio/AudioEngine';

const defaultSnapshot: AudioEngineSnapshot = {
  isLoading: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  volume: 0.75,
  isLooping: false,
};

export function useAudioSnapshot() {
  const [snapshot, setSnapshot] = useState<AudioEngineSnapshot>(defaultSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let unsubscribe: (() => void) | undefined;

    try {
      const engine = getAudioEngine();
      unsubscribe = engine.subscribe((next) => {
        setSnapshot(next);
      });
    } catch (error) {
      console.error('Unable to access AudioEngine', error);
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  return snapshot;
}
