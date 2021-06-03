const appInsights = require('applicationinsights');
const azure = require('@pulumi/azure');
const pulumi = require('@pulumi/pulumi');
const automation = require('@pulumi/pulumi/x/automation');
const workloads = require('../workloads');

const handler = async () => {
  // Setup application insights
  appInsights.setup()
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(false)
    .setSendLiveMetrics(false)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);
  appInsights.defaultClient.setAutoPopulateAzureProperties(true);
  appInsights.start();

  return workloads.factorial();
};

const getEndpoint = async () => {
  // Import shared resources
  const user = await automation.LocalWorkspace.create({})
    .then((ws) => ws.whoAmI()
      .then((i) => i.user));
  const shared = new pulumi.StackReference(`${user}/azure-shared/dev`);

  const resourceGroupId = shared.requireOutput('resourceGroupId');
  const resourceGroup = azure.core.ResourceGroup.get('ResourceGroup', resourceGroupId);
  const insightsId = shared.requireOutput('insightsId');
  const insights = azure.appinsights.Insights.get('Insights', insightsId);

  // HTTP trigger
  return new azure.appservice.HttpEventSubscription('HttpTrigger', {
    resourceGroup,
    callback: handler,
    appSettings: {
      APPINSIGHTS_INSTRUMENTATIONKEY: insights.instrumentationKey,
    },
  });
};

exports.url = getEndpoint().then((endpoint) => endpoint.url);
