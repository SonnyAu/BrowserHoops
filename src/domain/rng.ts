export class Rng {
  private state: number;
  constructor(seed: string) { this.state = [...seed].reduce((a,c)=>((a*31+c.charCodeAt(0))>>>0), 2166136261); }
  next() { this.state = (1664525 * this.state + 1013904223) >>> 0; return this.state / 4294967296; }
  int(min: number, max: number) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick<T>(items: T[]) { return items[this.int(0, items.length - 1)]; }
}
