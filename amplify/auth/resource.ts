import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from '../functions/post-confirmation/resource';
import { preSignUp } from '../functions/pre-sign-up/resource';

// Email and password sign-in + Cognito groups and Post Confirmation trigger.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['Admins', 'Players'],
  triggers: { preSignUp, postConfirmation },
  access: (allow) => [allow.resource(postConfirmation).to(['addUserToGroup'])],
});
