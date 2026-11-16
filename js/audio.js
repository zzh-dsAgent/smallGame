(function () {
  const S = (globalThis.DockSokoban = globalThis.DockSokoban || {});

  S.createAudio = function (initialMuted) {
    let muted = !!initialMuted;
    let ctx = null;

    function ensure() {
      if (muted) return null;
      try {
        if (!ctx) {
          const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AudioCtx) return null;
          ctx = new AudioCtx();
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      } catch (err) {
        return null;
      }
    }

    function tone(freq, delay, duration, type, volume) {
      const audio = ensure();
      if (!audio) return;
      const start = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }

    return {
      get muted() {
        return muted;
      },
      toggle() {
        muted = !muted;
        return muted;
      },
      step() {
        tone(620, 0, 0.04, "square", 0.018);
      },
      push() {
        tone(150, 0, 0.09, "triangle", 0.05);
        tone(90, 0.02, 0.08, "sine", 0.03);
      },
      blocked() {
        tone(80, 0, 0.07, "square", 0.02);
      },
      win() {
        [523, 659, 784, 1046].forEach((freq, index) => {
          tone(freq, index * 0.09, 0.14, "triangle", 0.04);
        });
      },
    };
  };
})();
