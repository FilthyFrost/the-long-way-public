/**
 * ModCar sound on the game's mixer: one engine voice per car you can hear and the foley player,
 * all on AudioEngine's context and master bus (so the old engine synth, weather and road noise
 * keep their own places in the mix). Make it after AudioEngine.start() has run on a user gesture.
 */
import type { AudioEngine } from '../audio';
import { EngineVoice } from './engineAudio';
import { Foley } from './foley';

export interface ModCarSound {
  /** the player's car */
  engine: EngineVoice;
  foley: Foley;
  /** another car's engine (dispose() it when the car goes away) */
  voice(): EngineVoice;
}

/** null until the AudioContext exists */
export function attachModCarSound(audio: AudioEngine): ModCarSound | null {
  const ctx = audio.context;
  const out = audio.output;
  if (!ctx || !out) return null;
  return {
    engine: new EngineVoice(ctx, out),
    foley: new Foley(ctx, out),
    voice: () => new EngineVoice(ctx, out),
  };
}
