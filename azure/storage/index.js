/* eslint-disable no-restricted-syntax */
const appInsights = require('applicationinsights');
const Storage = require('@azure/storage-blob');
const Identity = require('@azure/identity');
const azure = require('@pulumi/azure');
const pulumi = require('@pulumi/pulumi');
const automation = require('@pulumi/pulumi/x/automation');
const workloads = require('../workloads');

const handler = async (context, trigger) => {
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

  const correlationContext = appInsights.startOperation(context, 'correlationContextStorage');

  // TODO This might be unsecure, parameter order: TenantID, ClientID, ClientSecret.
  const clientSecretCredential = new Identity.ClientSecretCredential(
    <tenantId>,
    <clientId>,
    <clientSecret>,
  );

  // Get correct operationID from blob metadata
  const blobUrl = trigger.data.url;
  const props = blobUrl.split('/').filter((w) => w.length > 6);
  const storageAccount = props[0].split('.')[0];
  const container = props[1];
  const blob = props[2];

  const blobServiceClient = new Storage.BlobServiceClient(
    `https://${storageAccount}.blob.core.windows.net`,
    clientSecretCredential,
  );

  const containerClient = blobServiceClient.getContainerClient(container);
  const blobs = containerClient.listBlobsFlat({ includeMetadata: true });

  for await (const item of blobs) {
    if (item.name === blob) {
      appInsights.defaultClient.trackTrace({
        message: 'Custom operationId',
        properties: {
          newOperationId: item.metadata.operationid,
          oldOperationId: correlationContext.operation.id,
        },
      });
    }
  }
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

  const container = new azure.storage.Container('container', {
    storageAccountName: storageAccount.name,
    containerAccessType: 'private',
  });

  // Blob trigger
  azure.eventgrid.events.onGridBlobCreated('StorageTrigger', {
    resourceGroup,
    storageAccount,
    callback: handler,
    appSettings: {
      APPINSIGHTS_INSTRUMENTATIONKEY: insights.instrumentationKey,
    },
  });

  return { storageAccountName: storageAccount.name, containerName: container.name };
};

module.exports = getStorageResources().then((e) => e);
