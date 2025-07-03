# GCP Secret Manager with Workload Identity Federation

This example demonstrates how to configure ggscout to authenticate with Google Cloud Secret Manager using Workload Identity Federation for Kubernetes. This approach eliminates the need for service account keys by allowing Kubernetes ServiceAccounts to directly authenticate to Google Cloud APIs.

## Prerequisites

### Required Tools
1. **gcloud CLI** - [Install gcloud CLI](https://cloud.google.com/sdk/docs/install)
2. **kubectl** - [Install kubectl](https://kubernetes.io/docs/tasks/tools/)
3. **A running Kubernetes cluster** with OIDC issuer support
4. **Google Cloud Project**

### Required Permissions
You need the following IAM roles in your Google Cloud project:
- `roles/iam.workloadIdentityPoolAdmin` - To create workload identity pools and providers
- `roles/iam.serviceAccountAdmin` - To create and manage service accounts
- `roles/secretmanager.admin` - To access Secret Manager (or appropriate granular permissions)

### Kubernetes Cluster Requirements
Your Kubernetes cluster must support:
- **Kubernetes 1.20 or later**
- **ServiceAccount token volume projections**
- **OIDC issuer URL** (for external clusters like EKS, AKS, or self-hosted)

For managed Kubernetes services:
- **EKS**: No additional configuration needed
- **AKS**: Enable the OIDC issuer feature
- **Self-hosted**: Configure `kube-apiserver` to support ServiceAccount token volume projections

## Setup Process

### Step 1: Enable Required Google Cloud APIs

```bash
# Set your project ID
export PROJECT_ID="your-project-id"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Enable required APIs
gcloud services enable iam.googleapis.com \
    --project=$PROJECT_ID

gcloud services enable iamcredentials.googleapis.com \
    --project=$PROJECT_ID

gcloud services enable sts.googleapis.com \
    --project=$PROJECT_ID

gcloud services enable secretmanager.googleapis.com \
    --project=$PROJECT_ID
```

### Step 2: Get Your Kubernetes Cluster's OIDC Issuer URL

The method depends on your Kubernetes cluster type:

#### For Amazon EKS:
```bash
export CLUSTER_NAME="your-cluster-name"
export ISSUER_URL=$(aws eks describe-cluster --name $CLUSTER_NAME --query "cluster.identity.oidc.issuer" --output text)
echo "Issuer URL: $ISSUER_URL"
```

#### For Azure AKS:
```bash
export CLUSTER_NAME="your-cluster-name"
export RESOURCE_GROUP="your-resource-group"
export ISSUER_URL=$(az aks show -n $CLUSTER_NAME -g $RESOURCE_GROUP --query "oidcIssuerProfile.issuerUrl" -otsv)
echo "Issuer URL: $ISSUER_URL"
```

#### For Self-hosted Kubernetes:
```bash
# Connect to your cluster first
kubectl get --raw /.well-known/openid-configuration | jq -r .issuer
```

### Step 3: Create Workload Identity Pool and Provider

```bash
# Set configuration variables
export POOL_ID="ggscout-pool"
export PROVIDER_ID="ggscout-k8s-provider"
export NAMESPACE="default"  # or your preferred namespace
export KSA_NAME="ggscout-ksa"  # Kubernetes ServiceAccount name

# Create the workload identity pool
gcloud iam workload-identity-pools create $POOL_ID \
    --location="global" \
    --description="Workload Identity Pool for ggscout" \
    --display-name="ggscout Workload Identity Pool" \
    --project=$PROJECT_ID

# For EKS and AKS (using OIDC metadata endpoints)
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
    --location="global" \
    --workload-identity-pool=$POOL_ID \
    --issuer-uri="$ISSUER_URL" \
    --attribute-mapping="google.subject=assertion.sub,attribute.namespace=assertion['kubernetes.io']['namespace'],attribute.service_account_name=assertion['kubernetes.io']['serviceaccount']['name']" \
    --attribute-condition="assertion['kubernetes.io']['namespace'] == '$NAMESPACE' && assertion['kubernetes.io']['serviceaccount']['name'] == '$KSA_NAME'" \
    --project=$PROJECT_ID
```

#### For Self-hosted Kubernetes (requires JWKS upload):
```bash
# Download the cluster's JWKS
kubectl get --raw /openid/v1/jwks > cluster-jwks.json

# Create provider with JWKS
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
    --location="global" \
    --workload-identity-pool=$POOL_ID \
    --issuer-uri="$ISSUER_URL" \
    --attribute-mapping="google.subject=assertion.sub,attribute.namespace=assertion['kubernetes.io']['namespace'],attribute.service_account_name=assertion['kubernetes.io']['serviceaccount']['name']" \
    --attribute-condition="assertion['kubernetes.io']['namespace'] == '$NAMESPACE' && assertion['kubernetes.io']['serviceaccount']['name'] == '$KSA_NAME'" \
    --jwk-json-path="cluster-jwks.json" \
    --project=$PROJECT_ID
```

### Step 4: Create Google Cloud Service Account

```bash
export GSA_NAME="ggscout-gsa"

# Create the Google Cloud service account
gcloud iam service-accounts create $GSA_NAME \
    --display-name="ggscout Google Cloud Service Account" \
    --project=$PROJECT_ID

# Grant Secret Manager permissions to the service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$GSA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### Step 5: Create Kubernetes ServiceAccount and Configure IAM Binding

```bash
# Create Kubernetes namespace (if it doesn't exist)
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create Kubernetes ServiceAccount
kubectl create serviceaccount $KSA_NAME --namespace $NAMESPACE

# Allow the Kubernetes ServiceAccount to impersonate the Google Cloud ServiceAccount
gcloud iam service-accounts add-iam-policy-binding \
    $GSA_NAME@$PROJECT_ID.iam.gserviceaccount.com \
    --role="roles/iam.workloadIdentityUser" \
    --member="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/subject/system:serviceaccount:$NAMESPACE:$KSA_NAME" \
    --project=$PROJECT_ID
```

### Step 6: Update Configuration Files

Update the `values.yaml` file with your specific configuration:

```yaml
inventory:
  config:
    sources:
      gcp:
        type: gcpsecretmanager
        fetch_all_versions: true
        auth:
          auth_mode: k8s
          project_id: "your-project-id"        # Replace with your PROJECT_ID
          project_number: 123456789012          # Replace with your PROJECT_NUMBER
          pool_id: "ggscout-pool"              # Your POOL_ID
          provider_id: "ggscout-k8s-provider"  # Your PROVIDER_ID
          gcp_service_account_name: "ggscout-gsa"  # Your GSA_NAME
        mode: "read"
    gitguardian:
      endpoint: "https://your-gg-instance/v1"  # Replace with your GitGuardian endpoint
      api_token: "${GITGUARDIAN_API_KEY}"
```

Update the `secret.yaml` file with your GitGuardian API key:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ggscout-secrets
stringData:
  GITGUARDIAN_API_KEY: "your_gitguardian_token"  # Replace with your actual token
```

## Deployment

### 1. Add the ggscout Helm repository

```bash
helm repo add ggscout-charts https://gitguardian.github.io/ggscout-helm-charts
helm repo update
```

### 2. Apply the secret

```bash
kubectl apply -f secret.yaml -n $NAMESPACE
```

### 3. Install ggscout with Workload Identity Federation

```bash
helm install ggscout-gcp ggscout-charts/ggscout \
    -f values.yaml \
    --namespace $NAMESPACE \
    --set serviceAccount.create=false \
    --set serviceAccount.name=$KSA_NAME
```

## Verification

Check that ggscout can authenticate with Google Cloud Secret Manager:

```bash
# Check the logs of the ggscout pods
kubectl logs -l app.kubernetes.io/name=ggscout -n $NAMESPACE

# Check if the CronJobs are running
kubectl get cronjobs -n $NAMESPACE

# Check pod status
kubectl get pods -n $NAMESPACE
```

## Troubleshooting

### Common Issues

1. **Authentication Issues**
   ```bash
   # Verify the workload identity pool and provider exist
   gcloud iam workload-identity-pools describe $POOL_ID --location="global" --project=$PROJECT_ID
   gcloud iam workload-identity-pools providers describe $PROVIDER_ID --location="global" --workload-identity-pool=$POOL_ID --project=$PROJECT_ID
   ```

2. **Permission Issues**
   ```bash
   # Check IAM bindings on the service account
   gcloud iam service-accounts get-iam-policy $GSA_NAME@$PROJECT_ID.iam.gserviceaccount.com --project=$PROJECT_ID

   # Verify Secret Manager permissions
   gcloud projects get-iam-policy $PROJECT_ID --flatten="bindings[].members" --format='table(bindings.role)' --filter="bindings.members:$GSA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
   ```

3. **OIDC Issuer Issues**
   ```bash
   # For external clusters, verify the issuer URL is accessible
   curl -s $ISSUER_URL/.well-known/openid-configuration | jq .issuer
   ```

4. **Kubernetes ServiceAccount Token Issues**
   ```bash
   # Check if the pod can access the ServiceAccount token
   kubectl exec -it <pod-name> -n $NAMESPACE -- cat /var/run/secrets/kubernetes.io/serviceaccount/token
   ```

### Debug Pod Configuration

If authentication is failing, you can create a debug pod to test the configuration:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: debug-workload-identity
  namespace: $NAMESPACE
spec:
  serviceAccountName: $KSA_NAME
  containers:
  - name: debug
    image: google/cloud-sdk:slim
    command: ["sleep", "3600"]
    env:
    - name: GOOGLE_APPLICATION_CREDENTIALS
      value: /var/run/service-account/token
    volumeMounts:
    - name: token
      mountPath: /var/run/service-account
      readOnly: true
  volumes:
  - name: token
    projected:
      sources:
      - serviceAccountToken:
          audience: https://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/providers/$PROVIDER_ID
          expirationSeconds: 3600
          path: token
EOF

# Test authentication
kubectl exec -it debug-workload-identity -n $NAMESPACE -- gcloud auth list
kubectl exec -it debug-workload-identity -n $NAMESPACE -- gcloud projects list
```

## Security Considerations

1. **Principle of Least Privilege**: Only grant the minimum required permissions to the Google Cloud service account.

2. **Namespace Isolation**: Use the attribute condition to restrict access to specific namespaces and ServiceAccounts.

3. **Audience Validation**: Ensure the OIDC token audience matches your workload identity provider configuration.

4. **Regular Auditing**: Regularly review IAM bindings and workload identity configurations.

## Additional Resources

- [Google Cloud Workload Identity Federation Documentation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Configure Workload Identity Federation with Kubernetes](https://cloud.google.com/iam/docs/workload-identity-federation-with-kubernetes)
- [GitGuardian ggscout Documentation](https://docs.gitguardian.com/ggscout-docs/)

For more information about other authentication methods, see the [gcpsecretmanager example](../gcpsecretmanager/) which uses service account key files.
