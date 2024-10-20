'use client'

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GroundingFiles } from "@/components/ui/grounding-files";
import GroundingFileView from "@/components/ui/grounding-file-view";
import StatusMessage from "@/components/ui/status-message";

import useRealTime from "@/hooks/useRealtime";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useAudioPlayer from "@/hooks/useAudioPlayer";

import { GroundingFile, ToolResult } from "@/lib/types";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
    const [groundingFiles, setGroundingFiles] = useState<GroundingFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<GroundingFile | null>(null);
    const [transcript, setTranscript] = useState("");

  const { startSession, addUserAudio, inputAudioBufferClear } = useRealTime({
    onWebSocketOpen: () => console.log("WebSocket connection opened"),
    onWebSocketClose: () => console.log("WebSocket connection closed"),
    onWebSocketError: event => console.error("WebSocket error:", event),
    onReceivedError: message => console.error("error", message),
    onReceivedResponseAudioDelta: message => {
      console.log("Current isRecording state:", isRecording);
      if (isRecording) {
        console.log("Attempting to play audio from delta");
        playAudio(message.delta);
      } else {
        console.log("Not playing audio because isRecording is false");
      }
    },
    onReceivedInputAudioBufferSpeechStarted: () => {
        stopAudioPlayer();
    },
    onReceivedExtensionMiddleTierToolResponse: message => {
        console.log('onReceivedExtensionMiddleTierToolResponse message: ', message);
        const result: ToolResult = JSON.parse(message.tool_result);

        const files: GroundingFile[] = result.sources.map(x => {
            const match = x.chunk_id.match(/_pages_(\d+)$/);
            const name = match ? `${x.title}#page=${match[1]}` : x.title;
            return { id: x.chunk_id, name: name, content: x.chunk };
        });

        setGroundingFiles(prev => [...prev, ...files]);
    },
    // onReceivedTranscript: (transcript) => {
    //     console.log("Received transcript:", transcript);
    //     setTranscript(transcript); // Assuming you have a state variable for the transcript
    // },
    // onReceivedAudio: (audioData: string | any[]) => {
    //   console.log("Received audio data");
    //   if (typeof audioData === 'string') {
    //     playAudio(audioData);
    //   }
    // },
  });

  const { reset: resetAudioPlayer, play: playAudio, stop: stopAudioPlayer } = useAudioPlayer();
  const { start: startAudioRecording, stop: stopAudioRecording } = useAudioRecorder({ onAudioRecorded: addUserAudio });

  const onToggleListening = async () => {
    if (!isRecording) {
      startSession();
      await startAudioRecording();
      resetAudioPlayer();
      console.log("Audio player reset after starting recording");
      setIsRecording(true);
    } else {
      await stopAudioRecording();
      stopAudioPlayer();
      inputAudioBufferClear();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
            <div className="p-4 sm:absolute sm:left-4 sm:top-4">
                {/* <img src={logo} alt="Azure logo" className="h-16 w-16" /> */}
            </div>
            <main className="flex flex-grow flex-col items-center justify-center">
                <h1 className="mb-8 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-4xl font-bold text-transparent md:text-7xl">
                    Talk to your data
                </h1>
                <div className="mb-4 flex flex-col items-center justify-center">
                    <Button
                        onClick={onToggleListening}
                        className={`h-12 w-60 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                        aria-label={isRecording ? "Stop recording" : "Start recording"}
                    >
                        {isRecording ? (
                            <>
                                <MicOff className="mr-2 h-4 w-4" />
                                Stop conversation
                            </>
                        ) : (
                            <>
                                <Mic className="mr-2 h-6 w-6" />
                            </>
                        )}
                    </Button>
                    <StatusMessage isRecording={isRecording} />
                </div>
                <GroundingFiles files={groundingFiles} onSelected={setSelectedFile} />
            </main>

            <footer className="py-4 text-center">
                <p>Vivek Desai</p>
            </footer>

            <GroundingFileView groundingFile={selectedFile} onClosed={() => setSelectedFile(null)} />

            <div>
                <h2>Transcript:</h2>
                <p>{transcript}</p>
            </div>
        </div>
  );
}
