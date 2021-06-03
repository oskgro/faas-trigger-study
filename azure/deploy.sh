TRIGGER_TYPE=''

deploy_shared_resources() {
  cd shared/ && pulumi stack select dev -c && pulumi up -f -y

  # Get App Id
  APP_ID=$(pulumi stack output insightsAppId)
  # Get Insights name
  INSIGHTS_NAME=$(pulumi stack output insightsName)
  # Get Resource group name
  RESOURCE_GROUP=$(pulumi stack output resourceGroupName)

  # Create API key to be able to use Azure Insights REST API TODO use it with REST API
  az config set extension.use_dynamic_install=yes_without_prompt # Required to install and use app-insights module
  API_KEY_NAME=$(date +%s%N) # Set current time as name
  API_KEY=$(az monitor app-insights api-key create --api-key $API_KEY_NAME --read-properties ReadTelemetry --resource-group $RESOURCE_GROUP --app $INSIGHTS_NAME | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['apiKey'])") # Get apiKey from resulting JSON using python
}

deploy_http_trigger() {
  # Deploy shared resources
  deploy_shared_resources

  cd ..

  # Deploy HTTP trigger
  cd http/ && pulumi stack select dev -c && pulumi up -f -y

  # Get url to HTTP trigger gateway
  TRIGGER_URL=$(pulumi stack output url)

  cd ..

  # Deploy infrastructure
  cd infra/ && pulumi stack select dev -c && pulumi up -f -y

  # Get url to benchmark gateway
  BENCHMARK_URL=$(pulumi stack output url)

  echo "Start HTTP trigger benchmark:"
  echo "$BENCHMARK_URL?trigger=http&input=$TRIGGER_URL"
}

deploy_storage_trigger() {
  # Deploy shared resources
  deploy_shared_resources

  # Get name of resource group
  RESOURCE_GROUP=$(pulumi stack output resourceGroupName)

  cd ..

  # Deploy storage trigger
  cd storage/ && pulumi stack select dev -c && pulumi up -f -y

  # Assign required roles, get storage account name and container name
  STORAGE_ACCOUNT_NAME=$(pulumi stack output storageAccountName)
  CONTAINER_NAME=$(pulumi stack output containerName)

  # Subscription ID, this should never change
  SUBSCRIPTION_ID="7736bb83-1342-4df1-8914-8f815ea3011e"

  ##
  # assign role "Storage Blob Data Contributor" to relevant asignees
  ##

  cd ..

  # Deploy infrastructure
  cd infra/ && pulumi stack select dev -c && pulumi up -f -y

  # Get url to benchmark gateway
  BENCHMARK_URL=$(pulumi stack output url)

  echo "Start storage trigger benchmark:"
  echo "$BENCHMARK_URL?trigger=storage&input=$CONTAINER_NAME,$STORAGE_ACCOUNT_NAME"
}

deploy_queue_trigger() {
  # Deploy shared resources
  cd shared/ && pulumi stack select dev -c && pulumi up -f -y

  # Get name of resource group
  RESOURCE_GROUP=$(pulumi stack output resourceGroupName)

  cd ..

  # Deploy queue trigger
  cd queue/ && pulumi stack select dev -c && pulumi up -f -y

  # Get storage account name and queue name
  STORAGE_ACCOUNT_NAME=$(pulumi stack output storageAccountName)
  QUEUE_NAME=$(pulumi stack output queueName)

 # Subscription ID, this should never change
  SUBSCRIPTION_ID="7736bb83-1342-4df1-8914-8f815ea3011e"

  ##
  # assign role "Storage Blob Data Contributor" to relevant asignees
  ##

  cd ..

  # Deploy infrastructure
  cd infra/ && pulumi stack select dev -c && pulumi up -f -y

  # Get url to benchmark gateway
  BENCHMARK_URL=$(pulumi stack output url)

  echo "Start queue trigger benchmark:"
  echo "$BENCHMARK_URL?trigger=queue&input=$QUEUE_NAME,$STORAGE_ACCOUNT_NAME"
}

# Read input flags
while getopts 't:' flag; do
  case "${flag}" in
    t) TRIGGER_TYPE="${OPTARG}" ;;
    *) exit 1 ;;
  esac
done

# Decide which trigger to deploy based on input flag
if [ "$TRIGGER_TYPE" = 'http' ]
then
  deploy_http_trigger
elif [ "$TRIGGER_TYPE" = 'storage' ]
then
  deploy_storage_trigger
elif [ "$TRIGGER_TYPE" = 'queue' ]
then
  deploy_queue_trigger
else
  echo 'Error: Unsupported trigger'
fi
