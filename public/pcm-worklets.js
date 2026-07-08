// PCM AudioWorklet processors for the in-browser test call (raw-PCM WebSocket).
// Loaded via audioWorklet.addModule("/pcm-worklets.js"). The AudioContext runs at
// 16 kHz, so capture and playback are both mono PCM16 @ 16 kHz — matching the
// backend pipeline (caller/web_bot.py WEB_SAMPLE_RATE), so no resampling needed.

// Mic capture: Float32 (context rate) -> Int16, batched to ~32 ms, posted to the
// main thread which sends each batch as a binary WebSocket frame.
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._count = 0;
    this._target = 512; // ~32 ms at 16 kHz
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      const i16 = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this._buf.push(i16);
      this._count += i16.length;
      if (this._count >= this._target) {
        const out = new Int16Array(this._count);
        let off = 0;
        for (const b of this._buf) { out.set(b, off); off += b.length; }
        this._buf = [];
        this._count = 0;
        this.port.postMessage(out, [out.buffer]);
      }
    }
    return true;
  }
}

// Playback: receives Int16 PCM chunks (the bot's audio) and a {cmd:"clear"} flush
// (barge-in). Fills the output from a queue; silence on underrun.
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = [];
    this._cur = null;
    this._pos = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.cmd === "clear") {
        this._queue = [];
        this._cur = null;
        this._pos = 0;
        return;
      }
      const i16 = new Int16Array(d);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
      this._queue.push(f32);
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    let i = 0;
    while (i < out.length) {
      if (!this._cur || this._pos >= this._cur.length) {
        this._cur = this._queue.shift() || null;
        this._pos = 0;
        if (!this._cur) { while (i < out.length) out[i++] = 0; break; }
      }
      out[i++] = this._cur[this._pos++];
    }
    return true;
  }
}

registerProcessor("pcm-capture", PCMCaptureProcessor);
registerProcessor("pcm-player", PCMPlayerProcessor);
