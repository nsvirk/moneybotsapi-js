# MoneyBots API

A high-performance trading API built with Bun, Hono, and SQLite for Zerodha Kite integration.

## 🚀 Production

**Live API:** `https://api.moneybots.app`

## ✨ Features

- **Instruments Management**: Query and refresh Zerodha Kite instruments data
- **User Authentication**: Register, login, and session management
- **TOTP Generation**: Two-factor authentication support
- **OMS & API Sessions**: Supports both OMS and API-based Kite sessions
- **Auto-refresh**: Automatic data refresh based on market hours (8:30 AM IST)
- **In-memory SQLite**: Fast, efficient data storage

## 📋 API Endpoints

### Instruments
- `GET /instruments/query` - Query instruments with filters
- `POST /instruments/refresh` - Refresh instruments data from Kite

### User
- `POST /user/register` - Register new user
- `POST /user/login` - User login
- `POST /user/totp` - Generate TOTP value
- `DELETE /user/logout` - User logout

### Health
- `GET /health` - API health check with system metrics

## 🛠️ Development

### Prerequisites
- [Bun](https://bun.sh) runtime

### Install dependencies
```bash
bun install
```

### Run locally
```bash
bun run index.ts
```

The API will be available at `http://localhost:3000`

## 🚢 Deployment

Deploy to AWS EC2 with automatic GitHub Actions deployment.

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete deployment guide.

## 📖 Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: SQLite (in-memory)
- **Reverse Proxy**: Caddy (automatic HTTPS)
- **CI/CD**: GitHub Actions
- **Hosting**: AWS EC2 (Amazon Linux 2023)

## 📝 License

Private project
