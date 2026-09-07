# SABZ — Smart Agriculture Platform
## Complete Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Database Design](#4-database-design)
5. [Backend API Reference](#5-backend-api-reference)
6. [Frontend Application](#6-frontend-application)
7. [AI & External Integrations](#7-ai--external-integrations)
8. [Security](#8-security)
9. [Internationalization (i18n)](#9-internationalization-i18n)
10. [Deployment & Setup](#10-deployment--setup)
11. [Database Migrations History](#11-database-migrations-history)
12. [Project Structure](#12-project-structure)

---

## 1. Project Overview

**SABZ** (سبز — meaning "Green" in Urdu) is a full-stack smart agriculture management platform designed specifically for Pakistani farmers. It provides a comprehensive suite of tools for farm management, crop tracking, AI-powered disease detection, weather intelligence, financial management, community engagement, and marketplace functionality — all with full bilingual support (English ↔ Urdu) including RTL layout.

### Key Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Authentication** | JWT-based registration & login with email or phone number |
| 2 | **Farm Management** | Multi-farm CRUD with Pakistan's 3-tier admin hierarchy (Province → District → Tehsil) |
| 3 | **Crop Management** | Track crops per farm with season, planting/harvest dates, growth stages |
| 4 | **Weather Intelligence** | Real-time weather, 7-day forecast, and rule-based action alerts via Open-Meteo |
| 5 | **Crop Suitability** | AI-powered crop recommendation based on soil type, location, and season |
| 6 | **Disease Detection** | Photo-based AI crop disease identification using Qwen VL vision model |
| 7 | **Plant Detector** | General plant identification via AI vision |
| 8 | **Crop Monitoring** | Automated scheduled monitoring checks with reminders and completion tracking |
| 9 | **Notifications** | In-app notification center with read/unread management |
| 10 | **Financial Ledger** | Income/expense tracking with 13 categories and P&L computation |
| 11 | **Financial Health** | Read-only analytics, category breakdown, and record completeness scoring |
| 12 | **Farm Performance** | Decision intelligence from crops + ledger + monitoring data |
| 13 | **Farm Dashboard** | Unified per-farm dashboard aggregating all features |
| 14 | **AI Agronomist** | Voice/text AI farming assistant with farm context (Qwen Plus) |
| 15 | **Kisan Network** | Community posts, comments, and likes for farmer discussions |
| 16 | **Marketplace** | Farmer-to-farmer equipment listing (sale/rent) with private inbox |
| 17 | **Input Calculator** | Precision fertilizer, seed, and pesticide dosage calculation |
| 18 | **Crop Price Intelligence** | Mandi rate tracking across Pakistan markets |
| 19 | **Satellite Crop Health** | NDVI vegetation analysis via AgroMonitoring satellite imagery |
| 20 | **Bilingual UI** | Full English ↔ Urdu translation with RTL layout support |

---

## 2. System Architecture

### Clean Architecture (Backend)

```
┌─────────────────────────────────────────────────────────────┐
│                      SABZ.API (Presentation)                 │
│  Controllers │ Middleware │ Swagger │ JWT Auth │ Program.cs  │
├─────────────────────────────────────────────────────────────┤
│                   SABZ.Application (Business Logic)           │
│  Services (21) │ Interfaces (55) │ DTOs (18 folders)         │
├─────────────────────────────────────────────────────────────┤
│                    SABZ.Domain (Core Domain)                  │
│  Entities (25) │ Exceptions (9) │ Domain Rules               │
├─────────────────────────────────────────────────────────────┤
│                  SABZ.Infrastructure (Data & External)        │
│  Repositories (16) │ EF Core │ Migrations (15) │ Seed Data   │
│  External Providers (Weather, AI Vision, Speech-to-Text)     │
└─────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
SABZ-Frontend/
├── src/
│   ├── api/          → 17 API client modules (Axios-based)
│   ├── components/   → Shared UI (chat, crops, dashboard, forms, layout, ui, weather)
│   ├── hooks/        → useApi, useAuth
│   ├── lib/          → i18n (1900+ lines), utils, farmTranslations, AI helpers
│   ├── pages/        → 25 page components across 14 feature folders
│   └── types/        → 875 lines of TypeScript type definitions
└── public/           → Static assets (favicon, icons)
```

---

## 3. Technology Stack

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| .NET | 10.0 | Runtime framework |
| ASP.NET Core | 10.0.11 | Web API, JWT Bearer auth |
| Entity Framework Core | 10.0.11 | ORM, migrations, SQL Server |
| Swashbuckle (Swagger) | 10.2.3 | API documentation |
| SQL Server | — | Primary database |
| BCrypt.Net-Next | — | Password hashing |
| System.IdentityModel.Tokens.Jwt | — | JWT token generation |
| SixLabors.ImageSharp | — | Image validation for disease detection |
| Microsoft.Extensions.Caching.Memory | — | Weather data caching |

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.2.8 | UI framework |
| TypeScript | 6.0.2 | Type safety |
| Vite | 8.2.2 | Build tool & dev server |
| Tailwind CSS | 4.3.3 | Utility-first styling |
| React Router | 7.18.3 | Client-side routing |
| Axios | 1.20.0 | HTTP client |
| Leaflet | 1.9.4 | Map rendering (NDVI) |
| Leaflet Draw | 1.0.4 | Map drawing tools |
| Leaflet GeoSearch | 4.4.0 | Map search |
| Lucide React | 1.38.0 | Icon library |
| Motion | 13.1.1 | Animations |
| clsx + tailwind-merge | — | Conditional classnames |

---

## 4. Database Design

### Entity-Relationship Overview

**25 Domain Entities** organized across these areas:

#### Authentication & Users
| Entity | Key Fields |
|--------|-----------|
| **User** | Id (Guid), FullName, Email (unique), PhoneNumber (unique), PasswordHash, PreferredLanguage ("English"/"Urdu"), Role ("Farmer"), CreatedAt |

#### Location Hierarchy (Pakistan)
| Entity | Key Fields |
|--------|-----------|
| **Province** | Id (int), Name, NameUrdu |
| **District** | Id (int), ProvinceId (FK), Name, NameUrdu |
| **Tehsil** | Id (int), DistrictId (FK), Name, NameUrdu, Latitude, Longitude |

#### Farm & Crops
| Entity | Key Fields |
|--------|-----------|
| **Farm** | Id (Guid), UserId (FK), FarmName, ProvinceId, DistrictId, TehsilId, Latitude, Longitude, FarmSize (decimal 18,4), FarmSizeUnit, SoilType, IrrigationType, CreatedAt, UpdatedAt |
| **Crop** | Id (Guid), FarmId (FK), CropCatalogId (FK), CropName, Season, PlantingDate, HarvestDate, GrowthStage, PreviousCrop, Status ("Active"), CreatedAt, UpdatedAt |
| **CropCatalog** | Id (int), Name, ScientificName, Category, Description |
| **CropRequirement** | Id (int), CropCatalogId (FK), Season ("Rabi"/"Kharif"), GrowingDurationDays, MinTempC, MaxTempC, WaterRequirement ("Low"/"Medium"/"High"), SuitableSoils, Source |
| **RegionalCropSuitability** | Id (int), ProvinceId, DistrictId, TehsilId, CropCatalogId, Season, SuitabilityScore (int), SuitabilityLevel, Notes, Source |
| **CropChangeRule** | Id (int), PreviousCategory, NextCategory, Effect ("Positive"/"Caution"/"Negative"), Explanation, IsActive, Source |

#### Disease & Monitoring
| Entity | Key Fields |
|--------|-----------|
| **DiseaseInformation** | Id (int), DiseaseName, CropCatalogId, Description, Symptoms, RecommendedActions, Prevention, Monitoring, Source, IsActive |
| **CropMonitoringRule** | Id (int), CropCatalogId, DayOffsetAfterPlanting, Title, Description, InspectionItems, Priority ("Low"/"Medium"/"High"), TriggerType, IsActive, Source |
| **CropMonitoringCheck** | Id (Guid), CropId (FK), RuleId (FK), FarmId, ScheduledDate, Status (Scheduled/Completed/Skipped), Title, Description, InspectionItems, Priority, Observation (Normal/SomethingSuspicious), FarmerNotes, CompletedAt, SkippedAt, CreatedAt |

#### Notifications
| Entity | Key Fields |
|--------|-----------|
| **Notification** | Id (Guid), UserId (FK), Title, Message, Category, ReferenceType, ReferenceId, IsRead, CreatedAt, ReadAt |

#### Financial
| Entity | Key Fields |
|--------|-----------|
| **FinancialTransaction** | Id (Guid), FarmId (FK), CropId (FK, nullable), TransactionType (Income=1/Expense=2), Category, Amount (decimal 18,2), TransactionDate, Notes, CreatedAt, UpdatedAt |

#### Community
| Entity | Key Fields |
|--------|-----------|
| **CommunityPost** | Id (Guid), UserId (FK), Content, ImageUrl, CreatedAt, UpdatedAt, IsDeleted |
| **CommunityComment** | Id (Guid), PostId (FK), UserId (FK), Content, CreatedAt, UpdatedAt, IsDeleted |
| **CommunityPostLike** | Id (Guid), PostId (FK), UserId (FK), CreatedAt — unique per PostId+UserId |

#### Marketplace
| Entity | Key Fields |
|--------|-----------|
| **MarketplaceListing** | Id (Guid), UserId (FK), Title, Category, ListingType (Sale/Rent), Description, Price (decimal 18,2), PriceUnit (Total/Day/Hour/Week/Month), Location, ContactNumber, Condition (New/Used), Availability, ImageUrl, CreatedAt, UpdatedAt, IsDeleted, DeletedAt |
| **MarketplaceConversation** | Id (Guid), ListingId (FK, nullable), BuyerUserId (FK), SellerUserId (FK), CreatedAt, UpdatedAt, IsDeleted |
| **MarketplaceMessage** | Id (Guid), ConversationId (FK), SenderUserId (FK), Content, CreatedAt, IsDeleted |

#### Supporting Entities
| Entity | Purpose |
|--------|---------|
| **InputCalculatorValues** | Static constants for area units, dosage bases, quantity units, categories |
| **MarketplaceValues** | Static constants for listing types, conditions, price units |
| **NotificationCategories** | Constants: MonitoringDue, MonitoringPlan, MonitoringUpcoming, MonitoringCompleted, MonitoringSkipped, System |
| **TransactionCategories** | 10 expense + 3 income categories with validation |

### Database Configuration

- **Decimal Precision**: FarmSize (18,4), Latitude/Longitude (18,10), Amount (18,2)
- **Enum Storage**: All enums stored as strings (not integers)
- **Soft Deletes**: CommunityPost, CommunityComment, MarketplaceListing, MarketplaceConversation, MarketplaceMessage use `IsDeleted` flag
- **Unique Indexes**: User Email/PhoneNumber (filtered), CropMonitoringCheck (CropId+RuleId), Notification (UserId+Category+ReferenceType+ReferenceId), CommunityPostLike (PostId+UserId), MarketplaceConversation (ListingId+BuyerUserId+SellerUserId)
- **Seed Data**: Complete Pakistan administrative hierarchy (7 provinces, ~150 districts, ~800+ tehsils) with Urdu names

---

## 5. Backend API Reference

### 19 Controllers | ~60 Endpoints

#### Authentication (`/api/auth`) — No auth required
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user (name, email/phone, password, language) |
| POST | `/api/auth/login` | Login with email/phone + password, returns JWT |
| GET | `/api/auth/me` | Get current user profile (authorized) |

#### Locations (`/api/locations`) — No auth required
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/locations/provinces` | Get all provinces |
| GET | `/api/locations/districts/{provinceId}` | Get districts by province |
| GET | `/api/locations/tehsils/{districtId}` | Get tehsils by district |

#### Farms (`/api/farms`) — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/farms` | Create a new farm |
| GET | `/api/farms` | Get all farms for current user |
| GET | `/api/farms/{id}` | Get farm by ID |
| PUT | `/api/farms/{id}` | Update farm details |
| DELETE | `/api/farms/{id}` | Delete a farm |

#### Crops — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/farms/{farmId}/crops` | Add a crop to a farm |
| GET | `/api/farms/{farmId}/crops` | Get all crops for a farm |
| GET | `/api/crops/{id}` | Get crop by ID |
| PUT | `/api/crops/{id}` | Update crop details |
| DELETE | `/api/crops/{id}` | Delete a crop |

#### Weather (`/api/farms/{farmId}/weather`) — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/farms/{farmId}/weather/current` | Current weather for farm location |
| GET | `/api/farms/{farmId}/weather/forecast` | 7-day weather forecast |
| GET | `/api/farms/{farmId}/weather/alerts` | Weather action alerts |
| GET | `/api/farms/{farmId}/weather/reverse-geocode` | Reverse geocode coordinates |
| GET | `/api/weather/preview?tehsilId=` | Weather preview by tehsil (for onboarding) |

#### Disease Detection (`/api/farms/{farmId}/disease-detection`) — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/farms/{farmId}/disease-detection` | Upload image for AI disease analysis (multipart form, max 10MB) |

#### Crop Monitoring — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/crops/{cropId}/monitoring/checks` | Get all monitoring checks for a crop |
| POST | `/api/crops/{cropId}/monitoring/generate` | Generate monitoring schedule |
| GET | `/api/monitoring/due` | Get due checks across all farms |
| GET | `/api/monitoring/upcoming` | Get upcoming scheduled checks |
| POST | `/api/monitoring/checks/{checkId}/complete` | Complete a monitoring check |
| POST | `/api/monitoring/checks/{checkId}/skip` | Skip a monitoring check |

#### Notifications — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get all notifications (paged) |
| GET | `/api/notifications/unread` | Get unread notifications |
| GET | `/api/notifications/unread-count` | Get unread count |
| PATCH | `/api/notifications/{id}/read` | Mark single notification as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/{id}` | Delete a notification |

#### Financial Transactions — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/farms/{farmId}/transactions` | Create a transaction |
| GET | `/api/farms/{farmId}/transactions` | Get transactions (filterable by type, category, crop) |
| GET | `/api/farms/{farmId}/transactions/summary` | Get financial summary (income, expense, net) |
| GET | `/api/transactions/{id}` | Get transaction by ID |
| PUT | `/api/transactions/{id}` | Update a transaction |
| DELETE | `/api/transactions/{id}` | Delete a transaction |

#### Financial Health — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/farms/{farmId}/financial-health` | Overall financial health summary |
| GET | `/api/farms/{farmId}/financial-health/categories` | Category breakdown |
| GET | `/api/farms/{farmId}/financial-health/activity` | Financial activity timeline |
| GET | `/api/farms/{farmId}/financial-health/completeness` | Record completeness score |
| GET | `/api/farms/{farmId}/crops/{cropId}/financial-health` | Crop-level financial health |

#### Farm Performance — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/farms/{farmId}/performance` | Performance summary |
| GET | `/api/farms/{farmId}/performance/crops` | Per-crop performance breakdown |
| GET | `/api/farms/{farmId}/performance/activity` | Activity summary |

#### Farm Dashboard — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/farms/{farmId}/dashboard` | Unified farm dashboard (all sections) |

#### AI Agronomist (`/api/farms/{farmId}/agronomist`) — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/farms/{farmId}/agronomist/chat` | Text question to AI agronomist |
| POST | `/api/farms/{farmId}/agronomist/voice` | Voice/audio question (multipart, max 10MB) |

#### Community — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/community/posts` | Get community posts (paged, with filters) |
| POST | `/api/community/posts` | Create a new post |
| GET | `/api/community/posts/{id}` | Get post detail with comments |
| DELETE | `/api/community/posts/{id}` | Delete a post |
| GET | `/api/community/posts/{postId}/comments` | Get comments for a post |
| POST | `/api/community/posts/{postId}/comments` | Add a comment |
| DELETE | `/api/community/comments/{id}` | Delete a comment |
| POST | `/api/community/posts/{postId}/like` | Toggle like on a post |

#### Marketplace — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/listings` | Browse listings (paged, filterable) |
| POST | `/api/marketplace/listings` | Create a listing |
| GET | `/api/marketplace/listings/{id}` | Get listing detail |
| PUT | `/api/marketplace/listings/{id}` | Update a listing |
| DELETE | `/api/marketplace/listings/{id}` | Delete a listing |

#### Marketplace Inbox — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/inbox` | Get conversation list (paged) |
| GET | `/api/marketplace/inbox/{conversationId}` | Get conversation messages |
| POST | `/api/marketplace/inbox/contact` | Contact seller about a listing |
| POST | `/api/marketplace/inbox/{conversationId}/messages` | Send a message |
| POST | `/api/marketplace/inbox/conversations` | Create direct conversation |

#### Input Calculator — Authorized (crop knowledge is anonymous)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/input-calculator/calculate` | Calculate input requirements |
| POST | `/api/input-calculator/fertilizer` | Fertilizer-specific calculation |
| GET | `/api/input-calculator/crop-knowledge` | Get crop knowledge data (no auth) |

#### Crop Prices — Authorized
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/crop-prices` | Get crop prices (paged, filterable by crop/region) |
| GET | `/api/crop-prices/{cropName}` | Get price detail for a specific crop |

---

## 6. Frontend Application

### 25 Page Components

| Page | File | Lines | Description |
|------|------|-------|-------------|
| Login | `auth/LoginPage.tsx` | 131 | Email/phone + password login |
| Register | `auth/RegisterPage.tsx` | 221 | Registration with language preference |
| Dashboard | `dashboard/DashboardPage.tsx` | 332 | Farm overview, weather preview, Mandi ticker, daily tasks |
| Farms List | `farms/FarmsPage.tsx` | 115 | Grid of user's farms with quick actions |
| Farm Create | `farms/FarmCreatePage.tsx` | 44 | New farm form with location cascade |
| Farm Detail | `farms/FarmDetailPage.tsx` | 226 | Farm info, crops, weather, actions |
| Farm Edit | `farms/FarmEditPage.tsx` | 78 | Edit farm details |
| Crops List | `crops/CropsPage.tsx` | 178 | Crops for a farm |
| Crop Create | `crops/CropCreatePage.tsx` | 40 | New crop form |
| Crop Edit | `crops/CropEditPage.tsx` | 65 | Edit crop details |
| Crop Monitoring | `monitoring/MonitoringPage.tsx` | — | Due/upcoming/completed checks |
| Crop Health Map | `monitoring/CropHealthMap.tsx` | 629 | NDVI satellite map with Leaflet drawing |
| Disease Detection | `disease/DiseaseDetectionPage.tsx` | 1,255 | AI disease scan with webcam/upload |
| Plant Detector | `utilities/PlantDetectorPage.tsx` | 937 | General plant identification |
| Notifications | `notifications/NotificationsPage.tsx` | — | Notification center |
| Financial Ledger | `financial/FinancialLedgerPage.tsx` | 233 | Transaction list with filters |
| Transaction Form | `financial/TransactionFormPage.tsx` | 262 | Add/edit income or expense |
| Financial Health | `financial-health/CropFinancialHealthPage.tsx` | 100 | Crop-level financial analytics |
| Farm Dashboard | `farm-dashboard/FarmDashboardPage.tsx` | 287 | Unified per-farm dashboard |
| Agronomist | `agronomist/AgronomistPage.tsx` | 313 | Voice/text AI farming assistant |
| Kisan Network | `kisan/KisanNetworkPage.tsx` | 1,947 | Community feed + marketplace + inbox |
| Marketplace | `marketplace/MarketplaceListingPage.tsx` | 194 | Browse and view listings |
| Marketplace Form | `marketplace/MarketplaceFormPage.tsx` | 192 | Create/edit listing |
| Inbox/Conversation | `inbox/ConversationPage.tsx` | 348 | Private messaging thread |
| Input Calculator | `calculator/InputCalculatorPage.tsx` | 856 | Dosage calculator |
| Crop Prices | `crop-prices/CropPricesPage.tsx` | 548 | Mandi rate listing |
| Crop Price Detail | `crop-prices/CropPriceDetailPage.tsx` | 149 | Price history for a crop |

### Key Shared Components

| Component | Purpose |
|-----------|---------|
| `AppShell.tsx` | Main layout with 4-section sidebar navigation, language switcher, notification dropdown |
| `FarmCard.tsx` | Dashboard farm card with status badge, metrics, action buttons |
| `FarmListRow.tsx` | Compact farm list row for dashboard |
| `FarmForm.tsx` | Reusable farm create/edit form with cascading location selects |
| `DailyTaskChecklist.tsx` | Dashboard daily monitoring tasks |
| `LocalWeatherWidget.tsx` | Weather card for dashboard |
| `MandiRateWidget.tsx` | Mandi rates ticker |
| `FarmRiskWidget.tsx` | Pest risk indicator |
| `FloatingChatWidget.tsx` | AI agronomist floating chat |
| `CropStageProgress.tsx` | Visual crop growth stage indicator |

### Routing Structure

```
/                          → Dashboard
/login                     → Login
/register                  → Register
/farms                     → Farms List
/farms/new                 → Create Farm
/farms/:id                 → Farm Detail
/farms/:id/edit            → Edit Farm
/farms/:id/weather         → Farm Weather
/farms/:id/crops           → Farm Crops
/farms/:id/crop-suitability → Crop Suitability
/farms/:id/crop-recommendations → Crop Recommendations
/monitoring                → Crop Monitoring
/notifications             → Notifications
/input-calculator          → Input Calculator
/crop-prices               → Crop Prices
/crop-prices/:cropName     → Crop Price Detail
/utilities/disease-detection → Disease Detection
/utilities/plant-detector  → Plant Detector
/utilities/crop-health     → Satellite Crop Health (NDVI)
/agronomist                → AI Agronomist
/kisan                     → Kisan Network (Community + Marketplace + Inbox)
/marketplace               → Marketplace Listings
/marketplace/new           → Create Listing
/marketplace/:id           → Listing Detail
/marketplace/:id/edit      → Edit Listing
/inbox/:conversationId     → Conversation Thread
/financial                 → Financial Ledger
/financial/new             → Add Transaction
/financial/:id/edit        → Edit Transaction
/financial-health          → Financial Health
```

---

## 7. AI & External Integrations

### AI Providers

| Provider | Model | Purpose | Config Key |
|----------|-------|---------|------------|
| **Qwen VL Max** (DashScope) | qwen-vl-max | Disease detection via image analysis | `DiseaseDetection:ApiKey` |
| **Qwen Plus** | qwen-plus | AI agronomist text chat | `Agronomist:ChatModel` |
| **Qwen2 Audio** | qwen2-audio-instruct | Voice-to-text for agronomist | `Agronomist:SpeechToTextModel` |
| **Google Gemini 2.0 Flash** | gemini-2.0-flash | Plant identification (frontend fallback) | `VITE_GEMINI_API_KEY` |
| **OpenRouter** | Multiple models | Vision & voice fallback (frontend) | `VITE_OPENROUTER_API_KEY` |
| **Groq** | — | Fast voice/chat inference (frontend) | `VITE_GROQ_API_KEY` |

### External APIs

| API | Purpose | Config |
|-----|---------|--------|
| **Open-Meteo** | Weather data (current, forecast, reverse geocode) | Built-in, no key needed |
| **AgroMonitoring** | Satellite NDVI vegetation health imagery | `VITE_AGROMONITORING_API_KEY` |

### Image Validation

- **Library**: SixLabors.ImageSharp
- **Max Size**: 10 MB
- **Allowed Types**: image/jpeg, image/png, image/webp
- **Min Dimensions**: 128×128 px
- **Max Dimensions**: 6000×6000 px
- **Blur Detection**: Variance threshold of 40

---

## 8. Security

### Authentication
- **JWT Bearer** tokens with configurable Issuer, Audience, and Signing Key
- **Zero clock skew** validation
- Token stored in `localStorage` key `sabz_token`
- Auto-redirect to `/login` on 401 responses

### Authorization
- All endpoints except auth, locations, and crop-knowledge require authentication
- Farm/Crop/Transaction ownership enforced server-side (users can only access their own data)
- UserId derived from JWT identity, never accepted from client input

### Data Protection
- **Passwords**: BCrypt hashing (never stored in plaintext)
- **Soft Deletes**: Community posts, comments, marketplace listings use `IsDeleted` flag
- **Input Validation**: Domain-level validation with custom exceptions
- **Global Exception Middleware**: Maps domain exceptions to proper HTTP status codes (400, 401, 403, 404, 409, 500, 502)

### Secrets Management
- `appsettings.json` excluded from Git (contains JWT key, DB connection, AI API keys)
- `appsettings.template.json` committed with placeholder values
- `.env` files excluded from Git; `.env.example` provided with placeholders
- No hardcoded secrets in source code (verified by L3 deep security scan)

---

## 9. Internationalization (i18n)

### System
- Custom key-value translation system (NOT react-i18next)
- Module-level `currentLang` variable with `t()`, `setLanguage()`, `getLanguage()`, `isRtl()` functions
- Language persisted in `localStorage` key `sabz.lang`
- Translation fallback: `t(key)` → `ur[key] ?? en[key] ?? key`
- RTL layout automatically applied when Urdu is selected (`dir="rtl"`)

### Translation Coverage
- **~1,930 lines** of translation code
- **15+ categories**: Common, Navigation, Auth, Dashboard, Farms, Crops, Monitoring, Disease Detection, Plant Detector, Weather, Notifications, Financial, Crop Prices, Kisan Network, Input Calculator, Crop Health NDVI, Farm Dashboard
- **Soil types**: 8 types translated (Clay, Sandy, Loamy, Silty, Peaty, Chalky, Saline, Alluvial)
- **Irrigation types**: 7 types translated (Canal, Tubewell, Drip, Sprinkler, Rain-fed, Flood, Furrow)
- **Area units**: 4 units translated (Acres/ایکڑ, Hectares/ہیکٹر, Kanals/کنال, Marlas/مرلہ)

---

## 10. Deployment & Setup

### Prerequisites
- .NET 10 SDK
- Node.js 20+
- SQL Server (LocalDB or full instance)
- API keys for AI providers (optional — features degrade gracefully)

### Backend Setup

```bash
# 1. Clone the repository
git clone https://github.com/hunnyawan/SABZ.git
cd SABZ

# 2. Configure backend
cp src/SABZ.API/appsettings.template.json src/SABZ.API/appsettings.json
# Edit appsettings.json:
#   - Set ConnectionStrings:DefaultConnection
#   - Set Jwt:Key (random string, ≥32 characters)
#   - Set DiseaseDetection:ApiKey (Qwen/DashScope API key)

# 3. Run database migrations
dotnet ef database update --project src/SABZ.Infrastructure --startup-project src/SABZ.API

# 4. Start the API (port 5073)
dotnet run --project src/SABZ.API --urls "http://localhost:5073"
```

### Frontend Setup

```bash
# 1. Navigate to frontend
cd SABZ-Frontend

# 2. Install dependencies
npm install

# 3. Configure environment (optional)
cp .env.example .env
# Edit .env to add API keys (VITE_GEMINI_API_KEY, VITE_OPENROUTER_API_KEY, etc.)

# 4. Start dev server (port 5173, proxies /api to localhost:5073)
npm run dev
```

### Environment Variables (Frontend)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_API_BASE_URL` | No | Backend URL (empty = use Vite proxy) |
| `VITE_GEMINI_API_KEY` | No | Google Gemini for AI vision |
| `VITE_OPENROUTER_API_KEY` | No | OpenRouter for vision + voice |
| `VITE_GROQ_API_KEY` | No | Groq for fast voice/chat |
| `VITE_AGROMONITORING_API_KEY` | No | Satellite NDVI crop health |

### Configuration (Backend — appsettings.json)

| Setting | Description | Default |
|---------|-------------|---------|
| `ConnectionStrings:DefaultConnection` | SQL Server connection string | LocalDB |
| `Jwt:Issuer` | JWT token issuer | "SABZ" |
| `Jwt:Audience` | JWT token audience | "SABZ" |
| `Jwt:Key` | JWT signing key (≥32 chars) | — |
| `Weather:BaseUrl` | Weather API base URL | https://api.open-meteo.com |
| `Weather:ForecastDays` | Forecast days | 7 |
| `DiseaseDetection:Provider` | AI provider | "DashScope" |
| `DiseaseDetection:Model` | AI model | "qwen-vl-max" |
| `DiseaseDetection:ApiKey` | AI API key | — |
| `DiseaseDetection:MaxImageSizeMb` | Max upload size | 10 |
| `DiseaseDetection:PlantConfidenceThreshold` | Min plant confidence | 0.6 |
| `Agronomist:ChatModel` | Chat model | "qwen-plus" |
| `Agronomist:MaxQuestionLength` | Max question chars | 1000 |

---

## 11. Database Migrations History

| # | Migration | Date | Description |
|---|-----------|------|-------------|
| 1 | `InitialCreate` | 2026-08-20 | Empty schema foundation |
| 2 | `AddFarmCropLocationHierarchy` | 2026-08-20 | Farms, Crops, Province/District/Tehsil tables |
| 3 | `ReplaceLocationDataWithCompleteDataset` | 2026-08-20 | Complete Pakistan admin data (7 provinces, ~150 districts, ~800 tehsils) |
| 4 | `AddCropSuitabilityFoundation` | 2026-08-21 | CropCatalog, CropRequirement, RegionalCropSuitability, CropChangeRule |
| 5 | `AddCropRecommendationFoundation` | 2026-08-21 | Seed crop recommendation reference data |
| 6 | `AddDiseaseDetectionFoundation` | 2026-08-21 | DiseaseInformation table |
| 7 | `AddCropMonitoring` | 2026-08-21 | CropMonitoringRule, CropMonitoringCheck tables |
| 8 | `AddNotifications` | 2026-08-21 | Notification table |
| 9 | `AddFinancialTransactions` | 2026-08-21 | FinancialTransaction table |
| 10 | `AddCommunityFoundation` | 2026-08-29 | CommunityPost, CommunityComment tables |
| 11 | `AddMarketplaceAndInbox` | 2026-08-29 | MarketplaceListing, MarketplaceConversation, MarketplaceMessage |
| 12 | `AddTehsilCoordinates` | 2026-09-01 | Latitude/Longitude columns on Tehsil |
| 13 | `ResetTehsilCoordinatesForCorrection` | 2026-09-01 | Reset tehsil coordinates for data correction |
| 14 | `MakeListingIdNullable` | 2026-09-05 | Allow direct conversations (not tied to listing) |
| 15 | `AddCommunityPostLikes` | 2026-09-05 | CommunityPostLike table for post likes |

---

## 12. Project Structure

```
SABZ/
├── README.md                          # Project overview & quick start
├── PROJECT_DOCUMENTATION.md           # This file — complete documentation
── .gitignore                         # Git ignore rules
├── SABZ.slnx                          # Solution file
│
├── src/
│   ├── SABZ.API/                      # ASP.NET Core Web API (Presentation Layer)
│   │   ├── Controllers/               # 19 API controllers
│   │   ├── Middleware/                # Global exception handling
│   │   ├── Properties/
│   │   ├── Program.cs                 # App entry point, DI, auth, Swagger
│   │   ├── SABZ.API.csproj            # .NET 10.0 project file
│   │   ├── appsettings.template.json  # Configuration template (safe to commit)
│   │   └── appsettings.Development.json
│   │
│   ├── SABZ.Application/              # Business Logic Layer
│   │   ├── DTOs/                      # 18 folders of Data Transfer Objects
│   │   ├── Data/
│   │   ├── Interfaces/                # 55 interface files (services, repos, providers)
│   │   ├── Services/                  # 21 service files across 13 subfolders
│   │   └── SABZ.Application.csproj
│   │
│   ├── SABZ.Domain/                   # Core Domain Layer
│   │   ├── Entities/                  # 25 entity files
│   │   ├── Exceptions/                # 9 custom exception types
│   │   └── SABZ.Domain.csproj
│   │
│   └── SABZ.Infrastructure/           # Data Access & External Services Layer
│       ├── Migrations/                # 15 EF Core migration files
│       ├── Persistence/               # DbContext, seeders
│       ├── Repositories/              # 16 repository implementations
│       ├── SeedData/                  # pakistan-admin-data.json (53KB)
│       ├── Services/                  # External providers (Weather, AI, Password, Token)
│       ├── DependencyInjection.cs     # Full DI registration
│       └── SABZ.Infrastructure.csproj
│
├── SABZ-Frontend/                     # React + TypeScript SPA
│   ├── public/                        # Static assets
│   ├── scripts/                       # Urdu translation helper scripts
│   ├── src/
│   │   ├── api/                       # 17 API client modules
│   │   ├── assets/
│   │   ├── components/                # Shared React components
│   │   │   ├── chat/
│   │   │   ├── crops/
│   │   │   ├── dashboard/
│   │   │   ├── forms/
│   │   │   ├── layout/
│   │   │   ├── routes/
│   │   │   ├── shared/
│   │   │   ├── ui/                    # Reusable UI primitives (Card, Button, Badge, etc.)
│   │   │   └── weather/
│   │   ├── hooks/                     # useApi, useAuth
│   │   ├── lib/                       # i18n.ts (1930 lines), utils, farmTranslations, AI helpers
│   │   ├── pages/                     # 25 page components across 14 feature folders
│   │   ├── types/                     # TypeScript type definitions (875 lines)
│   │   ├── App.tsx                    # Root app component with routing
│   │   ├── index.css                  # Global styles + Tailwind
│   │   ├── main.tsx                   # Entry point
│   │   └── vite-env.d.ts
│   ├── .env.example                   # Environment variable template
│   ├── .gitignore
│   ├── index.html
│   ├── package.json                   # Frontend dependencies
│   ├── package-lock.json
│   ├── tsconfig.json
│   ── vite.config.ts                 # Vite build config with API proxy
│
└── docs/                              # Feature-by-feature documentation
    ├── README.md                      # Documentation index
    ├── architecture.md                # Solution layout & clean architecture rules
    ├── backend-api-reference.md       # API endpoint reference
    ├── pakistan-admin-data.md         # Pakistan administrative data reference
    ├── prompt-1-authentication.md
    ├── prompt-2-location-and-farms.md
    ├── prompt-2.1-crops.md
    ├── prompt-3-weather-intelligence.md
    ├── prompt-4-crop-suitability.md
    ├── prompt-5-crop-recommendation.md
    ├── prompt-6-disease-detection.md
    ├── prompt-7-crop-monitoring.md
    ├── prompt-8-notifications.md
    ├── prompt-9-financial.md
    ├── prompt-10-financial-health.md
    ├── prompt-11-farm-performance.md
    ├── prompt-12-farm-dashboard.md
    ├── prompt-13-voice-agronomist.md
    ├── prompt-14-farmer-community.md
    ├── prompt-15-marketplace-inbox.md
    ├── prompt-16-input-calculator.md
    └── prompt-17-crop-price-intelligence.md
```

---

## Statistics

| Metric | Count |
|--------|-------|
| Backend Entities | 25 |
| API Controllers | 19 |
| API Endpoints | ~60 |
| Service Classes | 21 |
| Repository Classes | 16 |
| Interface Files | 55 |
| Database Migrations | 15 |
| Frontend Pages | 25 |
| Frontend API Modules | 17 |
| TypeScript Type Definitions | 875 lines |
| Translation Lines | ~1,930 |
| Total Committed Files | 409 |
| Total Code Lines | ~71,727 |
