import { defineFunction } from '@aws-amplify/backend';

// Requirement 2: Post Confirmation trigger that puts every new user into a default group.
export const postConfirmation = defineFunction({
  name: 'post-confirmation',
  entry: './handler.ts',
  resourceGroupName: 'auth', // keeps it in the auth stack (avoids circular dependencies)
  environment: { GROUP_NAME: 'Players' },
});
