# Google Cloud Run Deployment Guide

This document explains how to prepare Google Cloud resources so the `Deploy bot` GitHub Action can publish and roll out new revisions automatically. Complete these steps once before the first merge to `main`, then revisit when rotating credentials or onboarding a new environment.

---

## 1. Prerequisites

- A Google Cloud project dedicated to this bot (examples use `my-disubana`).
- `gcloud` CLI installed locally and authenticated (`gcloud auth login`).
- Owner or IAM permissions to create Artifact Registry, Cloud Run, Secret Manager entries, and Workload Identity Federation.
- GitHub repository admin access (to configure Actions secrets).

Set a few helpers for the commands below:

```bash
PROJECT_ID=my-disubana
REGION=us-central1          # pick any Cloud Run supported region
REPO=disubana               # Artifact Registry Docker repository name
SERVICE=disubana            # Cloud Run service name
```

---

## 2. Enable billing and required APIs

If the project is new, link it to a billing account before enabling services:

```bash
gcloud beta billing projects link $PROJECT_ID \
  --billing-account=<BILLING_ACCOUNT_ID>
```

Replace `<BILLING_ACCOUNT_ID>` with the ID from `gcloud billing accounts list`.

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com
```

---

## 3. Create the Artifact Registry repository

Cloud Run will pull the container image from Artifact Registry:

```bash
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="Disubana production images" \
  --project=$PROJECT_ID
```

Record the image URI template (for reference only—this is not a shell command):

```
${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/disubana:<tag>
```

If you want to print the fully expanded value, use:

```bash
echo "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/disubana:${GITHUB_SHA:-<tag>}"
```

---

## 4. Store runtime secrets in Secret Manager

Seed Google Secret Manager with the runtime secrets from the repository `.env` file:

```bash
export PROJECT_ID=${PROJECT_ID:-my-disubana}   # ensure PROJECT_ID is set
./scripts/upload-env-secrets.sh                # reads from .env by default
```

The helper script creates any missing secrets listed in the file and uploads the current values as new versions. Pass an alternate env file path as the first argument if needed. If the Secret Manager API is not enabled, `gcloud` will prompt you to enable it—answer `y` or repeat step 2.

Recommended secret names (must match the ones referenced by the Cloud Run deploy step):

```
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_PUBLIC_KEY
GH_APP_ID
GH_APP_PRIVATE_KEY
GH_INSTALLATION_ID
ASANA_ACCESS_TOKEN
ASANA_PROJECT_GID
ASANA_SECTION_GID
OPENAI_API_KEY
```

> **Manual alternative:** To create a secret without the script, run `gcloud secrets create <NAME> --replication-policy="automatic" --project=$PROJECT_ID`, then pipe the value with `printf '%s' 'value' | gcloud secrets versions add <NAME> --data-file=- --project=$PROJECT_ID`.

Grant the Cloud Run runtime service account access:

```bash
RUNTIME_SA=disubana-runtime@$PROJECT_ID.iam.gserviceaccount.com
gcloud iam service-accounts create disubana-runtime --project=$PROJECT_ID

for secret in DISCORD_TOKEN DISCORD_CLIENT_ID DISCORD_PUBLIC_KEY GH_APP_ID GH_APP_PRIVATE_KEY GH_INSTALLATION_ID ASANA_ACCESS_TOKEN ASANA_PROJECT_GID ASANA_SECTION_GID OPENAI_API_KEY; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done
```

---

## 5. Create the Cloud Run service (initial deployment)

Deploy a placeholder revision so the service exists before CI runs:

```bash
gcloud run deploy $SERVICE \
  --project=$PROJECT_ID \
  --region=$REGION \
  --image=gcr.io/cloudrun/hello \
  --platform=managed \
  --service-account=$RUNTIME_SA \
  --no-allow-unauthenticated \
  --set-env-vars=NODE_ENV=production
```

We will overwrite the image and secret bindings during GitHub Actions deployments.

---

## 6. Configure Workload Identity Federation for GitHub Actions

This avoids long-lived JSON keys. Follow Google’s recommended setup:

1. **Create a dedicated deploy service account:**
   ```bash
   gcloud iam service-accounts create disubana-deployer --project=$PROJECT_ID
   DEPLOY_SA=disubana-deployer@$PROJECT_ID.iam.gserviceaccount.com
   ```
2. **Grant permissions:**
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$DEPLOY_SA" \
     --role="roles/artifactregistry.writer"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$DEPLOY_SA" \
     --role="roles/run.admin"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$DEPLOY_SA" \
     --role="roles/secretmanager.secretAccessor"

   gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
     --project=$PROJECT_ID \
     --member="serviceAccount:$DEPLOY_SA" \
     --role="roles/iam.serviceAccountUser"
   ```
3. **Create a Workload Identity Pool and provider linked to GitHub:**
   ```bash
   gcloud iam workload-identity-pools create disubana-pool \
     --project=$PROJECT_ID \
     --location=global \
     --display-name="GitHub CI pool"

   gcloud iam workload-identity-pools providers create-oidc github-provider \
     --project=$PROJECT_ID \
     --location=global \
     --workload-identity-pool=disubana-pool \
     --display-name="GitHub Actions" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition="attribute.repository=='<OWNER>/<REPO>'"
   ```
   Capture the numeric project number (required for the next command):
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
   ```
4. **Allow the GitHub repository to impersonate the deploy service account:**
   ```bash
   gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA \
     --project=$PROJECT_ID \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/disubana-pool/attribute.repository/<OWNER>/<REPO>" \
     --role="roles/iam.workloadIdentityUser"
   ```

Capture these values for GitHub Secrets (copy the exact command output):

- `GCP_WORKLOAD_IDENTITY_PROVIDER`:
  ```bash
  gcloud iam workload-identity-pools providers describe github-provider \
    --project=$PROJECT_ID \
    --location=global \
    --workload-identity-pool=disubana-pool \
    --format='value(name)'
  ```
- `GCP_SERVICE_ACCOUNT`:
  ```bash
  echo $DEPLOY_SA
  ```

---

## 7. Configure GitHub Actions secrets

In **Settings → Secrets and variables → Actions** (or a `production` environment), add:

| Secret | Example value | Notes |
| --- | --- | --- |
| `GCP_PROJECT_ID` | `my-disubana` | Target project |
| `GCP_REGION` | `us-central1` | Must match Artifact Registry & Cloud Run |
| `GCP_ARTIFACT_REPOSITORY` | `disubana` | Docker repo created in step 3 |
| `GCP_SERVICE` | `disubana` | Cloud Run service name |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/.../providers/github-provider` | From step 6 |
| `GCP_SERVICE_ACCOUNT` | `disubana-deployer@my-disubana.iam.gserviceaccount.com` | From step 6 |
 
No runtime secrets live in GitHub—Cloud Run reads them from Secret Manager.

---

## 8. First GitHub Actions deploy

1. Merge a change to `main` (or trigger the workflow manually).
2. The action will:
   - Build and push the Docker image to Artifact Registry.
   - Deploy a new Cloud Run revision with `NODE_ENV=production`.
   - Attach Secret Manager versions to environment variables.
3. Confirm the service is healthy:
   ```bash
   gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT_ID
   ```
4. (Optional) Grant end users access: run `gcloud run services add-iam-policy-binding` with `roles/run.invoker` for the principals that should be able to invoke the bot endpoint.

---

## 9. Maintenance tips

- Rotate secret versions in Secret Manager; the next deployment automatically picks up `:latest`. You can also call `gcloud run services update --set-secrets=...`.
- Use Terraform/Pulumi to codify the steps above for reproducible environments.
- Monitor Cloud Run logs (`gcloud logs read --project=$PROJECT_ID --region=$REGION --service=$SERVICE`) and set up alerts via Cloud Monitoring if desired.
- Keep the runtime service account scoped minimally; grant additional IAM roles only when features require them.

The Cloud Run deployment path avoids long-lived service keys by relying on Workload Identity Federation; no SSH credentials are required when following the GCP-only process described above.
