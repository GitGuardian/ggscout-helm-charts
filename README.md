# GitGuardian ggscout Helm Charts

## Installation

Add the repository to Helm with:

```shell
helm repo add ggscout-charts https://gitguardian.github.io/ggscout-helm-charts
```

Then install the scout, with a values file (examples below):

```shell
helm upgrade ggscout ggscout-charts/ggscout --install --values values.yml
```

An example values file that fetches from HashiCorp Vault and GitLab CI:

```yaml
inventory:
  config:
    sources:
      vault-secrets:
        type: hashicorpvault
        vault_address: "https://your-vault-address-here"
        # If auth is not set, the env variable `VAULT_TOKEN` is used with a `token` auth_mode
        auth:
          auth_mode: "token"
          # Token configuration can be read from environment variables like so:
          token: "${HASHICORP_VAULT_TOKEN}"
        fetch_all_versions: true
        path: "secret/"
      gitlabci:
        type: gitlabci
        token: "${GITLAB_TOKEN}"
        url: "https://gitlab.gitguardian.ovh"
    # To upload, set the gitguardian URL and tokens. Ensure the endpoint path ends with /v1
    # This is optional: omit this to prevent uploading and to only test collection.
    gitguardian:
      endpoint: "https://my-gg-instance/v1"
      api_token: "${GITGUARDIAN_API_KEY}"
  jobs:
    # Job to fetch defined sources
    fetch:
        # Set to `false` to disable the job
        enabled: true
        # Run every 15 minutes
        schedule: '*/15 * * * *'
        # If set to `false`, see the fetch-only configuration example in charts/ggscout/examples/fetch_only
        send: true
    # Job to be able to sync/write secrets from GitGuardian into you vault
    sync:
      # Set to `false` to disable the job
      enabled: true
      # Run every minute
      schedule: '* * * * *'

# This needs to be created separately (read instructions below), and contain the following keys:
# - `HASHICORP_VAULT_TOKEN` - the hashicorp vault token to use
# - `GITLAB_TOKEN` - the GitLab access token to use
# - `GITGUARDIAN_API_KEY` - the GitGuardian token to send results with
envFrom:
  - secretRef:
      name: gitguardian-ggscout-secrets
```

To create or update the secrets, you directly use Kubernetes Secrets API.
Create `secrets.yaml` with the following content (replacing the values with your secrets):

```
apiVersion: v1
kind: Secret
metadata:
  name: gitguardian-ggscout-secrets
stringData:
    HASHICORP_VAULT_TOKEN: "my_vault_token"
    GITGUARDIAN_API_KEY: "my_gitguardian_api_key"
    GITLAB_TOKEN: "my_gitlab_token"
```

To apply the secrets to your cluster/namespace, run the following command: `kubectl apply -f secrets.yaml`

If you want to only fetch the identities without sending them, please see this [example](charts/ggscout/examples/fetch_only)

Other examples can be found in [charts/ggscout/examples](charts/ggscout/examples).

## Development

Install [mise](https://mise.jdx.dev/), then run the following command to run tests:

```shell
$ mise run test
```
