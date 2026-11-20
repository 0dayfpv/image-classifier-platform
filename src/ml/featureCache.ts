import type { SampleRecord } from '../types/domain';

export function buildFeatureCacheKey(
  sample: Pick<SampleRecord, 'id' | 'createdAt'>
): string {
  return `${sample.id}:${sample.createdAt}`;
}

export class FeatureCache {
  private readonly entries = new Map<string, Float32Array>();

  get size(): number {
    return this.entries.size;
  }

  get(key: string): Float32Array | undefined {
    return this.entries.get(key);
  }

  set(key: string, embedding: Float32Array): void {
    this.entries.set(key, embedding);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
