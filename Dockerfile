# Build stage: compile TypeScript and pack the npm tarball
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
RUN npm run build && npm pack

# Runtime stage: install the packed CLI globally.
# No ENTRYPOINT on purpose, so the image works as a GitLab CI job image (`script:` runs in sh).
FROM node:20-alpine
COPY --from=build /src/*.tgz /tmp/
RUN npm install -g /tmp/*.tgz --no-audit --no-fund && rm /tmp/*.tgz && npm cache clean --force
CMD ["ai-code-review-gitlab-plugin", "--help"]
