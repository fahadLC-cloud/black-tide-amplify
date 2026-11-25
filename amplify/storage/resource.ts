import { defineStorage } from '@aws-amplify/backend';

// Requirement 4: S3 bucket for pictures. Each signed-in user can upload/read/delete their own folder;
// every signed-in user can view everybody's flag images (for the leaderboard).
export const storage = defineStorage({
  name: 'blackTideImages',
  access: (allow) => ({
    'flags/{entity_id}/*': [allow.entity('identity').to(['read', 'write', 'delete']), allow.authenticated.to(['read'])],
  }),
});
