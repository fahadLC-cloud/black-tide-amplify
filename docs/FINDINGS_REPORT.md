# Findings report (one page) - template

Write this in your own words. It should describe what YOU learned, so the headings below are prompts, not finished text.

**Project:** Black Tide, a pirate ship battle game built on AWS Amplify (Cognito, API Gateway + Lambda, AppSync + DynamoDB, S3, CloudWatch, GitHub Actions).

1. **What I built (3-4 sentences).** Summarise the app and each AWS service's job.
2. **What I learned about serverless.** Example prompts: what changed when there was no always-on server? Why did the game's live multiplayer have to become battles against bots? What did Lambda cold starts, IAM permissions or API authorizers teach you?
3. **What I learned about security.** Example prompts: why are gold and XP only written by the Lambda? What do Cognito groups protect? What did Gitleaks, CodeQL and Snyk find or prevent?
4. **What was hardest / what went wrong.** One concrete bug or setup problem (Google OAuth redirect, callback URLs, CORS, tokens, permissions) and how you solved it.
5. **Impact on my understanding of cloud development.** How do you think about managed services, cost, monitoring and CI/CD differently now?
6. **What I would improve next.** Example: real-time PvP with AppSync subscriptions, field-level authorization, SNS email on the alarm.
