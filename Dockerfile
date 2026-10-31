FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server.js ./
COPY server ./server
COPY static ./static
COPY tailwind.config.cjs ./
RUN npm run build && mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8000
CMD ["npm", "start"]
