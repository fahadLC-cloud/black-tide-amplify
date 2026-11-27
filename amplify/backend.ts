import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { Alarm, ComparisonOperator, Dashboard, GraphWidget, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { postConfirmation } from './functions/post-confirmation/resource';
import { preSignUp } from './functions/pre-sign-up/resource';
import { gameApi } from './functions/game-api/resource';

const backend = defineBackend({ auth, data, storage, postConfirmation, preSignUp, gameApi });

// ---- Requirement 3 (REST half): API Gateway + Lambda, protected by a Cognito User Pool authorizer ----
const apiStack = backend.createStack('rest-api-stack');
const restApi = new RestApi(apiStack, 'BlackTideRestApi', {
  restApiName: 'blacktide-rest',
  deployOptions: { stageName: 'prod' },
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: [...Cors.DEFAULT_HEADERS, 'Authorization'],
  },
});
const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'CognitoAuthorizer', {
  cognitoUserPools: [backend.auth.resources.userPool],
});
restApi.root.addResource('game').addMethod('POST', new LambdaIntegration(backend.gameApi.resources.lambda), {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});
backend.addOutput({
  custom: { API: { REST: { 'blacktide-rest': { endpoint: restApi.url, region: Stack.of(restApi).region } } } },
});

// ---- Requirement 7: CloudWatch dashboard + alarms (Lambda logs go to CloudWatch Logs automatically) ----
const envSuffix = (process.env.AWS_BRANCH || 'sandbox').replace(/[^a-zA-Z0-9_-]/g, '-');
const gameFn = backend.gameApi.resources.lambda;
const confirmFn = backend.postConfirmation.resources.lambda;
const dashboard = new Dashboard(apiStack, 'BlackTideDashboard', {
  dashboardName: `BlackTide-Monitoring-${envSuffix}`,
});
dashboard.addWidgets(
  new GraphWidget({
    title: 'game-api Lambda: invocations and errors',
    left: [gameFn.metricInvocations(), gameFn.metricErrors()],
    width: 12,
  }),
  new GraphWidget({ title: 'game-api Lambda: duration (ms)', left: [gameFn.metricDuration()], width: 12 }),
  new GraphWidget({
    title: 'API Gateway: requests, 4XX, 5XX',
    left: [restApi.metricCount(), restApi.metricClientError(), restApi.metricServerError()],
    width: 12,
  }),
  new GraphWidget({
    title: 'post-confirmation Lambda',
    left: [confirmFn.metricInvocations(), confirmFn.metricErrors()],
    width: 12,
  })
);
new Alarm(apiStack, 'GameApiErrorsAlarm', {
  alarmName: `BlackTide-GameApi-Errors-${envSuffix}`,
  metric: gameFn.metricErrors({ period: Duration.minutes(5) }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: TreatMissingData.NOT_BREACHING,
});
new Alarm(apiStack, 'Api5xxAlarm', {
  alarmName: `BlackTide-Api-5XX-${envSuffix}`,
  metric: restApi.metricServerError({ period: Duration.minutes(5) }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: TreatMissingData.NOT_BREACHING,
});
