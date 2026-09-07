export interface Clock {
  now(): number;
}

export class PerformanceClock implements Clock {
  now(): number {
    return performance.now() / 1000;
  }
}

export class ManualClock implements Clock {
  seconds = 0;

  now(): number {
    return this.seconds;
  }

  advance(seconds: number): void {
    this.seconds += seconds;
  }

  set(seconds: number): void {
    this.seconds = seconds;
  }
}

export class AudioClock implements Clock {
  constructor(private readonly ctx: AudioContext) {}

  now(): number {
    return this.ctx.currentTime;
  }
}
