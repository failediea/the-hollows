/**
 * Cryptographically secure random number generation for combat.
 * NO Math.random() - all randomness uses crypto.randomInt
 */

import { randomInt } from 'node:crypto';

/**
 * Generate a cryptographically secure random float in [0, 1)
 */
export function secureRandom(): number {
  return randomInt(0, 2147483647) / 2147483647;
}

/**
 * Generate a cryptographically secure random int in [min, max] inclusive
 */
export function secureRandomInt(min: number, max: number): number {
  return randomInt(min, max + 1);
}

/**
 * Cryptographically secure percentage check
 * @param probability - Value between 0 and 1
 * @returns true if the roll succeeds
 */
export function secureChance(probability: number): boolean {
  return secureRandom() < probability;
}

/**
 * Choose a random element from an array
 */
export function secureChoice<T>(array: T[]): T {
  return array[secureRandomInt(0, array.length - 1)];
}

/**
 * RNG audit trail for combat fairness
 */
export interface RngRoll {
  purpose: string;
  result: number;
  range?: string;
}

export class RngAuditor {
  private rolls: RngRoll[] = [];

  roll(purpose: string, min?: number, max?: number): number {
    let result: number;
    let range: string | undefined;

    if (min !== undefined && max !== undefined) {
      result = secureRandomInt(min, max);
      range = `[${min}, ${max}]`;
    } else {
      result = secureRandom();
      range = '[0, 1)';
    }

    this.rolls.push({ purpose, result, range });
    return result;
  }

  rollChance(purpose: string, probability: number): boolean {
    const result = this.roll(purpose);
    return result < probability;
  }

  getRolls(): RngRoll[] {
    return [...this.rolls];
  }

  clear(): void {
    this.rolls = [];
  }
}
