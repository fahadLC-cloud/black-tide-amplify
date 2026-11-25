# Black Tide (AWS Amplify version)

Pirate ship battle game: email/password accounts, captains and factions, shipyard, upgrades with gun-port editor, gold/XP/levels,
leaderboard, flag images, admin panel. Battles run in the browser against bots; all rules, rewards and purchases are
validated by AWS. Front end = Vite + plain JavaScript (your updated UI, unchanged). Back end = Amplify Gen 2.

## 1. Install first

- Node.js 20 or 22 (`node -v`), Git, VS Code
- An AWS account, and AWS credentials on your PC (run `aws configure`, or set up IAM Identity Center), region of your choice
- A GitHub account (repo must be accessible to your instructor and TA)

## 2. Run it

```
npm install
npm run format        # first time only: formats the old dense code so the Prettier CI check passes
npm run lint          # fix any errors it reports
npm test              # headless game-rules test
```

### Start the cloud sandbox and the app

```
npx ampx sandbox          # deploys Cognito, AppSync, DynamoDB, S3, Lambdas, API Gateway, CloudWatch; creates amplify_outputs.json
npm run dev               # second terminal, open http://localhost:5173
```

Create an account in the app with your email and a password. Cognito auto-confirms the account; you can start choosing your captain, flag, and ship immediately.

### Make yourself an Admin (to show group-based access)

Cognito console, User pools, your pool, Users, find your email user, Add user to group, Admins. Sign out and in again; the Admin tab appears.

## 3. Deploy with Amplify Hosting (requirements 5 and 8)

1. `git init`, commit, push to a GitHub repo (branch `main`). Run `npm install` first so `package-lock.json` is committed.
2. Amplify console, Create new app, GitHub, choose repo and `main`. It detects `amplify.yml`.
3. Deploy. Accounts use Cognito email and password, so no OAuth client or callback URL setup is needed.
4. Every push to `main` now builds and deploys. Screenshot the build pipeline for your submission.

## 4. CI checks (requirement 6)

`.github/workflows/ci.yml` runs ESLint, Prettier, Gitleaks, CodeQL and Snyk on every push and pull request.

- Snyk: create a free account, copy your API token, add it as repo secret `SNYK_TOKEN`.
- CodeQL needs a public repo (or GitHub Advanced Security on a private one).
- Record anything the tools report in `docs/CI_FINDINGS.md`.
  Screenshot each job from the Actions tab.

## 5. CloudWatch (requirement 7)

Console, CloudWatch, Dashboards, `BlackTide-Monitoring` (Lambda invocations, errors, duration, API 4XX/5XX).
Alarms: `BlackTide-GameApi-Errors` and `BlackTide-Api-5XX`. Logs: Log groups for the `game-api` and `post-confirmation` functions.
To show it working: play a battle, refresh the dashboard, and open the log stream to see the structured log lines.
To show the alarm: temporarily call the API with an invalid action a few times (400s count as 4XX), or throw an error in the handler once.

## 6. What changed from the old Node.js/Socket.IO version

| Before                       | Now                                                                |
| ---------------------------- | ------------------------------------------------------------------ |
| Express + Socket.IO server   | Amplify Hosting + serverless AWS services                          |
| Name/password in a JSON file | Cognito email/password, groups Admins/Players                      |
| Server-side match loop       | Battle simulation in the browser vs bots; Lambda validates results |
| Live PvP queue               | Not possible without an always-on server (see ideas below)         |
| db.json                      | DynamoDB through AppSync (GraphQL)                                 |
| none                         | S3 flag images, CloudWatch, CI pipeline                            |

## 7. Known limits and ideas

- Match results are reported by the browser, so a determined cheater could fake a win. The Lambda caps rewards and requires a started match of realistic length; real protection needs the simulation on the server.
- Live PvP could return later with AppSync subscriptions (slower, action-based turns) or by fighting another player's saved fleet as an AI rival.
- I could not run `npx ampx sandbox` or the CI tools in the environment where this was generated, so expect to fix small version or typing issues on your first deploy.
- Add an SNS email subscription to the alarm if you want notifications.

## 8. Submission checklist

Architecture diagram (`docs/ARCHITECTURE.md`, export the Mermaid at mermaid.live) / GitHub link + workflow file visible / Amplify build screenshots / CI screenshots for all 5 checks / live URL / one-page report (`docs/FINDINGS_REPORT.md`, your own words).
