/**
 * PCM16 Audio Player for OpenAI Realtime API
 * Plays back audio at 24kHz mono PCM16 format
 */
export class PCM16AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.queue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.startTime = 0;
    this.nextStartTime = 0;
  }

  /**
   * Initialize AudioContext (must be called after user interaction)
   */
  async initialize() {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });

      // Resume context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      console.log('PCM16 audio player initialized at 24kHz');
    } catch (err) {
      console.error('Failed to initialize audio player:', err);
      throw err;
    }
  }

  /**
   * Add audio chunk to playback queue
   * @param {string} base64Audio - Base64 encoded PCM16 audio
   */
  async addChunk(base64Audio) {
    if (!this.audioContext) {
      await this.initialize();
    }

    try {
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert to Int16Array (PCM16)
      const int16Array = new Int16Array(bytes.buffer);

      // Convert Int16 to Float32 for Web Audio API
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        // Normalize Int16 [-32768, 32767] to Float32 [-1.0, 1.0]
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
      }

      this.queue.push(float32Array);

      // Start playback if not already playing
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (err) {
      console.error('Error adding audio chunk:', err);
    }
  }

  /**
   * Play next chunk from queue
   */
  playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioData = this.queue.shift();

    try {
      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(
        1, // mono
        audioData.length,
        24000 // sample rate
      );

      // Copy audio data to buffer
      audioBuffer.copyToChannel(audioData, 0);

      // Create buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Schedule playback
      const currentTime = this.audioContext.currentTime;
      const startTime = Math.max(currentTime, this.nextStartTime);
      source.start(startTime);

      // Calculate when this chunk will finish
      const duration = audioBuffer.duration;
      this.nextStartTime = startTime + duration;

      // Play next chunk when this one ends
      source.onended = () => {
        this.playNext();
      };

      this.currentSource = source;
    } catch (err) {
      console.error('Error playing audio chunk:', err);
      this.isPlaying = false;
    }
  }

  /**
   * Clear all queued audio
   */
  clear() {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (err) {
        // Source may already be stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  /**
   * Close audio player and cleanup resources
   */
  async close() {
    this.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
      console.log('PCM16 audio player closed');
    }
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      queueLength: this.queue.length,
      contextState: this.audioContext?.state
    };
  }
}
