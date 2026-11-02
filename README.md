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

## Purchase Cost and Sales Profit

- A purchase item records the entered line total in whole satang. The average unit cost (`line total / quantity`) is displayed with two decimal places, while the original line total remains authoritative. Excel exports retain the unrounded average as the numeric cell value and display two decimals; accounting totals should use Line Total or Line Cost.
- New products start with zero stock. Receive stock and record its cost through Purchases. The legacy `products.cost` database field remains for existing inventory history but is not shown or edited in Products.
- Sales consume inventory lots in FIFO order. Any remaining satang is assigned to the last units sold from that lot, so the lot's allocated costs add up to its original purchase amount.
- The sale price remains the value configured in Products. Saving a purchase does not change it. A sale's gross profit is its sale amount minus the FIFO cost of the units actually sold.
- Stock already on hand is sold from its older lots before a new purchase lot. Existing sales keep their recorded prices, costs, and profits.
- The Admin's Expired Stock page removes expired units through FIFO and records a Sales Report document under Admin with zero revenue, the consumed cost, and an equal negative gross profit. Cancelling that document restores stock and FIFO cost.

## Production Install

See [docs/UBUNTU_22_04_INSTALL.md](docs/UBUNTU_22_04_INSTALL.md).
