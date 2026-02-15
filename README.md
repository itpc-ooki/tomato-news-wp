
# Tomato News – Static WordPress Infrastructure

## Project Summary

Tomato News is a **Static WordPress Website** powered by Docker and Amazon S3.

WordPress is used only as a content management system.  
The public website is served from static HTML/JS/CSS files on S3.

---

## Tech Stack

| Component | Technology |
|---------|-----------|
| CMS | WordPress |
| Static Builder | Custom Docker Container |
| Database | MySQL |
| Hosting | Amazon S3 |
| Containerization | Docker Compose |

---

## Directory Structure

```

static-src/   → Source templates
static/       → Generated output
wp-content/   → WordPress assets
docker/       → Docker configs

```

---

## Static Build Flow

```

Admin Save → Queue → Static Builder → /static → S3

```

No cron is used.

---

## Environment Variables

```

BUILD_INTERVAL_SECONDS=30
STATIC_OUTPUT_DIR=/var/www/static
AWS_REGION=ap-northeast-1
S3_BUCKET=tomatonews-static-stg
TOMATO_STATIC_S3_TARGET=s3://tomatonews-static-stg/static

```

---

## Docker Usage

### Start
```

docker compose up -d

```

### Rebuild
```

docker compose up -d --force-recreate

```

### Check Status
```

docker compose ps

```

---

## S3 Structure

```

/static
/account
/common
/components
/tomato
/leek
/strawberry
/wp-content

```

Root bucket contains only:
```

/static

```

---

## Public Site URL

```

[http://tomatonews-static-stg.s3-website-ap-northeast-1.amazonaws.com/static/tomato/index.html](http://tomatonews-static-stg.s3-website-ap-northeast-1.amazonaws.com/static/tomato/index.html)

```

---

## Development vs Staging

| Environment | Purpose |
|-----------|--------|
| Local | Template editing |
| Staging | Static build verification |

---

## Do NOT Use

- Cron
- Manual wp build commands
- S3 root uploads
- S3_PREFIX

---

## Recommended Future Steps

- CloudFront CDN
- HTTPS
- Cache headers
- CI/CD pipeline

---

## Current Status

✔ Static Builder Running  
✔ S3 Sync OK  
✔ Public Site Working  
✔ Cron Removed  


