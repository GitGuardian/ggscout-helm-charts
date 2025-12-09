# CyberArk SaaS with Workload Authentication

This example demonstrates how to configure ggscout to authenticate with CyberArk SaaS using Workload authentication.

## Prerequisites

1. Access to a CyberArk SaaS instance
2. A CyberArk workload with appropriate permissions
3. Workload login ID and API key

## Configuration

### 1. Workload Setup

In your CyberArk SaaS instance, ensure you have:
- A workload identity configured
- Appropriate policies granting the workload access to secrets
- The workload login ID and API key

### 2. Update Configuration

Edit the `secret.yaml` file to match your environment:

- `CYBERARK_WORKLOAD_LOGIN`: Your CyberArk workload login ID (e.g., "host/my-app")
- `CYBERARK_WORKLOAD_API_KEY`: Your CyberArk workload API key
- `CYBERARK_SUBDOMAIN`: Your CyberArk SaaS subdomain
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

# Install ggscout with CyberArk SaaS Workload authentication
helm install ggscout-cyberark ggscout/ggscout -f values.yaml
```

## Verification

Check that ggscout can authenticate with CyberArk SaaS:

```bash
# Check the logs of the ggscout pods
kubectl logs -l app.kubernetes.io/name=ggscout

# Check if the CronJobs are running
kubectl get cronjobs
```

## Troubleshooting

1. **Authentication Issues**: Verify the workload login ID and API key are correct
2. **Permission Issues**: Ensure the workload has proper policies to access the required secrets
3. **Network Connectivity**: Verify ggscout pods can reach your CyberArk SaaS instance

For more details on CyberArk SaaS workload authentication, refer to the [CyberArk SaaS documentation](https://docs.cyberark.com/secrets-hub/).
