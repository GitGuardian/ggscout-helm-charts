## ggscout-0.4.6 (2025-04-28)

## ggscout-0.4.5 (2025-04-08)

## ggscout-0.4.4 (2025-04-08)

## ggscout-0.4.3 (2025-04-08)

## ggscout-0.4.2 (2025-04-04)

## ggscout-0.4.1 (2025-04-04)

## ggscout-0.4.0 (2025-03-31)

### Feat

- **release**: set 0.16.1 ggscout release

## ggscout-0.3.1 (2025-03-14)

## ggscout-0.3.0 (2025-03-12)

### Feat

- **ca**: improve CA certificates handling

### Fix

- doc generation
- **chart**: remove uri constraint on endpoint to allow variables

## ggscout-0.2.1 (2025-02-18)

### Feat

- **chart**: update examples
- **chart**: use secrets instead of configMap for Scout configuration

### Docs

- provides generated Scout documentation as GitHub pages

## ggscout-0.2.0 (2025-02-10)

### Feat

- **chart,cj**: define ttlSecondsAfterFinished and backoffLimit for jobs
- **cr**: use Release.Namespace and use proper helper for saName
- **image**: rework image path and imagepullsecrets to work with global values from GIM
- **psp**: add proper securityContext to jobs on enforced env. Default conf works with chainguard
- **ggscout**: review doc and helm tests

### Fix

- **json-schema**: Set jsonschema version to 4.x
- **tests**: Fix tests after chart changes
- mise precommit install
- **cronjob**: Fix cronjob naming
- **chart**: pass namespace as a value on clusterrolebinding helm template
