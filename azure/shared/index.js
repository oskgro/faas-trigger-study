const azure = require('@pulumi/azure');

const resourceGroup = new azure.core.ResourceGroup('ResourceGroup');

const insights = new azure.appinsights.Insights('Insights', {
  location: resourceGroup.location,
  resourceGroupName: resourceGroup.name,
  applicationType: 'Node.JS',
});

// Export ids and names of resources to import them in other projects
exports.resourceGroupId = resourceGroup.id;
exports.resourceGroupName = resourceGroup.name;
exports.insightsId = insights.id;
exports.insightsName = insights.name;
exports.insightsAppId = insights.appId; // Required by Azure Insights REST API
