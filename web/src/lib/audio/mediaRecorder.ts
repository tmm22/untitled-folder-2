export type RecorderState = 'inactive' | 'recording' | 'paused';

export interface RecorderHandle {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
  cancel: () => void;
  state: () => RecorderState;
  onChunk?: (chunk: Blob) => void;
}

export interface RecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  timesliceMs?: number;
}

export const isMediaRecorderSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

export async function createAudioRecorder(options: RecorderOptions = {}): Promise<RecorderHandle> {
  if (!isMediaRecorderSupported()) {
    throw new Error('MediaRecorder API is not supported in this browser');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, {
    mimeType: options.mimeType,
    audioBitsPerSecond: options.audioBitsPerSecond,
  });

  const chunks: Blob[] = [];

  let stopResolver: ((blob: Blob) => void) | null = null;
  let stopReject: ((reason?: unknown) => void) | null = null;

  const finalize = () => {
    stream.getTracks().forEach((track) => track.stop());
    chunks.splice(0, chunks.length);
    stopResolver = null;
    stopReject = null;
  };

  recorder.addEventListener('dataavailable', (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
      handle.onChunk?.(event.data);
    }
  });

  recorder.addEventListener('stop', () => {
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || options.mimeType || 'audio/webm' });
      stopResolver?.(blob);
    } catch (error) {
      stopReject?.(error);
    } finally {
      finalize();
    }
  });

  recorder.addEventListener('error', (event) => {
    stopReject?.(event.error ?? new Error('MediaRecorder error'));
    finalize();
  });

  const handle: RecorderHandle = {
    onChunk: undefined,
    async start() {
      if (recorder.state === 'recording') {
        return;
      }
      chunks.splice(0, chunks.length);
      recorder.start(options.timesliceMs ?? 1000);
    },
    async stop() {
      if (recorder.state === 'inactive') {
        throw new Error('Recorder is not active');
      }
      return new Promise<Blob>((resolve, reject) => {
        stopResolver = resolve;
        stopReject = reject;
        recorder.stop();
      });
    },
    cancel() {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      finalize();
    },
    state() {
      return recorder.state as RecorderState;
    },
  };

  return handle;
}
