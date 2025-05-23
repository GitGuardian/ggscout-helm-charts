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
        vault_address: "https://your-vault-address-here.com"
        # If auth is not set, the env variable `VAULT_TOKEN` is used with a `token` auth_mode
        auth:
          auth_mode: "token"
          # Token configuration can be read from environment variables like so:
          token: "${HASHICORP_VAULT_TOKEN}"
        fetch_all_versions: true
        path: "secret/"
        mode: "read/write" # Can be `read`, `write` or `read/write` depending on wether fetch and/or sync are enabled
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
        # If you wish to disable sending the fetched secrets to GitGuardian, we recommend
        # doing so by using docker run instead of a helm install
        # see https://docs.gitguardian.com/ggscout-docs/configuration#audit-mode for more details
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

Other examples can be found in [charts/ggscout/examples](charts/ggscout/examples).

> [!IMPORTANT]
> If you want to only fetch the identities without sending them, please see this [example](charts/ggscout/examples/fetch-only)


> [!CAUTION]
> If you are using Rancher fleet to deploy ggscout, please refer to this [section](#rancher-fleet)


## Development

Install [mise](https://mise.jdx.dev/), then run the following command to run tests:

```shell
$ mise run test
```

## Rancher fleet

Rancher fleet uses its own [templating language](https://fleet.rancher.io/ref-fleet-yaml#templating).
If you have created a bundle from this charts repository, make sure to properly escape environment variables.

For example in your values.yml:
```
api_token: ${GG_API_TOKEN}
```

must be declared instead as:
```
api_token: ${` ${GG_API_TOKEN} `}
```

### Full example with Rancher fleet

The previous values example must be changed to:

```yaml
inventory:
  config:
    sources:
      vault-secrets:
        type: hashicorpvault
        vault_address: "https://your-vault-address-here.com"
        # If auth is not set, the env variable `VAULT_TOKEN` is used with a `token` auth_mode
        auth:
          auth_mode: "token"
          # Token configuration can be read from environment variables like so:
          token: "${`${HASHICORP_VAULT_TOKEN}`}"
        fetch_all_versions: true
        path: "secret/"
        mode: "read/write" # Can be `read`, `write` or `read/write` depending on wether fetch and/or sync are enabled
      gitlabci:
        type: gitlabci
        token: "${`${GITLAB_TOKEN}`}"
        url: "https://gitlab.gitguardian.ovh"
    # To upload, set the gitguardian URL and tokens. Ensure the endpoint path ends with /v1
    # This is optional: omit this to prevent uploading and to only test collection.
    gitguardian:
      endpoint: "https://my-gg-instance/v1"
      api_token: "${`${GITGUARDIAN_API_KEY}`}"
  jobs:
    # Job to fetch defined sources
    fetch:
        # Set to `false` to disable the job
        enabled: true
        # Run every 15 minutes
        schedule: '*/15 * * * *'
        # If you wish to disable sending the fetched secrets to GitGuardian, we recommend
        # doing so by using docker run instead of a helm install
        # see https://docs.gitguardian.com/ggscout-docs/configuration#audit-mode for more details
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

If you save this config as `values.yaml` and you declare the following `fleet.yaml` config file:

```yaml
name: ggscout
helm:
  releaseName: ggscout
  repo: https://gitguardian.github.io/ggscout-helm-charts
  branch: main
  chart: ggscout
  valuesFiles:
    - values.yaml
```

You can create a bundle with the following [rancher cli](https://formulae.brew.sh/formula/fleet-cli) command:

```
fleet apply fleet.yaml -o - > ggscout.bdl
```

Then test that the created bundle is correctly parsed by fleet:

```
fleet target --bundle-file ggscout.bdl
```

If you have any error, it probably means you have some variables that are not properly escaped in you `values.yaml` file
