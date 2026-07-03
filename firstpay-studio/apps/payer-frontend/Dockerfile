# Page payeur publique — app statique (aucun build), servie par nginx.
FROM nginx:1.27-alpine
COPY apps/payer-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/payer-frontend/index.html apps/payer-frontend/app.js apps/payer-frontend/gsap.min.js /usr/share/nginx/html/
EXPOSE 80
