FROM node:20-alpine
WORKDIR /app
COPY demo/light-login-server/server.mjs ./server.mjs
ENV PORT=3000
ENV LS_NAME=ls
EXPOSE 3000
CMD ["node", "server.mjs"]
