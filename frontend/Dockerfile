FROM nginx:alpine
COPY public/ /usr/share/nginx/html/
# Custom nginx config that proxies API calls to the backend gateway
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80








