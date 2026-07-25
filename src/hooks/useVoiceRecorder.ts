import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoiceRecorder(onRecorded: (file: File) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Voice recording is not supported on this device.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      .find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    setRecordingSeconds(0);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || preferredType || 'audio/webm';
      const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size > 0) {
        onRecordedRef.current(new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mimeType }));
      }
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setIsRecording(false);
      setRecordingSeconds(0);
    };

    recorder.start(250);
    setIsRecording(true);
    timerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
  }, []);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  return { isRecording, recordingSeconds, startRecording, stopRecording };
}

export const getChatMediaType = (file: File) => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
};

export const encodeChatMedia = (type: string, url: string, name: string) =>
  `${type}|${encodeURIComponent(name)}|${url}`;

export const decodeChatMedia = (token: string) => {
  const [explicitType, encodedName, ...urlParts] = token.split('|');
  if (urlParts.length > 0 && ['image', 'video', 'audio', 'file'].includes(explicitType)) {
    return { type: explicitType, name: decodeURIComponent(encodedName || 'Attachment'), url: urlParts.join('|') };
  }

  const url = token;
  const cleanUrl = url.split('?')[0].toLowerCase();
  const type = /\.(mp3|m4a|wav|aac|flac)$/.test(cleanUrl)
    ? 'audio'
    : /\.(mp4|mov|m4v)$/.test(cleanUrl)
      ? 'video'
      : /\.(jpg|jpeg|png|gif|webp|avif|svg)$/.test(cleanUrl)
        ? 'image'
        : /\.webm$/.test(cleanUrl)
          ? 'video'
          : 'file';
  return { type, name: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Attachment'), url };
};
