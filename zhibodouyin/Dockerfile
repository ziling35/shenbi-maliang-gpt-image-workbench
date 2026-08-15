FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production
EXPOSE 8790
CMD ["node", "server.js"]
