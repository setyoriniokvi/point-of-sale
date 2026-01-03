# All-in-one Backend Dockerfile (Node services + MongoDB + Recommendation)
FROM node:20-slim

# Install system packages: python3, pip and supervisor
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv supervisor wget ca-certificates gnupg \
  && rm -rf /var/lib/apt/lists/*


WORKDIR /usr/src/app

# Copy entire repo (we need service folders + recommendation-service)
COPY . .

# Install Node dependencies for each service
RUN cd backend/services/product-service && npm install \
  && cd ../transaction-service && npm install \
  && cd ../auth-service && npm install \
  && cd ../dashboard-service && npm install

# Create virtualenv and install Python requirements for recommendation service
RUN python3 -m venv /opt/reco-venv \
  && /opt/reco-venv/bin/pip install --upgrade pip setuptools wheel \
  && /opt/reco-venv/bin/pip install --no-cache-dir -r recommendation-service/requirements.txt

# Create MongoDB data dir
RUN mkdir -p /data/db && chown -R root:root /data/db

# Supervisor config
COPY backend/supervisord.conf /etc/supervisor/conf.d/services.conf

# Default envs (overrideable in docker-compose)
ENV MONGO_URI=mongodb://mongodb:27017/posdb
ENV PRODUCT_SERVICE_URL=http://localhost:3001
ENV TRANSACTION_SERVICE_URL=http://localhost:3002
ENV RECOMMENDATION_SERVICE_URL=http://localhost:5000
ENV AUTH_SERVICE_URL=http://localhost:3003
ENV DASHBOARD_SERVICE_URL=http://localhost:3004
ENV JWT_SECRET=IAE-Tubes-Secret-Key

EXPOSE 3000 3001 3002 3003 3004 5000

# Start supervisord in foreground
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
