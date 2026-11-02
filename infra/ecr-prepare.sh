#!/usr/bin/env bash
# Ensures the ECR repository and namespace exist, logs Docker in and refreshes the
# Kubernetes image pull secret. Prints the registry address on stdout.
set -euo pipefail
REPO="$1"
NS="$2"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

aws ecr describe-repositories --region "$REGION" --repository-names "$REPO" >/dev/null 2>&1 ||
  aws ecr create-repository --region "$REGION" --repository-name "$REPO" \
    --image-scanning-configuration scanOnPush=true >/dev/null

PASSWORD="$(aws ecr get-login-password --region "$REGION")"
printf '%s' "$PASSWORD" | docker login --username AWS --password-stdin "$REGISTRY" >&2
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >&2
kubectl -n "$NS" create secret docker-registry ecr-pull \
  --docker-server="$REGISTRY" --docker-username=AWS --docker-password="$PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f - >&2
echo "$REGISTRY"
