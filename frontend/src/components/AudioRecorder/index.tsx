'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react';

interface AudioRecorderProps {
  onAudioData: (audioData: Int16Array) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioData }) => {
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;

      // Create AudioContext with the stream's sample rate
      const trackSettings = stream.getAudioTracks()[0].getSettings();
      const sampleRate = trackSettings.sampleRate || 48000;
      audioContextRef.current = new AudioContext({ sampleRate });

      await audioContextRef.current.audioWorklet.addModule('/audio-processor-worklet.js');

      const source = audioContextRef.current.createMediaStreamSource(stream);
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor-worklet');

      workletNodeRef.current.port.onmessage = (event) => {
        onAudioData(event.data);
      };

      source.connect(workletNodeRef.current);
      workletNodeRef.current.connect(audioContextRef.current.destination);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [onAudioData]);

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsRecording(false);
  }, []);

  return (
    <div>
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
    </div>
  );
};

export default AudioRecorder;