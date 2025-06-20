# HashiCorp Vault with Kubernetes Authentication

This example demonstrates how to configure ggscout to authenticate with HashiCorp Vault using Kubernetes authentication when running in a Kubernetes cluster.

## Prerequisites

1. HashiCorp Vault with Kubernetes auth method enabled
2. Proper Vault policies and roles configured
3. ggscout deployed in a Kubernetes cluster

## Vault Configuration

### 1. Enable Kubernetes Auth Method

```bash
# Enable Kubernetes auth method
vault auth enable kubernetes
```

See HashiCorp Vault reference [documentation](https://developer.hashicorp.com/vault/docs/auth/kubernetes#configuration)

### 2. Configure Kubernetes Auth Method

```bash
# Configure the Kubernetes auth method
vault write auth/kubernetes/config \
    token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
    kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443" \
    kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
```

### 3. Create Vault Policy

```bash
# Create policy for ggscout
vault policy write ggscout-policy - <<EOF
# Allow reading secrets from KV2 engine
path "secret/data/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/*" {
  capabilities = ["read", "list"]
}

# Allow reading from KV1 engine (if used)
path "secret/*" {
  capabilities = ["read", "list"]
}
EOF
```

### 4. Create Vault Kubernetes Role

```bash
# Create Kubernetes auth role
vault write auth/kubernetes/role/ggscout \
    bound_service_account_names=ggscout-vault \
    bound_service_account_namespaces=default \
    policies=ggscout-policy \
    ttl=24h
```

## Deployment

### 1. Update Configuration

Edit the `secret.yaml` file to match your environment:

- `KUBERNETES_SERVICE_ACCOUNT`: Must match the service account name in values.yaml
- `KUBERNETES_NAMESPACE`: The namespace where ggscout will be deployed
- `VAULT_K8S_ROLE`: The Vault role created above
- `GITGUARDIAN_API_KEY`: Your GitGuardian API token

Edit the `values.yaml` file:

- `vault_address`: Your Vault server URL
- `path`: The Vault path to collect secrets from
- `gitguardian.endpoint`: Your GitGuardian instance URL

### 2. Deploy with Helm

```bash
# Add the ggscout Helm repository
helm repo add ggscout https://gitguardian.github.io/nhi-scout-helm-charts
helm repo update

# Apply the secret first
kubectl apply -f secret.yaml

# Install ggscout with Kubernetes authentication
helm install ggscout-vault ggscout/ggscout -f values.yaml
```

## Verification

Check that ggscout can authenticate with Vault:

```bash
# Check the logs of the ggscout pods
kubectl logs -l app.kubernetes.io/name=ggscout

# Verify the service account was created
kubectl get serviceaccount ggscout-vault

# Check if the CronJobs are running
kubectl get cronjobs
```

## Troubleshooting

1. **Service Account Issues**: Ensure the service account name matches between `values.yaml` and `secret.yaml`
2. **Vault Role Binding**: Verify the Vault role is bound to the correct service account and namespace
3. **Network Connectivity**: Ensure ggscout pods can reach your Vault instance
4. **Token Permissions**: Verify the Vault policy grants the necessary permissions

For more detailed troubleshooting, enable debug logging by setting `log_level: debug` in the values.yaml file. 