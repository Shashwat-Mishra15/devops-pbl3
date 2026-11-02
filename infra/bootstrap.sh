#!/usr/bin/env bash
# Installs Docker, k3s, Jenkins and the three pipeline jobs on an Ubuntu 26.04 EC2 host.
# Usage: sudo bash bootstrap.sh <git-repo-url>
set -euxo pipefail
REPO_URL="$1"
export DEBIAN_FRONTEND=noninteractive
rm -f /etc/apt/sources.list.d/jenkins.list

apt-get update -y
apt-get install -y ca-certificates curl git unzip openssl fontconfig openjdk-21-jre-headless docker.io
systemctl enable --now docker

curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscli.zip
unzip -q -o /tmp/awscli.zip -d /tmp
/tmp/aws/install --update

curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik --write-kubeconfig-mode 600" sh -

KEY_URL=https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key
curl -fsSL "$KEY_URL" -o /usr/share/keyrings/jenkins-keyring.asc
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  > /etc/apt/sources.list.d/jenkins.list
apt-get update -y
apt-get install -y jenkins
systemctl stop jenkins

JENKINS_HOME=/var/lib/jenkins
usermod -aG docker jenkins

mkdir -p "$JENKINS_HOME/.kube"
cp /etc/rancher/k3s/k3s.yaml "$JENKINS_HOME/.kube/config"
chmod 600 "$JENKINS_HOME/.kube/config"

mkdir -p /etc/systemd/system/jenkins.service.d
cat > /etc/systemd/system/jenkins.service.d/override.conf <<'CONF'
[Service]
Environment="JAVA_OPTS=-Djava.awt.headless=true -Djenkins.install.runSetupWizard=false"
Environment="JENKINS_LISTEN_ADDRESS=127.0.0.1"
Environment="KUBECONFIG=/var/lib/jenkins/.kube/config"
CONF

curl -fsSL https://github.com/jenkinsci/plugin-installation-manager-tool/releases/download/2.13.2/jenkins-plugin-manager-2.13.2.jar \
  -o /tmp/plugin-manager.jar
java -jar /tmp/plugin-manager.jar --war /usr/share/java/jenkins.war --plugin-download-directory "$JENKINS_HOME/plugins" \
  --plugins workflow-aggregator git pipeline-stage-view timestamper

mkdir -p "$JENKINS_HOME/init.groovy.d"
[ -f "$JENKINS_HOME/.admin-password" ] || openssl rand -hex 16 > "$JENKINS_HOME/.admin-password"
chmod 600 "$JENKINS_HOME/.admin-password"
cat > "$JENKINS_HOME/init.groovy.d/admin.groovy" <<'GROOVY'
import hudson.security.*
import jenkins.model.*

def jenkins = Jenkins.get()
def realm = new HudsonPrivateSecurityRealm(false)
def password = new File(jenkins.rootDir, '.admin-password').text.trim()
realm.createAccount('admin', password)
jenkins.securityRealm = realm
def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
strategy.allowAnonymousRead = false
jenkins.authorizationStrategy = strategy
jenkins.numExecutors = 2
jenkins.save()
GROOVY

create_job() {
  local name="$1" script="$2" trigger="$3"
  mkdir -p "$JENKINS_HOME/jobs/$name"
  cat > "$JENKINS_HOME/jobs/$name/config.xml" <<XML
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <description>$4</description>
  <keepDependencies>false</keepDependencies>
  <properties>$trigger</properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs><hudson.plugins.git.UserRemoteConfig><url>$REPO_URL</url></hudson.plugins.git.UserRemoteConfig></userRemoteConfigs>
      <branches><hudson.plugins.git.BranchSpec><name>*/main</name></hudson.plugins.git.BranchSpec></branches>
    </scm>
    <scriptPath>$script</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <disabled>false</disabled>
</flow-definition>
XML
}

POLL='<org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty><triggers><hudson.triggers.SCMTrigger><spec>H/5 * * * *</spec><ignorePostCommitHooks>false</ignorePostCommitHooks></hudson.triggers.SCMTrigger></triggers></org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>'
create_job shopease-cicd jenkins/Jenkinsfile.cicd "$POLL" "Project 7: CI/CD to Kubernetes"
create_job shopease-blue-green jenkins/Jenkinsfile.bluegreen "" "Project 8: Blue-green deployment"
create_job medicare-devsecops jenkins/Jenkinsfile.devsecops "" "Project 9: DevSecOps for healthcare"

chown -R jenkins:jenkins "$JENKINS_HOME"
systemctl daemon-reload
systemctl enable --now jenkins
