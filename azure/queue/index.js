const appInsights = require('applicationinsights');
const azure = require('@pulumi/azure');
const pulumi = require('@pulumi/pulumi');
const automation = require('@pulumi/pulumi/x/automation');
const workloads = require('../workloads');

const handler = async (context, queueMessage) => {
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

  const correlationContext = appInsights.startOperation(context, 'correlationContextQueue');
  appInsights.defaultClient.trackTrace({
    message: 'Custom operationId',
    properties: {
      newOperationId: queueMessage, // queueMessage only consists of operationId
      oldOperationId: correlationContext.operation.id,
    },
  });
  appInsights.defaultClient.flush();

  return workloads.factorial();
};

const getStorageResources = async () => {
  // Import shared resources
  const user = await automation.LocalWorkspace.create({})
    .then((ws) => ws.whoAmI()
      .then((i) => i.user));
  const shared = new pulumi.StackReference(`${user}/azure-shared/dev`);

  const resourceGroupId = shared.requireOutput('resourceGroupId');
  const resourceGroup = azure.core.ResourceGroup.get('ResourceGroup', resourceGroupId);
  const insightsId = shared.requireOutput('insightsId');
  const insights = azure.appinsights.Insights.get('Insights', insightsId);

  const storageAccount = new azure.storage.Account('account', {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    accountTier: 'Standard',
    accountKind: 'StorageV2',
    accountReplicationType: 'LRS',
  });

  const queue = new azure.storage.Queue('queue', {
    storageAccountName: storageAccount.name,
  });

  // Queue trigger
  queue.onEvent('QueueTrigger', {
    resourceGroup,
    storageAccount,
    callback: handler,
    hostSettings: {
      extensions: {
        queues: {
          maxPollingInterval: '00:00:01', // 1s
          batchSize: 32,
          newBatchThreshold: 16,
          visibilityTimeout: 0,
          maxDequeueCount: 5,
        },
      },
    },
    appSettings: {
      APPINSIGHTS_INSTRUMENTATIONKEY: insights.instrumentationKey,
    },
  });

  return {
    storageAccountName: storageAccount.name,
    queueName: queue.name,
  };
};

module.exports = getStorageResources().then((e) => e);
