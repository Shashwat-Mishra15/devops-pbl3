# DevOps PBL-III: E-commerce and Healthcare Delivery Pipelines

Author: Shashwat Mishra (RA2311027010120)

| Project | Domain | Pipeline | What it shows |
|---|---|---|---|
| 7. CI/CD to Kubernetes | ShopEase e-commerce | `jenkins/Jenkinsfile.cicd` | Test, build, push to ECR, rolling deployment, smoke test |
| 8. Blue-green deployment | ShopEase e-commerce | `jenkins/Jenkinsfile.bluegreen` | Idle colour deployment, smoke test, instant traffic switch, rollback |
| 9. DevSecOps | MediCare healthcare portal | `jenkins/Jenkinsfile.devsecops` | Secret scan, SAST, SCA, image and config scan, hardened deployment, DAST |

## Architecture

GitHub -> Jenkins -> Docker -> Amazon ECR -> Kubernetes (k3s), all on one EC2 t3.large host in AWS Academy Learner Lab.

Jenkins and the applications are not exposed publicly. Only SSH is open, limited to one IP address, and the web interfaces are reached through an SSH tunnel.

| Service | Port on the host |
|---|---|
| Jenkins | 8080 (localhost only) |
| ShopEase rolling deployment | 30080 |
| ShopEase blue-green, live | 30081 |
| ShopEase blue-green, preview | 30082 |
| MediCare | 30083 |

## Setup

```bash
sudo bash infra/bootstrap.sh <git-repo-url>
```

## Run the tests locally

```bash
cd shopease && npm ci && npm test
cd medicare && npm ci && npm test
```
