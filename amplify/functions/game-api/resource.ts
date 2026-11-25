import { defineFunction } from '@aws-amplify/backend';

export const gameApi = defineFunction({
  name: 'game-api',
  entry: './handler.ts',
  timeoutSeconds: 15,
  memoryMB: 256,
});
