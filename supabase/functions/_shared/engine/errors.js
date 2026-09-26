/** A rule violation. `message` is safe to show to players. */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
