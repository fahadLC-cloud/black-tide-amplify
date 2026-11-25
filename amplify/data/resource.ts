import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { gameApi } from '../functions/game-api/resource';

// Requirement 3 (GraphQL half): AppSync API generated from this schema, DynamoDB behind it.
// Signed-in users can only READ players (leaderboard). All writes go through the game-api Lambda (REST),
// so nobody can give themselves gold from the browser. Members of the Admins group have full access.
const schema = a
  .schema({
    Player: a
      .model({
        displayName: a.string(),
        captain: a.string(),
        faction: a.string(),
        ship: a.string(),
        owned: a.string().array(),
        shipConfigs: a.json(),
        gold: a.integer(),
        xp: a.integer(),
        wins: a.integer(),
        losses: a.integer(),
        kills: a.integer(),
        flagPath: a.string(),
        matchStartedAt: a.float(),
        matchMode: a.string(),
      })
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('Admins')]),
  })
  .authorization((allow) => [allow.resource(gameApi)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
