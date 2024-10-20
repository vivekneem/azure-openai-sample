import { Buffer } from 'buffer';

export function isJsonData(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer.toString('utf8', 0, 2) === '{"';
}

export function convertAudioToPCM16(inputBuffer: Buffer): Buffer {
  // The input is already PCM16 at 24kHz, so we just need to ensure it's in the correct format
  if (inputBuffer.length % 2 !== 0) {
    throw new Error('Invalid buffer length for PCM16. Expected even number of bytes.');
  }

  // No conversion needed, return the input buffer
  return inputBuffer;
}
