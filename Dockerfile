FROM node:8.11-slim

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json .
RUN npm install
COPY ./ .
EXPOSE 8000

CMD ["npm","start"]