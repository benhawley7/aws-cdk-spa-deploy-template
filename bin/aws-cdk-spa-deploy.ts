import * as cdk from '@aws-cdk/core';
import { createSpaDeployStack } from '../lib/spa-deploy-stack';
import * as settings from '../settings.json';

const app = new cdk.App();
createSpaDeployStack(app, settings);