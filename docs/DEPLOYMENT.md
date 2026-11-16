# Deployment guide

This describes one straightforward way to run Rental_Control in production. It has **not** been deployed or load-tested as part of this work.

## Components

1. **PostgreSQL 14+** database.
2. **Backend** — Django served by a WSGI server (e.g. Gunicorn on Linux), behind HTTPS.
3. **Frontend** — static files from `frontend/dist`, served by the same web server (Nginx, Caddy…) or a CDN.
4. **File storage** — local disk with backups, or S3-compatible storage (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO).
5. **Email** — any SMTP provider, for invitations and password resets (the app still works without it: landlords can copy invitation links and send them by SMS/WhatsApp; password reset needs email).

Serve the web app and the API from **the same domain** (e.g. `https://app.example.rw` for the site and `https://app.example.rw/api/` for the API). Session cookies and CSRF then work without cross-site configuration.

## Steps

```bash
# Backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt gunicorn
pip install "django-storages[s3]"          # only if STORAGE_BACKEND=s3
cp ../.env.example .env                    # fill in, see checklist below
python manage.py migrate
python manage.py collectstatic --noinput   # for the /admin pages
python manage.py createsuperuser           # an administrator account
python manage.py check --deploy
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3

# Frontend
cd frontend
npm ci
npm run build                              # output in frontend/dist
```

Example Nginx routing:

```nginx
server {
    server_name app.example.rw;
    # TLS configuration omitted
    client_max_body_size 10m;              # slightly above MAX_UPLOAD_MB

    root /srv/rental_control/frontend/dist;
    location / { try_files $uri /index.html; }

    location ~ ^/(api|media|admin)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /static/ { alias /srv/rental_control/backend/staticfiles/; }
}
```

Do **not** serve `/media/` directly from disk: it must go through Django so that each photo is checked against the viewer's permissions.

## Environment checklist

- [ ] `DJANGO_DEBUG=false`
- [ ] `DJANGO_SECRET_KEY` — long random value, kept secret
- [ ] `DJANGO_ALLOWED_HOSTS=app.example.rw`
- [ ] `DJANGO_CSRF_TRUSTED_ORIGINS=https://app.example.rw`
- [ ] `FRONTEND_URL=https://app.example.rw`
- [ ] `DATABASE_URL=postgres://…` (not SQLite)
- [ ] `STORAGE_BACKEND` and S3 settings, or a backed-up `MEDIA_ROOT`
- [ ] `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` and SMTP settings
- [ ] `ALLOW_DEMO_SEED=false` (the default when debug is off) — never run `seed_demo` in production
- [ ] HTTPS everywhere; consider raising `SECURE_HSTS_SECONDS` once HTTPS is confirmed
- [ ] Database and media backups scheduled and restore-tested
- [ ] Support phone/email texts in `common:help.contactPhone` / `contactEmail` (all three languages)
- [ ] Kinyarwanda reviewed by a native speaker (see TRANSLATIONS.md)

## Operations

- Rate limits use Django's cache. The default in-memory cache is per process; with several workers, configure a shared cache (e.g. Redis via `CACHES`) so limits apply across workers.
- Logs go to standard output (`LOG_LEVEL`).
- The audit log is in the `core_auditlog` table and visible read-only at `/admin/`.
