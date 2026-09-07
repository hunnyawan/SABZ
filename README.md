# SABZ — Smart Agriculture Platform

SABZ is a full-stack agriculture management platform designed for Pakistani farmers. It provides farm management, weather intelligence, AI-powered disease detection, crop monitoring, financial ledger, marketplace, and more — all with full Urdu/English bilingual support.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | .NET 10, ASP.NET Core, Entity Framework Core, SQL Server |
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Vite 8 |
| **AI / ML** | Qwen VL (disease detection), Qwen Plus (agronomist chat), Gemini Vision |
| **APIs** | Open-Meteo (weather), AgroMonitoring (NDVI satellite) |

## Project Structure

```
├── src/
│   ├── SABZ.API/            # ASP.NET Core Web API
│   ├── SABZ.Application/    # DTOs, services, interfaces
│   ├── SABZ.Domain/         # Entities, exceptions
│   └── SABZ.Infrastructure/ # EF Core, repositories, seed data
├── SABZ-Frontend/           # React + TypeScript SPA
│   ├── src/
│   │   ├── api/             # API client modules
│   │   ├── components/      # Shared UI components
│   │   ├── lib/             # i18n, utilities
│   │   ├── pages/           # Page components
│   │   └── types/           # TypeScript type definitions
│   └── ...
└── docs/                    # Architecture & feature documentation
```

## Features

- **Authentication** — JWT-based registration & login
- **Farm Management** — Multi-farm CRUD with Pakistan admin divisions (Province/District/Tehsil)
- **Weather Intelligence** — Forecast, alerts, farm-location weather
- **Crop Suitability** — AI-powered crop recommendation based on soil & weather
- **Disease Detection** — Photo-based AI crop disease identification
- **Crop Monitoring** — Scheduled checks with reminders
- **Notifications** — In-app notification system
- **Financial Ledger** — Income/expense tracking with P&L
- **Financial Health** — Analytics & record completeness scoring
- **Marketplace** — Buy/sell listings for farming equipment & inputs
- **Kisan Network** — Community posts & discussions
- **Input Calculator** — Fertilizer, seed, pesticide dosage calculation
- **Crop Price Intelligence** — Mandi rate tracking across Pakistan
- **Bilingual UI** — Full English ↔ Urdu translation with RTL support

## Getting Started

### Prerequisites

- .NET 10 SDK
- Node.js 20+
- SQL Server (LocalDB or full instance)

### Backend

```bash
# Copy and configure app settings
cp src/SABZ.API/appsettings.template.json src/SABZ.API/appsettings.json
# Edit appsettings.json: set your connection string, JWT key, and API keys

# Run database migrations
dotnet ef database update --project src/SABZ.Infrastructure --startup-project src/SABZ.API

# Start the API
dotnet run --project src/SABZ.API --urls "http://localhost:5073"
```

### Frontend

```bash
cd SABZ-Frontend
npm install
npm run dev
```

The frontend dev server starts at `http://localhost:5173`.

## Configuration

Copy `src/SABZ.API/appsettings.template.json` to `appsettings.json` and configure:

| Setting | Description |
|---------|-------------|
| `ConnectionStrings:DefaultConnection` | SQL Server connection string |
| `Jwt:Key` | Random secret (≥32 characters) for JWT signing |
| `DiseaseDetection:ApiKey` | AI provider API key for disease detection |
| `VITE_AGROMONITORING_API_KEY` | (Frontend .env) AgroMonitoring API key for satellite NDVI |

## Documentation

See [docs/](docs/) for detailed architecture and feature documentation.
