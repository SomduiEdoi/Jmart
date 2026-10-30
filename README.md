# J-Mart POS

J-Mart is an employee welfare POS for staff credit purchases. This production version uses:

- Frontend: static HTML/CSS/JavaScript in `public/`
- Backend: Node.js + Express in `server/`
- Database: SQLite file
- Deployment: Docker Compose
- Reverse proxy: Nginx on Ubuntu 22.04

Default accounts after first database seed:

| Role | User | Password / PIN |
| --- | --- | --- |
| Admin | Admin | `admin123` |
| Member | Somchai | `1111` |
| Member | Suda | `2222` |
| Member | Narin | `3333` |

Change these passwords immediately after first login.

## Local Docker Run

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

```text
http://127.0.0.1:3000
```

Data is stored in:

```text
./data/jmart.sqlite
```

## Production Install

See [docs/UBUNTU_22_04_INSTALL.md](docs/UBUNTU_22_04_INSTALL.md).
