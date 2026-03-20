export const playMoveSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    console.error('Audio play failed', e);
  }
};

export const playCaptureSound = () => {
  speak('吃');
};

export const playCheckSound = () => {
  speak('将军');
};

const speak = (text: string) => {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.2;
      utterance.pitch = 1.1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.error('Speech synthesis failed', e);
  }
};
