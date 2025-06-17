# Conjur Cloud with Workload Authentication

This example demonstrates how to configure ggscout to authenticate with Conjur Cloud using Workload authentication.

## Prerequisites

1. Access to a Conjur Cloud instance
2. A Conjur workload with appropriate permissions
3. Workload login ID and API key

## Configuration

### 1. Workload Setup

In your Conjur Cloud instance, ensure you have:
- A workload identity configured
- Appropriate policies granting the workload access to secrets
- The workload login ID and API key

### 2. Update Configuration

Edit the `secret.yaml` file to match your environment:

- `CONJUR_WORKLOAD_LOGIN`: Your Conjur workload login ID (e.g., "host/my-app")
- `CONJUR_WORKLOAD_API_KEY`: Your Conjur workload API key
- `CONJUR_SUBDOMAIN`: Your Conjur Cloud subdomain
- `GITGUARDIAN_API_KEY`: Your GitGuardian API token

Edit the `values.yaml` file:

- Update the GitGuardian endpoint URL if needed
- Adjust the fetch and sync schedules as required

### 3. Deploy with Helm

```bash
# Add the ggscout Helm repository
helm repo add ggscout https://gitguardian.github.io/nhi-scout-helm-charts
helm repo update

# Apply the secret first
kubectl apply -f secret.yaml

# Install ggscout with Conjur Cloud Workload authentication
helm install ggscout-conjur ggscout/ggscout -f values.yaml
```

## Verification

Check that ggscout can authenticate with Conjur Cloud:

```bash
# Check the logs of the ggscout pods
kubectl logs -l app.kubernetes.io/name=ggscout

# Check if the CronJobs are running
kubectl get cronjobs
```

## Troubleshooting

1. **Authentication Issues**: Verify the workload login ID and API key are correct
2. **Permission Issues**: Ensure the workload has proper policies to access the required secrets
3. **Network Connectivity**: Verify ggscout pods can reach your Conjur Cloud instance

For more details on Conjur Cloud workload authentication, refer to the [Conjur Cloud documentation](https://docs.cyberark.com/conjur-cloud/). 