const appInsights = require('applicationinsights');
const Storage = require('@azure/storage-blob');
const StorageQueue = require('@azure/storage-queue');
const Identity = require('@azure/identity');
const azure = require('@pulumi/azure');
const pulumi = require('@pulumi/pulumi');
const automation = require('@pulumi/pulumi/x/automation');
const axios = require('axios');

const getHttpFunction = (opts) => new Promise((resolve) => {
  const { url } = opts;

  axios.get(url)
    .then(() => resolve({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: 'AZURE - HTTP trigger successfully started',
    }))
    .catch((e) => resolve({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: `AZURE - Storage trigger benchmark failed to start\n\nError: ${e.message}`,
    }));
});

const getStorageFunction = (opts) => new Promise((resolve) => {
  const { container, storageAccount, operationId } = opts;

  // TODO This might be unsecure, parameter order: TenantID, ClientID, ClientSecret.
  const clientSecretCredential = new Identity.ClientSecretCredential(
    <tenantId>,
    <clientId>,
    <clientSecret>,
  );

  const blobServiceClient = new Storage.BlobServiceClient(
    `https://${storageAccount}.blob.core.windows.net`,
    clientSecretCredential,
  );

  const containerClient = blobServiceClient.getContainerClient(container);
  const content = 'Hello world!';
  const blobName = `${new Date().getTime()}.txt`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  blockBlobClient.upload(content, content.length, {
    metadata: {
      operationId,
    },
  })
    .then(() => resolve({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: 'AZURE - Storage trigger benchmark successfully started',
    }))
    .catch((e) => resolve({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: `AZURE - Storage trigger benchmark failed to start\n\nError: ${e.message}`,
    }));
});

const getQueueFunction = (opts) => new Promise((resolve) => {
  const { queue, storageAccount, operationId } = opts;

  const clientSecretCredential = new Identity.ClientSecretCredential(
    <tenantId>,
    <clientId>,
    <clientSecret>,
  );

  const queueServiceClient = new StorageQueue.QueueServiceClient(
    `https://${storageAccount}.queue.core.windows.net`,
    clientSecretCredential,
  );

  const queueClient = queueServiceClient.getQueueClient(queue);

  const base64Encode = (str) => Buffer.from(str).toString('base64');

  // Send message (operationId) to queue
  queueClient.sendMessage(base64Encode(operationId))
    .then(() => resolve({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: 'AZURE - Queue trigger benchmark successfully started',
    })).catch((e) => resolve({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: `AZURE - Queue trigger benchmark failed to start\n\nError: ${e.message} \n Queue: ${queue}`,
    }));
});

const handler = async (context, req) => {
  // const trace = openTelemetryApi.default;
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

  // Start an AI Correlation Context using the provided Function context
  const correlationContext = appInsights.startOperation(context, req);

  // Get URL params
  const triggerType = req.query && req.query.trigger;
  const validTrigger = triggerType && (triggerType === 'http' || triggerType === 'storage' || triggerType === 'queue');
  const triggerInput = req.query && req.query.input;

  if (validTrigger && triggerInput) {
    if (triggerType === 'http') {
      // HTTP trigger
      return appInsights.wrapWithCorrelationContext(async () => {
        const startTime = Date.now(); // Start trackRequest timer

        const response = await getHttpFunction({ url: triggerInput });

        // Track dependency on completion
        appInsights.defaultClient.trackDependency({
          dependencyTypeName: 'HTTP',
          resultCode: response.status,
          success: true,
          url: triggerInput,
          duration: Date.now() - startTime,
          id: correlationContext.operation.parentId,
        });
        appInsights.defaultClient.flush();

        return response;
      }, correlationContext)();
    }

    if (triggerType === 'queue') {
      const queueInputs = triggerInput.split(',');
      // Queue trigger
      return appInsights.wrapWithCorrelationContext(async () => {
        const startTime = Date.now(); // Start trackRequest timer

        const response = await getQueueFunction({
          queue: queueInputs[0],
          storageAccount: queueInputs[1],
          operationId: correlationContext.operation.id,
        });

        // Track dependency on completion
        appInsights.defaultClient.trackDependency({
          dependencyTypeName: 'HTTP',
          resultCode: response.status,
          success: true,
          duration: Date.now() - startTime,
          id: correlationContext.operation.parentId,
        });
        appInsights.defaultClient.flush();

        return response;
      }, correlationContext)();
    }

    // Storage trigger
    const storageInputs = triggerInput.split(',');
    if (storageInputs.length === 2) {
      return appInsights.wrapWithCorrelationContext(async () => {
        const startTime = Date.now(); // Start trackRequest timer

        const response = await getStorageFunction({
          container: storageInputs[0],
          storageAccount: storageInputs[1],
          operationId: correlationContext.operation.id,
        });

        // Track dependency on completion
        appInsights.defaultClient.trackDependency({
          dependencyTypeName: 'HTTP',
          resultCode: response.status,
          success: true,
          duration: Date.now() - startTime,
          id: correlationContext.operation.parentId,
        });
        appInsights.defaultClient.flush();

        return response;
      }, correlationContext)();
    }
  }

  // If either parameter is missing or is invalid
  return {
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
    body: 'AZURE - Benchmark failed to start\n\nError: Invalid query parameters',
  };
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

  // Infrastructure endpoint (HTTP trigger)
  return new azure.appservice.HttpEventSubscription('InfraEndpoint', {
    resourceGroup,
    callback: handler,
    appSettings: {
      APPINSIGHTS_INSTRUMENTATIONKEY: insights.instrumentationKey,
    },
  });
};

exports.url = getEndpoint().then((endpoint) => endpoint.url);
