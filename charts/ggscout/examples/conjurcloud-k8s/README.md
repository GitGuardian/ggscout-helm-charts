# Conjur Cloud with Kubernetes JWT Authentication

This example demonstrates how to configure ggscout to authenticate with Conjur Cloud using Kubernetes JWT tokens.

## Overview

Kubernetes JWT authentication allows ggscout running in a Kubernetes cluster to authenticate with Conjur Cloud using the cluster's service account tokens. This eliminates the need to manage static credentials.

## Prerequisites

Before using this example, you need:

1. **Conjur Cloud Account**: Access to a Conjur Cloud instance
2. **Kubernetes Cluster**: EKS, GKE, AKS, or self-hosted cluster
3. **JWT Authenticator**: Configured in Conjur Cloud for your cluster
4. **Workload Identity**: Created in Conjur Cloud for your ggscout service account

## Setup Steps

### 1. Configure JWT Authenticator in Conjur Cloud

Create a JWT authenticator in Conjur Cloud with the following configuration:

**For AWS EKS:**
```bash
# Get your EKS cluster's OIDC issuer URL
aws eks describe-cluster --name <YOUR_CLUSTER_NAME> --query "cluster.identity.oidc.issuer" --output text
```

**JWT Authenticator Variables:**
- `jwks-uri`: `https://oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE/keys`
- `issuer`: `https://oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE`
- `token-app-property`: `sub` (IMPORTANT: Always use 'sub' for Kubernetes)
- `audience`: `conjur` (recommended)

### 2. Create Workload Identity

Create a workload identity in Conjur Cloud for your ggscout service account:

**Workload Configuration:**
- **Authentication Method**: JWT
- **JWT Authenticator**: Your authenticator ID (e.g., `k8s-cluster-name`)
- **Workload ID**: `system:serviceaccount:<namespace>:<service-account-name>`
- **Policy Branch**: `k8s-apps` (or your preferred branch)

**Example using Conjur CLI:**
```yaml
# Create workload policy (save as workload-policy.yaml)
- !policy
  id: k8s-apps
  body:
    - !host
      id: system:serviceaccount:ggscout-namespace:ggscout-service-account
      annotations:
        authn-jwt/k8s-cluster-name/sub: system:serviceaccount:ggscout-namespace:ggscout-service-account
        kubernetes/namespace: ggscout-namespace
        kubernetes/service-account: ggscout-service-account

    - !grant
      role: !group conjur/authn-jwt/k8s-cluster-name/users
      member: !host system:serviceaccount:ggscout-namespace:ggscout-service-account
```

Load the policy:
```bash
conjur policy load -f workload-policy.yaml -b data
```

### 3. Grant Access to Secrets

Create secrets and grant access to your workload:

```yaml
# Create secrets policy (save as secrets-policy.yaml)
- !policy
  id: ggscout-secrets
  body:
    - !variable
      id: database/password
    - !variable
      id: api/token
    
    - !group consumers
    
    - !permit
      role: !group consumers
      privileges: [read, execute]
      resources:
        - !variable database/password
        - !variable api/token
    
    - !grant
      role: !group consumers
      member: !host /data/k8s-apps/system:serviceaccount:ggscout-namespace:ggscout-service-account
```

### 4. Update Configuration

Update the `secret.yaml` file with your specific values:

```yaml
stringData:
  CONJUR_SUBDOMAIN: "your-company"
  CONJUR_JWT_AUTHENTICATOR_ID: "k8s-cluster-name"
  GITGUARDIAN_API_KEY: "your_gitguardian_api_token"
  NAMESPACE: "ggscout-namespace"
```

### 5. Deploy ggscout

Deploy ggscout with the Kubernetes JWT authentication configuration:

```bash
# Create the namespace
kubectl create namespace ggscout-namespace

# Apply the secret
kubectl apply -f secret.yaml -n ggscout-namespace

# Install ggscout with Helm
helm upgrade ggscout ggscout-charts/ggscout \
  --install \
  --namespace ggscout-namespace \
  --values values.yaml
```

## Important Configuration Notes

### Service Account Identity Format

The workload identity in Conjur Cloud must exactly match the Kubernetes service account format:
```
system:serviceaccount:<namespace>:<service-account-name>
```

### Token App Property

Always use `sub` as the `token-app-property` in your JWT authenticator. The `sub` claim contains the service account identity.

### Namespace Considerations

- The namespace in your Kubernetes deployment must match the namespace in your Conjur workload identity
- Update the `NAMESPACE` environment variable in `secret.yaml` if using a different namespace
- Ensure your service account has the necessary RBAC permissions

## Troubleshooting

### Authentication Issues

1. **Verify JWT authenticator configuration**: Check that `jwks-uri`, `issuer`, and `token-app-property` are correctly set
2. **Check workload identity**: Ensure the workload ID matches the service account format exactly
3. **Verify RBAC**: Make sure the service account has access to the required Conjur resources

### Common Errors

**"Unable to authenticate"**: Usually indicates a mismatch between the workload identity and service account name.

**"Access denied"**: The workload lacks permissions to access the requested secrets.

**"Invalid JWT"**: The JWT authenticator configuration may be incorrect.

### Debugging

Enable debug logging to troubleshoot authentication issues:

```yaml
# Add to values.yaml
logs:
  level: debug
```

## Additional Resources

- [Conjur Cloud JWT Authentication Documentation](https://docs.cyberark.com/conjur-cloud/latest/en/Content/Operations/Services/JWT_Authenticator.htm)
- [Kubernetes Service Account Tokens](https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/)
- [ggscout Configuration Guide](https://docs.gitguardian.com/ggscout-docs/configuration)
