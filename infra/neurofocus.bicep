// neurofocus.bicep — NeuroFocus complete Azure infrastructure
// Deploys all 8 services for the SHPE 2026 Microsoft Innovation Challenge
//
// Deploy (one command):
//   az group create -n neurofocus-rg -l eastus
//   az deployment group create -g neurofocus-rg --template-file infra/neurofocus.bicep
//
// After deploy, outputs give you the live URLs and Key Vault URL.
// The backend reads all secrets from Key Vault via Managed Identity —
// no API keys are stored in App Service configuration.

@description('8-character suffix derived from the resource group ID — consistent across re-deploys')
param suffix string = take(uniqueString(resourceGroup().id), 8)

@description('Azure region — defaults to the resource group location')
param location string = resourceGroup().location

@description('GPT-4o capacity in thousands of tokens per minute')
param openaiCapacity int = 10

// ── 1. Azure OpenAI ───────────────────────────────────────────────────────── //

resource openai 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: 'nf-oai-${suffix}'
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'Enabled' }
}

resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-10-01-preview' = {
  parent: openai
  name: 'gpt-4o'
  sku: { name: 'Standard', capacity: openaiCapacity }
  properties: {
    model: { format: 'OpenAI', name: 'gpt-4o', version: '2024-05-13' }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

// ── 2. Azure Cosmos DB (Serverless, NoSQL) ────────────────────────────────── //

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: 'nf-cosmos-${suffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [{ name: 'EnableServerless' }]  // pay-per-request, zero idle cost
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [{ locationName: location, failoverPriority: 0 }]
    enableAutomaticFailover: false
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmos
  name: 'neurofocus'
  properties: { resource: { id: 'neurofocus' } }
}

resource prefsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDb
  name: 'user_preferences'
  properties: {
    resource: {
      id: 'user_preferences'
      partitionKey: { paths: ['/user_id'], kind: 'Hash' }
    }
  }
}

resource sessionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDb
  name: 'sessions'
  properties: {
    resource: {
      id: 'sessions'
      partitionKey: { paths: ['/user_id'], kind: 'Hash' }
      defaultTtl: 7776000  // 90-day auto-expiry — keeps storage clean
    }
  }
}

// ── 3. Azure AI Content Safety ────────────────────────────────────────────── //

resource contentSafety 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: 'nf-safety-${suffix}'
  location: location
  kind: 'ContentSafety'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'Enabled' }
}

// ── 4. Azure AI Document Intelligence ────────────────────────────────────── //

resource docIntelligence 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: 'nf-docintel-${suffix}'
  location: location
  kind: 'FormRecognizer'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'Enabled' }
}

// ── 5. Azure Blob Storage ─────────────────────────────────────────────────── //
// Storage account names: lowercase alphanumeric only, max 24 chars

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'nfst${suffix}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false   // documents are private — no public blob URLs
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource storageBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: storageBlobService
  name: 'documents'
  properties: { publicAccess: 'None' }
}

// ── 6. Azure App Service (deployed separately — see note below) ───────────── //
// App Service is defined at the bottom alongside Static Web Apps.

// ── 7. Azure Monitor + Application Insights ───────────────────────────────── //
// Log Analytics workspace is required for workspace-based App Insights (modern pattern)

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'nf-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30  // minimum paid retention — sufficient for hackathon
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'nf-insights-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ── 8. Azure Key Vault ────────────────────────────────────────────────────── //
// All secrets stored here. App Service reads them via Managed Identity.
// No secrets are stored in App Service configuration.

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'nf-kv-${suffix}'
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true  // RBAC over access policies — recommended pattern
    enableSoftDelete: true
    softDeleteRetentionInDays: 7   // minimum — avoids name conflicts on redeploy
  }
}

// ── Key Vault secrets (all 10 credentials from the secret map in keyvault.py) //

resource kvOpenAiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-api-key'
  properties: { value: openai.listKeys().key1 }
}

resource kvOpenAiEndpoint 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-endpoint'
  properties: { value: openai.properties.endpoint }
}

resource kvCosmosKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-key'
  properties: { value: cosmos.listKeys().primaryMasterKey }
}

resource kvCosmosEndpoint 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-endpoint'
  properties: { value: cosmos.properties.documentEndpoint }
}

resource kvSafetyKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'content-safety-key'
  properties: { value: contentSafety.listKeys().key1 }
}

resource kvSafetyEndpoint 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'content-safety-endpoint'
  properties: { value: contentSafety.properties.endpoint }
}

resource kvBlobConn 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'blob-connection-string'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
  }
}

resource kvDocIntelKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'doc-intelligence-key'
  properties: { value: docIntelligence.listKeys().key1 }
}

resource kvDocIntelEndpoint 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'doc-intelligence-endpoint'
  properties: { value: docIntelligence.properties.endpoint }
}

resource kvAppInsights 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'app-insights-connection-string'
  properties: { value: appInsights.properties.ConnectionString }
}

// ── Static Web Apps (React frontend — Free tier) ───────────────────────────── //
// NOTE: SWA is defined before backendApp so its hostname is available for CORS.
// To connect to GitHub: after deploy, add the SWA deployment token as a
// GitHub secret (AZURE_STATIC_WEB_APPS_API_TOKEN) and use the GitHub Action
// workflow that Azure generates automatically in the portal.

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: 'nf-swa-${suffix}'
  location: 'eastus2'  // SWA has limited region support — eastus2 is broadly available
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    buildProperties: {
      appLocation: 'frontend'
      outputLocation: 'dist'
      appBuildCommand: 'npm run build'
    }
  }
}

// ── App Service Plan + Backend ─────────────────────────────────────────────── //

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'nf-plan-${suffix}'
  location: location
  sku: { name: 'F1', tier: 'Free' }  // Free tier — no VM quota needed (hackathon demo)
  kind: 'linux'
  properties: { reserved: true }
}

resource backendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: 'nf-api-${suffix}'
  location: location
  identity: {
    type: 'SystemAssigned'  // Managed Identity — authenticates to Key Vault, no stored credentials
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.11'
      // Install deps from backend/ then start uvicorn on port 8000
      appCommandLine: 'bash -c "pip install -r /home/site/wwwroot/backend/requirements.txt --quiet && cd /home/site/wwwroot/backend && uvicorn main:app --host 0.0.0.0 --port 8000"'
      appSettings: [
        // Only non-sensitive config — all secrets fetched from Key Vault at startup
        { name: 'KEYVAULT_URL', value: keyVault.properties.vaultUri }
        { name: 'ALLOWED_ORIGINS', value: 'https://${swa.properties.defaultHostname}' }
        { name: 'WEBSITES_PORT', value: '8000' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: '0' }  // startup cmd handles install
      ]
    }
  }
}

// Grant App Service Managed Identity read access to Key Vault secrets
// Role: Key Vault Secrets User (built-in) — read-only, principle of least privilege
var kvSecretsUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, backendApp.id, kvSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: kvSecretsUserRoleId
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────── //

output backendUrl string = 'https://${backendApp.properties.defaultHostName}'
output frontendUrl string = 'https://${swa.properties.defaultHostname}'
output keyVaultUrl string = keyVault.properties.vaultUri
output appInsightsName string = appInsights.name
output resourceSuffix string = suffix  // useful for finding resources in the portal
