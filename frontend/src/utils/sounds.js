const FREQUENCIES = {
  product: [520],
  payment: [660, 880],
  invoice: [523, 659, 784],
  error: [220, 165],
};

export function playPosSound(type, enabled = true) {
  if (!enabled || !FREQUENCIES[type]) return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    const frequencies = FREQUENCIES[type];

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.09;
      oscillator.type = type === 'error' ? 'square' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (type === 'invoice' ? 0.16 : 0.12));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + (type === 'invoice' ? 0.17 : 0.13));
    });

    window.setTimeout(() => context.close().catch(() => {}), 500);
  } catch {
    // Audio is optional and must never interrupt a sale.
  }
}