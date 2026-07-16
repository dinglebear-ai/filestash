pipeline {
    agent any
    options {
        buildDiscarder(logRotator(numToKeepStr: "10", artifactNumToKeepStr: "5"))
        disableConcurrentBuilds(abortPrevious: true)
        timestamps()
    }
    environment {
        REVISION = ""
    }
    stages {
        stage("Checkout submitted revision") {
            steps {
                checkout scm
                script {
                    env.REVISION = sh(returnStdout: true, script: "git rev-parse HEAD").trim()
                    if (env.GIT_COMMIT && env.GIT_COMMIT != env.REVISION) {
                        error("Jenkins checked out ${env.REVISION}, expected ${env.GIT_COMMIT}")
                    }
                }
                sh "git status --short"
            }
        }
        stage("Frontend and embedded asset gate") {
            steps {
                script {
                    docker.image("node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d").inside("--user=root") {
                        sh "npm ci --prefix web --no-audit --no-fund"
                        sh "npm run lint --prefix web"
                        sh "npm run typecheck --if-present --prefix web"
                        sh "npm run test:coverage --prefix web"
                        sh "npm audit --prefix web --omit=dev --audit-level=high"
                        sh "npm run build --prefix web"
                        sh "node web/scripts/build-embed.mjs --apply --skip-build"
                        sh "./scripts/check-web-assets.sh"
                        sh "git diff --exit-code -- public/"
                    }
                }
            }
        }
        stage("Browser workflows") {
            steps {
                script {
                    docker.image("mcr.microsoft.com/playwright:v1.55.0-noble@sha256:b27e719ecbfef153e13fd24e8341736733bf2658b229677eb21ff57ff5d7fb29").inside("--user=root") {
                        sh "npm ci --prefix web --no-audit --no-fund"
                        sh "npm run test:e2e --prefix web"
                    }
                }
            }
        }
        stage("Backend, plugins, race, and vulnerability gates") {
            steps {
                sh '''
                    docker build \
                      --file docker/Dockerfile \
                      --target test_backend \
                      --build-arg BUILD_REF=${REVISION} \
                      --tag filestash-test:${REVISION} \
                      .
                '''
            }
        }
        stage("Revision image") {
            steps {
                sh '''
                    docker build \
                      --file docker/Dockerfile \
                      --build-arg BUILD_REF=${REVISION} \
                      --label org.opencontainers.image.revision=${REVISION} \
                      --tag filestash:${REVISION} \
                      .
                '''
            }
        }
        stage("Publish immutable tag") {
            when { buildingTag() }
            steps {
                sh '''
                    docker buildx build \
                      --file docker/Dockerfile \
                      --platform linux/amd64,linux/arm64 \
                      --build-arg BUILD_REF=${REVISION} \
                      --provenance=mode=max \
                      --sbom=true \
                      --tag machines/filestash:${TAG_NAME}-${REVISION} \
                      --push \
                      .
                '''
            }
        }
    }
    post {
        always {
            cleanWs()
        }
    }
}
