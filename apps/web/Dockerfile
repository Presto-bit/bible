# Bible Web (Next.js) — 生产镜像（构建上下文为仓库根目录）
ARG NODE_BASE_IMAGE=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:20-alpine

FROM ${NODE_BASE_IMAGE} AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM ${NODE_BASE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/ ./
ARG NEXT_PUBLIC_API_BASE=https://2sc.prestoai.cn
ARG NEXT_PUBLIC_APP_VERSION=dev
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# standalone 镜像必须包含 .next/static，否则页面无样式
RUN test -n "$(ls -1 .next/static/css/*.css 2>/dev/null | head -1)"

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
