# Tomato News – Static WordPress Infrastructure

## Project Summary

Tomato News is a **Static WordPress Website** powered by Docker and AWS.

WordPress is used only as a CMS.
The public website is served from static HTML/JS/CSS files stored on Amazon S3 and delivered via CloudFront.

The system uses a **queue-based static build architecture** to prevent unnecessary rebuilds and CloudFront invalidation loops.

---

# Architecture Overview

WordPress (EC2, Docker)
    ↓
auto-static-build-queue.php
    ↓
Queue (WordPress option)
    ↓
static_builder container (30-sec loop)
    ↓
Generate /static
    ↓
S3 Sync (if ENABLE_S3_SYNC=1)
    ↓
CloudFront Invalidation (if ENABLE_CLOUDFRONT_INVALIDATION=1)
    ↓
Public Site

---

# Tech Stack

| Component | Technology |
|-----------|------------|
| CMS | WordPress |
| Static Builder | Custom Docker container loop |
| Database | MySQL |
| Hosting | Amazon S3 |
| CDN | CloudFront |
| DNS | Route53 |
| Containerization | Docker Compose |
| Infrastructure | AWS EC2 |

---

# Directory Structure

```

static-src/      → Source templates
static/          → Generated output
wp-content/      → WordPress core assets
docker-compose.yml
.env.stg

```

---

# Static Build Flow (Queue-Based)

Admin Save / Update / Trash
    ↓
Queue is updated
    ↓
Builder checks every 30 seconds
    ↓
If queue empty → SKIP
If queue has items → BUILD
    ↓
Update /static
    ↓
S3 sync
    ↓
CloudFront invalidation
    ↓
Queue cleared

No cron is used.

---

# Important Environment Variables

```

BUILD_INTERVAL_SECONDS=30
STATIC_OUTPUT_DIR=/var/www/html/static

ENABLE_S3_SYNC=1
ENABLE_CLOUDFRONT_INVALIDATION=1

AWS_REGION=ap-northeast-1
S3_BUCKET=tomatonews-static-stg
TOMATO_STATIC_S3_TARGET=s3://tomatonews-static-stg/static

CLOUDFRONT_DISTRIBUTION_ID=E2MX9QJVMTMZMM
CLOUDFRONT_INVALIDATION_PATHS=/static/*

```

---

# Docker Usage

## Start Containers

```

docker compose --env-file .env.stg up -d

```

## Restart Containers

```

docker compose --env-file .env.stg down
docker compose --env-file .env.stg up -d

```

## Check Status

```

docker compose ps

```

## Check Builder Logs

```

docker compose logs -f static_builder

```

Expected message when idle:

```

Skip: empty queue

```

---

# S3 Structure

Bucket: tomatonews-static-stg

```

/static
/tomato
/leek
/strawberry

```

Only `/static` is uploaded.
Root bucket is not used for website files.

---

# Public URLs

S3 Website:
http://tomatonews-static-stg.s3-website-ap-northeast-1.amazonaws.com/static/tomato/index.html

CloudFront:
https://stg-tomato.agrinews.jp/

---

# Development vs Staging

| Environment | Purpose |
|------------|----------|
| Local | Template development |
| Staging | Static build verification |
| Production | Public release (planned separation) |

---

# What NOT To Do

- Do NOT use cron
- Do NOT manually run wp static-build in production
- Do NOT upload files directly to S3 root
- Do NOT enable S3_PREFIX
- Do NOT disable queue system

---

# Current Status (2026)

✔ Queue-based build working  
✔ No automatic invalidation loop  
✔ S3 sync stable  
✔ CloudFront invalidation triggered only on content change  
✔ Route53 + SSL working  
✔ Staging fully operational  

Production separation pending.

