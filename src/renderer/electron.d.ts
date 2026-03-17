import type { LiteBenchApi } from '../preload/index';

declare global {
  interface Window {
    liteBench: LiteBenchApi;
  }
}

export {};
