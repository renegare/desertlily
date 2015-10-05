FROM alpine

RUN apk add --update nginx && rm -rf /var/cache/apk/*
RUN mkdir -p /tmp/nginx/client-body

COPY env/nginx.conf /etc/nginx/nginx.conf
COPY env/sites.conf /etc/nginx/conf.d/default.conf

ADD public /app

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
