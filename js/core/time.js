export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** Interval wrapper: one start/stop pair instead of bare setInterval bookkeeping. */
export function createTicker(onTick, ms = 1000) {
  let id = null;
  return {
    start() {
      this.stop();
      id = setInterval(onTick, ms);
    },
    stop() {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    },
    get running() {
      return id !== null;
    },
  };
}
