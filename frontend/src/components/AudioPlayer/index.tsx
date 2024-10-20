'use client'

import React, { useRef, useState } from 'react';

interface AudioPlayerProps {
  audioBlob: Blob | null;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioBlob }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div>
      {audioBlob && (
        <>
          <audio
            ref={audioRef}
            src={URL.createObjectURL(audioBlob)}
            onEnded={() => setIsPlaying(false)}
          />
          <button onClick={togglePlayPause}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </>
      )}
    </div>
  );
};

export default AudioPlayer;