/**
 * PCM16 Audio Capture for OpenAI Realtime API
 * Captures audio at 24kHz mono PCM16 format
 */
export class PCM16AudioCapture {
  constructor(stream, onAudioData, onError) {
    this.onAudioData = onAudioData;
    this.onError = onError;
    this.isActive = false;

    try {
      // Create AudioContext at 24kHz (OpenAI requirement)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });

      // Create source from media stream
      this.source = this.audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessor for audio processing
      // 4096 samples buffer size for good balance between latency and performance
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isActive) return;

        try {
          const inputData = e.inputBuffer.getChannelData(0); // Float32Array [-1, 1]
          const pcm16 = this.convertToPCM16(inputData);
          const base64 = this.arrayBufferToBase64(pcm16);
          this.onAudioData(base64);
        } catch (err) {
          console.error('Audio processing error:', err);
          if (this.onError) this.onError(err);
        }
      };

      // Connect the audio graph
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isActive = true;
      console.log('PCM16 audio capture initialized at 24kHz');
    } catch (err) {
      console.error('Failed to initialize audio capture:', err);
      if (this.onError) this.onError(err);
    }
  }

  /**
   * Convert Float32 audio samples to PCM16 (Int16)
   * Float32: -1.0 to 1.0
   * Int16: -32768 to 32767
   */
  convertToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit integer
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return pcm16;
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer.buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Stop audio capture and cleanup resources
   */
  stop() {
    this.isActive = false;

    try {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }

      if (this.source) {
        this.source.disconnect();
        this.source = null;
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }

      console.log('PCM16 audio capture stopped');
    } catch (err) {
      console.error('Error stopping audio capture:', err);
    }
  }
}
