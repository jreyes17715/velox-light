# 🎯 CLAUDE.md - Mary Kay Commissions Dashboard

**Estado:** Módulos 1–4 completados (Motor comisiones, DIQ, Super Admin, Iniciadoras, Metas con distribución)
**Proyecto:** Dashboard de comisiones para Mary Kay Republica Dominicana  
**Fase actual:** MÓDULO 5+ — mejoras incrementales, Super Admin MetasPanel, pendientes varios  
**Timeline:** En progreso  
**Enfoque:** Modular + iterativo + 100% validado entre módulos

---

## ⚠️ INSTRUCCIONES CRÍTICAS

**🚨 NO ASUMIR NADA:**
- ❌ No asumas que credenciales existen → Padrino las proporciona
- ❌ No asumas rutas de API → Especificadas en este doc
- ❌ No asumas estructura SAP → Confirmada previamente
- ❌ No asumas base de datos creada → Se crea en Módulo 1
- ❌ No hagas componentes fantasía → Solo lo que está aquí
- ❌ No uses librerías "random" → Solo las listadas

**✅ HACER:**
- Seguir exactamente este documento
- Preguntar si algo no está claro
- Validar cada paso
- Si falta info → avisar, no asumir

---

## 📊 VISIÓN GENERAL

### **Qué es**
Dashboard donde **Directoras de Mary Kay** ven:
- Sus ventas personales
- Ventas de sus Consultoras (subordinadas)
- Metas vs cumplimiento
- Filtros y análisis básico

### **Usuarios**
- **Directora:** Supervisa Consultoras, ve datos propios + grupo
- **Consultora:** Solo ve sus propios datos
- **Admin:** (Futuro) maneja sincronización

### **Datos**
- **Origen:** 100% SAP Service Layer
- **Frecuencia:** Sincronización cada 15 min (ventas), 1 hora (usuarios/metas)
- **Almacenamiento local:** PostgreSQL (para reports rápidos)

### **Autenticación**
- **Token:** JWT desde Mary Kay DO (WordPress)
- **Flujo:** Usuario login en Mary Kay DO → obtiene JWT → accede a dashboard

---

## 🛠️ STACK TECNOLÓGICO (EXACTO)

### **Frontend**
```
✓ React 18.2.x
✓ Vite 5.x (build tool)
✓ TypeScript 5.x
✓ TailwindCSS 3.x (estilos)
✓ React Router v6.x (routing)
✓ Recharts 2.x (gráficos)
✓ zustand 4.x (state management)
✓ Axios (HTTP client)
✓ date-fns (fechas)
```

### **Backend**
```
✓ Node.js 20 LTS
✓ Express 4.x
✓ TypeScript 5.x
✓ Prisma 5.x (ORM)
✓ PostgreSQL 14+ (database)
✓ node-cron (scheduler)
✓ jsonwebtoken (JWT)
✓ dotenv (config)
✓ axios (HTTP client para SAP)
```

### **Base de Datos**
```
✓ PostgreSQL (relacional, transacciones)
✓ Prisma ORM (type-safe queries)
✓ Migraciones automáticas
```

### **Hosting — SETUP REAL (producción)**
```
BACKEND:
✓ Railway (PaaS) — https://alert-eagerness-production-8cbb.up.railway.app
✓ Deploy: Railway CLI → desde backend/ ejecutar: railway up
✓ NO está conectado a git — deploy manual con CLI

BASE DE DATOS:
✓ PostgreSQL en Railway (mismo proyecto Railway)
✓ Variable: ${{Postgres.DATABASE_URL}} — Railway la inyecta automáticamente
✓ Migraciones: npx prisma migrate deploy (en Railway via railway run)

FRONTEND:
✓ SiteGround — subdominio comisiones.marykay.do
✓ Build: cd frontend && npm run build  (genera frontend/dist/)
✓ Deploy: subir manualmente los archivos de frontend/dist/ por FTP o cPanel File Manager
✓ Archivos a subir: index.html + assets/index-[hash].js + assets/index-[hash].css
✓ VITE_API_URL debe apuntar a Railway al hacer build:
   VITE_API_URL=https://alert-eagerness-production-8cbb.up.railway.app/api npm run build
```

---

## 📁 ESTRUCTURA DEL PROYECTO

```
mk-commissions-dashboard/
│
├── frontend/                      # React app (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Header.tsx          # Top nav, logout button
│   │   │   │   ├── Sidebar.tsx         # Nav lateral
│   │   │   │   └── Layout.tsx          # Wrapper
│   │   │   ├── Auth/
│   │   │   │   └── LoginPage.tsx       # Página login (redirige a Mary Kay)
│   │   │   ├── Dashboard/
│   │   │   │   ├── DashboardPage.tsx   # Página principal
│   │   │   │   ├── OverviewCard.tsx    # Cards de stats
│   │   │   │   ├── SalesChart.tsx      # Gráfico línea
│   │   │   │   ├── SubordinatesTable.tsx # Tabla subordinadas
│   │   │   │   └── FilterBar.tsx       # Filtros fecha/usuario
│   │   │   ├── Sales/
│   │   │   │   └── SalesDetailModal.tsx # Modal de ventas detalladas
│   │   │   └── Common/
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── ErrorAlert.tsx
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts        # Auth logic
│   │   │   ├── useDashboard.ts   # Dashboard data
│   │   │   └── useSales.ts       # Sales data
│   │   ├── store/
│   │   │   └── authStore.ts      # zustand - auth state
│   │   ├── utils/
│   │   │   ├── api.ts            # axios config, interceptors
│   │   │   ├── formatters.ts     # Formatos moneda, fecha
│   │   │   └── calculations.ts   # Cálculos (achievement%, totales)
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript interfaces
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── backend/                       # Express app (TypeScript)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts               # POST /auth/me
│   │   │   ├── dashboard.ts          # GET /dashboard/*
│   │   │   ├── sales.ts              # GET /sales
│   │   │   └── admin.ts              # POST /admin/sync/now (privado)
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   ├── dashboardController.ts
│   │   │   └── salesController.ts
│   │   ├── services/
│   │   │   ├── authService.ts        # JWT validation, WP integration
│   │   │   ├── dashboardService.ts   # Cálculos, agregaciones
│   │   │   ├── salesService.ts       # Queries ventas
│   │   │   ├── sapService.ts         # Llamadas SAP (v2)
│   │   │   └── syncService.ts        # Sync logic (v2)
│   │   ├── middleware/
│   │   │   ├── auth.ts               # Verificar JWT
│   │   │   ├── errorHandler.ts       # Error responses
│   │   │   └── logger.ts             # Logging
│   │   ├── cron/
│   │   │   └── syncScheduler.ts      # node-cron (v2)
│   │   ├── utils/
│   │   │   ├── sapClient.ts          # axios SAP (v2)
│   │   │   ├── logger.ts
│   │   │   └── constants.ts
│   │   ├── types/
│   │   │   └── index.ts              # Interfaces
│   │   ├── prisma/
│   │   │   └── schema.prisma         # BD schema
│   │   ├── app.ts                    # Express setup
│   │   ├── server.ts                 # Entry point
│   │   └── index.ts
│   ├── .env.example
│   ├── tsconfig.json
│   ├── package.json
│   └── prisma/
│       ├── schema.prisma             # Schema (ver abajo)
│       └── migrations/               # Automáticas
│
├── CLAUDE.md                      # Este archivo
├── ARCHITECTURE.md                # Especificación técnica
├── CRONOGRAMA_MODULAR.md          # Timeline iterativo
├── .gitignore
├── README.md                      # Instrucciones setup
└── .env.example                   # Variables globales

(v1) = Módulo 1 (ahora)
(v2) = Módulo 3 (después)
```

---

## 🔐 CREDENCIALES & VARIABLES (MÓDULO 1)

**El usuario (Padrino) debe confirmar/proporcionar ANTES de empezar:**

```bash
# JWT de Mary Kay DO
JWT_ENDPOINT="https://marykay.do/wp-json/[RUTA_EXACTA]"

# SAP Service Layer
SAP_BASE_URL="https://162.248.53.166:50000/b1s/v2"
SAP_COMPANY_DB="SBO_AROMADELROSAL"
SAP_USERNAME="CEOCONSULTORIA\\aro-aromas1"
SAP_PASSWORD="phlsplthudrenAprafrus1l"
# Campo tipo: U_Tipo — C=Consultora, D=Directora
# Endpoint usuarios: GET /BusinessPartners
# Endpoint ventas: GET /Orders
JWT_SECRET="(KGf3O{]Imghj{vUN|[kZ}l:zeJpZg|xf:lB4k&G@L1yu;]7h@2k18,!=F:0+a!X"

# Base de datos PostgreSQL
DATABASE_URL="postgresql://postgres:17715Reyes@localhost:5432/mk_commissions"

# Frontend URL (CORS)
FRONTEND_URL="http://localhost:5173"  # Dev
FRONTEND_URL="https://comisiones.marykay.do"  # Prod

# Backend port
PORT=3000

# Node env
NODE_ENV="development"
```

**⚠️ MÓDULO 1 NO NECESITA:**
- Credenciales SAP (eso es Módulo 3)
- Variables de sync (eso es Módulo 3)

---

## 📦 PRISMA SCHEMA (MÓDULO 1)

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Usuario (Directora o Consultora)
model User {
  id                String    @id @default(cuid())
  sapUserId         String    @unique  // CardCode de SAP (A00247, etc)
  name              String
  email             String?   @unique
  role              String    // "directora" | "consultora"
  
  // Relación jerárquica
  supervisorId      String?                    // FK a su directora
  supervisor        User?     @relation("Supervision", fields: [supervisorId], references: [id])
  subordinates      User[]    @relation("Supervision")
  
  // Relaciones a datos
  sales             Sale[]
  targets           Target[]
  
  // Auditoría
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastSapSync       DateTime?

  @@index([sapUserId])
  @@index([supervisorId])
  @@map("users")
}

// Venta (sincronizada de SAP en Módulo 3)
model Sale {
  id                String    @id @default(cuid())
  sapOrderId        String    @unique  // DocEntry de SAP
  userId            String               // CardCode -> mapea a User.sapUserId
  user              User      @relation(fields: [userId], references: [sapUserId])
  
  amount            Decimal   @db.Decimal(18, 2)
  currency          String    @default("DOP")
  saleDate          DateTime
  status            String    @default("completed")  // completed, pending, cancelled
  
  // Datos SAP
  sapDocNum         Int?
  sapDocEntry       String
  
  syncedAt          DateTime  @default(now())

  @@index([userId])
  @@index([saleDate])
  @@map("sales")
}

// Meta (sincronizada de SAP en Módulo 3)
model Target {
  id                String    @id @default(cuid())
  userId            String               // CardCode -> mapea a User.sapUserId
  user              User      @relation(fields: [userId], references: [sapUserId])
  
  month             Int       // 1-12
  year              Int       // 2024, 2025, etc
  targetAmount      Decimal   @db.Decimal(18, 2)
  currency          String    @default("DOP")
  
  sapReference      String?   // ID en SAP si aplica
  syncedAt          DateTime  @default(now())
  
  @@unique([userId, month, year])
  @@index([userId])
  @@map("targets")
}

// Log de sincronización (Módulo 3)
model SyncLog {
  id                String    @id @default(cuid())
  syncType          String    // "users" | "sales" | "targets" | "full"
  status            String    // "success" | "error" | "partial"
  recordsProcessed  Int       @default(0)
  errorMessage      String?
  startedAt         DateTime  @default(now())
  completedAt       DateTime?

  @@index([syncType])
  @@index([startedAt])
  @@map("sync_logs")
}
```

---

## 🔌 API ENDPOINTS (MÓDULO 1)

**Base URL:** `http://localhost:3000/api` (dev) o `https://comisiones.marykay.do/api` (prod)

### **Autenticación**

#### `POST /auth/me`
**Descripción:** Valida JWT y retorna datos del usuario  
**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```
**Response (200):**
```json
{
  "userId": "12345",
  "sapUserId": "A00247",
  "name": "María López",
  "email": "maria@marykay.do",
  "role": "directora",
  "supervisorId": null,
  "subordinates": [
    { "id": "...", "name": "Consultora 1", "sapUserId": "A00248" },
    { "id": "...", "name": "Consultora 2", "sapUserId": "A00249" }
  ]
}
```
**Response (401):**
```json
{ "error": "No token provided" }
```
**Response (403):**
```json
{ "error": "Invalid token" }
```

---

## 🔑 FLUJO JWT (MÓDULO 1)

### **Paso 1: Usuario navega a dashboard**
```
Usuario entra a http://localhost:5173
→ No hay JWT en localStorage
→ Redirige a `/login`
```

### **Paso 2: Login page**
```
Frontend muestra botón "Login con Mary Kay"
→ Click → redirige a https://marykay.do/login?redirect=comisiones
```

### **Paso 3: Mary Kay DO genera JWT**
```
Usuario login en Mary Kay DO
→ Mary Kay retorna JWT (vía URL param o localStorage)
→ Redirige a comisiones.marykay.do?token=JWT_STRING
```

### **Paso 4: Frontend captura JWT**
```
LoginPage detecta token en URL
→ Guarda en localStorage: window.localStorage.setItem('token', token)
→ Redirige a /dashboard
```

### **Paso 5: Dashboard valida JWT**
```
GET /api/auth/me con header Authorization: Bearer {token}
Backend verifica:
  1. Token firmado con JWT_SECRET ✓
  2. No expirado ✓
  3. Usuario existe en BD ✓
Retorna user data
```

### **Paso 6: Usuario en dashboard**
```
Frontend recibe user data
→ Guarda en zustand store (authStore)
→ Renderiza Dashboard con datos
```

---

## 🎨 COMPONENTES FRONTEND (MÓDULO 1)

### **LoginPage.tsx**
**Responsabilidad:** Renderizar página de login simple
**Props:** Ninguno
**Estado:** -
**Comportamiento:**
```
1. Renderiza botón "Login con Mary Kay"
2. Click → redirect a Mary Kay DO con parámetro redirect
3. Cuando vuelve con JWT en URL:
   - Guardar en localStorage
   - Redirige a /dashboard
4. Si hay JWT existente en localStorage:
   - Redirige a /dashboard inmediatamente
```
**Código esperado:**
```typescript
// PSEUDOCÓDIGO (no copia exacta, tu estilo)
export function LoginPage() {
  useEffect(() => {
    // Checar si token en URL
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      localStorage.setItem('token', token);
      navigate('/dashboard');
    }
    
    // Si ya hay token guardado, ir a dashboard
    if (localStorage.getItem('token')) {
      navigate('/dashboard');
    }
  }, []);
  
  const handleLogin = () => {
    window.location.href = `https://marykay.do/login?redirect=${window.location.origin}/`;
  };
  
  return (
    <div>
      <h1>Mary Kay Commissions</h1>
      <button onClick={handleLogin}>Login con Mary Kay DO</button>
    </div>
  );
}
```

### **Layout.tsx**
**Responsabilidad:** Wrapper de layout (header, sidebar, main)
**Props:** `children`
**Comportamiento:**
```
Renderiza:
- Header (logo, user info, logout button)
- Sidebar (nav links: Dashboard, Salidas, Logout)
- Main content area (children)
```

### **Header.tsx**
**Responsabilidad:** Top navigation
**Props:** -
**Comportamiento:**
```
Muestra:
- Logo Mary Kay (o "Comisiones")
- "Hola, [nombre usuario]" (dato de authStore)
- Botón Logout (borra token, redirige a /login)
```

### **Sidebar.tsx**
**Responsabilidad:** Navegación lateral
**Props:** -
**Comportamiento:**
```
Links a:
- Dashboard (siempre)
- Ventas (siempre)
- Settings (si rol admin) [NO PARA MÓDULO 1]
- Logout (o en header)
```

### **DashboardPage.tsx**
**Responsabilidad:** Página principal (layout + componentes)
**Props:** -
**Estado:** user (de authStore)
**Comportamiento:**
```
Renderiza Layout con:
- FilterBar (rango fechas)
- OverviewCards (4 cards)
- SalesChart (gráfico)
- SubordinatesTable (tabla)
```

### **OverviewCard.tsx**
**Props:**
```typescript
{
  title: string;      // "Tu venta del mes"
  value: number;      // 50000
  subtitle?: string;  // "vs meta: $55000"
  color?: string;     // "pink" | "blue" | "green"
}
```
**Renderiza:** Card con title + value + styling

### **SalesChart.tsx**
**Responsabilidad:** Gráfico de línea (últimos 30 días)
**Props:**
```typescript
{
  data: { date: string; amount: number }[];
}
```
**Usa:** Recharts LineChart

### **SubordinatesTable.tsx**
**Responsabilidad:** Tabla de consultoras
**Props:**
```typescript
{
  data: {
    id: string;
    name: string;
    totalSales: number;
    targetAmount: number;
    achievement: number;  // porcentaje (0-100)
  }[];
}
```
**Columnas:** Nombre | Ventas | Meta | % Cumplimiento | Acciones  
**Acciones:** Click → abre SalesDetailModal

### **SalesDetailModal.tsx**
**Responsabilidad:** Modal de ventas detalladas
**Props:**
```typescript
{
  userId: string;  // CardCode de consultora
  isOpen: boolean;
  onClose: () => void;
}
```
**Contenido:**
```
Filtros:
- Fecha inicio / Fecha fin (date pickers)
- Estado (completed, pending, cancelled)

Tabla:
- Número orden SAP
- Fecha
- Monto
- Estado
```

---

## 💻 BACKEND ENDPOINTS (MÓDULO 1)

**IMPORTANTE:** En Módulo 1, usamos SEED DATA (datos ficticios en BD).

### `POST /auth/me`
**Archivo:** `src/routes/auth.ts` + `src/controllers/authController.ts`  
**Middleware:** `authenticateJWT` (verifica token)  
**Lógica:**
```
1. Extraer token de header Authorization
2. Verificar firma con JWT_SECRET
3. Buscar User en BD por sapUserId (del token)
4. Si existe: retornar user + subordinates
5. Si no existe: retornar 404 (o crear? → Padrino decide)
6. Si token inválido: 401/403
```

### `GET /dashboard/overview`
**Archivo:** `src/routes/dashboard.ts`  
**Middleware:** `authenticateJWT`  
**Query params:**
```
?month=12&year=2024  (opcional, si no: mes/año actual)
```
**Lógica:**
```
1. Obtener usuario del JWT (req.user)
2. Calcular:
   - totalSales = SUM(sales.amount) WHERE userId = req.user.sapUserId AND mes/año
   - targetAmount = targets WHERE userId = req.user.sapUserId AND mes/año
   - achievement% = (totalSales / targetAmount) * 100
   - subordinateCount = COUNT(subordinates)
3. Retornar JSON
```
**Response:**
```json
{
  "user": { "name": "María", "role": "directora" },
  "totalSales": 50000,
  "targetAmount": 55000,
  "achievementPercent": 90.9,
  "subordinateCount": 5,
  "currency": "DOP"
}
```

### `GET /dashboard/subordinates`
**Archivo:** `src/routes/dashboard.ts`  
**Middleware:** `authenticateJWT`  
**Query params:**
```
?month=12&year=2024&page=1&limit=10
```
**Lógica:**
```
1. Obtener usuario del JWT
2. Buscar subordinates (Users WHERE supervisorId = req.user.id)
3. Para cada subordinada:
   - totalSales en mes/año
   - targetAmount
   - achievement%
4. Paginar (limit 10 default)
5. Retornar array
```
**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "name": "Consultora 1",
      "sapUserId": "A00248",
      "totalSales": 30000,
      "targetAmount": 35000,
      "achievementPercent": 85.7,
      "salesCount": 12
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 25
}
```

### `GET /dashboard/sales`
**Archivo:** `src/routes/sales.ts`  
**Middleware:** `authenticateJWT`  
**Query params:**
```
?userId=A00248&startDate=2024-12-01&endDate=2024-12-31&page=1&limit=20&status=completed
```
**Lógica:**
```
1. Obtener usuario del JWT
2. Si userId en params:
   - Validar que sea subordinada (no otra consultora random)
   - Si no es subordinada Y no es el mismo usuario: 403 Forbidden
3. Buscar sales con filtros:
   - userId = userId param
   - saleDate BETWEEN startDate AND endDate
   - status = status param (si provided)
4. Ordernar por saleDate DESC
5. Paginar (limit 20 default)
6. Retornar array
```
**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "sapOrderId": "12345",
      "sapDocNum": 42,
      "amount": 2500,
      "currency": "DOP",
      "saleDate": "2024-12-15T10:30:00Z",
      "status": "completed",
      "userId": "A00248"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 156
}
```

---

## 👥 SEED DATA (MÓDULO 1)

**Para testing sin SAP**, necesitamos crear seed data en BD.

**Archivo:** `backend/src/prisma/seed.ts` (Prisma seed feature)

**Datos a crear:**
```
3 Directoras:
- María López (A00247) - supervisorId = null
- Carmen García (A00250) - supervisorId = null
- Rosa Martínez (A00251) - supervisorId = null

10 Consultoras (distribuidas entre directoras):
- Consultora 1 (A00248) → supervisa María López
- Consultora 2 (A00249) → supervisa María López
- ... etc

50 Ventas ficticias:
- Distribución aleatoria entre consultoras
- Fechas últimos 30 días
- Montos entre 500-5000 DOP
- Estados: mostly "completed", algunos "pending"

3 Metas:
- Cada directora: meta de 50000 DOP para diciembre 2024
```

**Comando para ejecutar seed:**
```bash
npx prisma db seed
```

---

## 🔌 MIDDLEWARE AUTENTICACIÓN

**Archivo:** `backend/src/middleware/auth.ts`

```typescript
// PSEUDOCÓDIGO
export async function authenticateJWT(req, res, next) {
  try {
    // 1. Extraer token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    // 2. Verificar firma
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Buscar usuario en BD
    const user = await prisma.user.findUnique({
      where: { sapUserId: decoded.sapUserId },
      include: { subordinates: true }
    });
    
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }
    
    // 4. Guardar en request
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}
```

---

## 🧪 TESTING MÓDULO 1

**Checklist de validación (DEBE cumplirse antes de pasar a Módulo 2):**

### **Backend**
- [ ] `npm install` funciona en backend/
- [ ] `npx prisma generate` sin errores
- [ ] `npx prisma migrate dev --name init` crea tablas
- [ ] `npx prisma db seed` popula datos ficticios
- [ ] `npm run dev` inicia servidor en puerto 3000
- [ ] `POST /api/auth/me` con JWT válido retorna user
- [ ] `POST /api/auth/me` sin token retorna 401
- [ ] `POST /api/auth/me` con token inválido retorna 403
- [ ] Logs de debug aparecen en console

### **Frontend**
- [ ] `npm install` funciona en frontend/
- [ ] `npm run dev` inicia servidor en puerto 5173
- [ ] LoginPage carga sin errores
- [ ] Botón "Login" funciona
- [ ] Captura JWT de URL
- [ ] Guarda token en localStorage
- [ ] Redirige a /dashboard tras login

### **E2E (End-to-End)**
- [ ] Abrir http://localhost:5173
- [ ] Click "Login con Mary Kay"
- [ ] Captura JWT (simulado en URL)
- [ ] Redirige a /dashboard
- [ ] Acceso a /dashboard sin token redirige a /login
- [ ] Logout borra token
- [ ] No errores CORS

---

## 📝 PASOS EXACTOS A SEGUIR (MÓDULO 1)

### **Paso 1: Setup inicial (Día 1)**

1. **Crear estructura de carpetas:**
   ```bash
   mkdir mk-commissions-dashboard
   cd mk-commissions-dashboard
   mkdir frontend backend
   ```

2. **Backend - inicializar:**
   ```bash
   cd backend
   npm init -y
   npm install express typescript @types/express @types/node
   npm install prisma @prisma/client jsonwebtoken dotenv node-cron
   npm install -D ts-node @types/jsonwebtoken
   npx tsc --init
   npx prisma init
   ```

3. **Frontend - inicializar:**
   ```bash
   cd ../frontend
   npm create vite@latest . -- --template react-ts
   npm install
   npm install react-router-dom zustand axios date-fns recharts
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

4. **Archivos raíz:**
   - Crear `.gitignore` (node_modules, .env, dist)
   - Crear `.env.example` (con variables necesarias)
   - Crear `README.md` (instrucciones setup)

### **Paso 2: Backend - estructura base (Día 1-2)**

1. **tsconfig.json** - configurar paths, target ES2020, strict mode
2. **Backend carpetas:**
   - `src/routes/auth.ts`
   - `src/controllers/authController.ts`
   - `src/middleware/auth.ts`
   - `src/utils/logger.ts`
   - `src/app.ts`
   - `src/server.ts`

3. **Prisma schema** (ver arriba)
4. **Crear BD PostgreSQL** (local o SiteGround)
5. **Ejecutar migración inicial:**
   ```bash
   npx prisma migrate dev --name init
   ```

### **Paso 3: Backend - endpoints (Día 2)**

1. Implementar middleware `authenticateJWT`
2. Implementar `POST /auth/me`
3. Implementar error handler middleware
4. Setup CORS para frontend

### **Paso 4: Backend - seed data (Día 2)**

1. Crear `prisma/seed.ts`
2. Ejecutar `npx prisma db seed`
3. Verificar datos en BD (pgAdmin o similar)

### **Paso 5: Frontend - autenticación (Día 3)**

1. Setup zustand store (`store/authStore.ts`)
2. Crear `useAuth` hook
3. Crear LoginPage.tsx
4. Setup React Router con protected routes
5. Setup axios interceptors (agregar token a requests)

### **Paso 6: Frontend - Layout (Día 3)**

1. Crear Layout.tsx
2. Crear Header.tsx (logout button)
3. Crear Sidebar.tsx
4. Crear DashboardPage.tsx (placeholder)

### **Paso 7: Testing (Día 3)**

Validar checklist de testing (arriba).

---

## ⚠️ COSAS QUE NO HACER EN MÓDULO 1

❌ **NO implementes SAP integration** → eso es Módulo 3  
❌ **NO hagas sync automático** → eso es Módulo 3  
❌ **NO consultes SAP en ningún endpoint** → usa seed data  
❌ **NO crees componentes adicionales** → solo los listados  
❌ **NO uses librerías no mencionadas** → solo las del stack  
❌ **NO asumas estructura de JWT** → Padrino confirma formato  
❌ **NO hardcodees URLs/secrets** → usa .env  
❌ **NO hagas deploy todavía** → es Módulo 5  

---

## ✅ COSAS QUE SÍ HACER EN MÓDULO 1

✅ **Setup TypeScript correcto** - strict mode, paths configurados  
✅ **Schema Prisma claro** - tipos correctos, relaciones OK  
✅ **Endpoints REST simples** - GET/POST, error handling  
✅ **JWT validation completa** - verificar firma, expiración  
✅ **Frontend routing** - protected routes, redirects  
✅ **State management** - zustand para auth  
✅ **Error handling** - no crashes, mensajes claros  
✅ **Logging** - debug info en console  
✅ **Seed data realista** - datos de prueba parecidos a SAP  

---

## 📞 SI ALGO NO ESTÁ CLARO

**Preguntas para Padrino ANTES de empezar código:**

```
1. ¿JWT_SECRET de Mary Kay DO? (valor exacto)
   Respuesta: (KGf3O{]Imghj{vUN|[kZ}l:zeJpZg|xf:lB4k&G@L1yu;]7h@2k18,!=F:0+a!X ✅

2. ¿Ruta exacta del endpoint JWT? 
   Ej: /wp-json/custom/v1/jwt
   Respuesta: [___________]

3. ¿HOST/PORT/USER/PASSWORD de PostgreSQL?
   Respuesta: 
   - Host: [___________]
   - Port: [___________]
   - User: [___________]
   - Pass: [___________]

4. ¿Moneda default? (DOP, GTQ, USD)
   Respuesta: [___________]
```

---

## 🎯 ENTREGA ESPERADA - FIN DE MÓDULO 1

**Repositorio con:**
- ✅ Frontend ejecutándose en `http://localhost:5173`
- ✅ Backend ejecutándose en `http://localhost:3000`
- ✅ PostgreSQL con datos seed
- ✅ Login funciona end-to-end
- ✅ JWT validado en backend
- ✅ TypeScript sin errores
- ✅ README.md con instrucciones
- ✅ .gitignore correcto
- ✅ .env.example con variables necesarias

**Validaciones completadas:**
- ✅ Checklist de testing TODO OK
- ✅ Login → Dashboard redirection funciona
- ✅ Logout → Login redirection funciona
- ✅ API endpoints responden correctamente
- ✅ CORS configurado
- ✅ Sin errores 404/500

---

## 🚀 CUANDO MÓDULO 1 ESTÉ HECHO

Padrino revisará y confirmará:
- "Login funciona 100%"
- "Datos en BD son correctos"
- "Sin bugs"

Entonces → **Iniciar Módulo 2 (Dashboard UI)**

---

## 📄 ARCHIVOS ADJUNTOS A ESTE DOCUMENTO

Este CLAUDE.md va acompañado de:

1. **MK_COMMISSIONS_ARCHITECTURE.md** - Especificación técnica completa del proyecto
2. **CRONOGRAMA_MODULAR.md** - Timeline iterativo (5 módulos, 14 días)

Referencia estos si necesitas info sobre:
- Stack tecnológico detallado
- Schema PostgreSQL completo
- API endpoints de otros módulos
- SAP integration (Módulo 3)
- Deploy (Módulo 5)

---

## 💡 ÚLTIMAS NOTAS

- **Modular = éxito** - Módulo 1 debe estar 100% antes de Módulo 2
- **No asumir = seguridad** - Si falta info, preguntar > asumir
- **Validación constante** - Cada cambio significativo, testear
- **Logs son tus amigos** - console.log, logger, debug todo
- **Código limpio desde día 1** - TypeScript, comentarios, nombres claros
- **Documentación = must** - README, tipos, interfaces documentadas

---

**✅ MÓDULOS 1-3 COMPLETADOS — SAP INTEGRATION ACTIVA**

---

## 💰 ESTRUCTURA DE COMISIONES (DOCUMENTADA)

> Fuente: Reportes reales de mayo 2026 — "Comision por Unidad", "Comision por Iniciadora", Excel "Comisiones por Directoras y Descendientes"

### **TRES TIPOS DE COMISIÓN — INDEPENDIENTES ENTRE SÍ**

Una directora puede ganar las tres al mismo tiempo. Una consultora puede ganar solo la tipo C (si reclutó gente).

---

### **TIPO A — Comisión por Producción de Unidad**

**Quién la gana:** Toda directora con unidad activa  
**Base de cálculo:** Compra Neta de TODA su unidad (todas las consultoras del grupo)  
**Fórmula:** `Compra Neta = Compra Bruta / 1.18` (se divide el 18% de ITBIS dominicano)

**Tabla de tasas (por Compra Neta del mes):**
```
DOP         1 – 449,999  →  6%
DOP   450,000 – 549,999  →  8%
DOP   550,000 +          → 14%
```

**Ejemplos reales (mayo 2026):**
```
LIDER DE VICTORIA (Adelice Cabral): Bruta 195,177 / Neta 165,404  → 6% = 9,924
EL ROSAL         (Aroma del Rosal): Bruta 547,505 / Neta 463,987  → 8% = 37,119
LUCERO           (Carmen Santiago): Bruta 450,682 / Neta 381,934  → 8% = 30,554
```

**Nota importante:** El % cambia CADA MES según la producción del mes. No es fijo.

---

### **TIPO B — Comisión por Unidades Descendientes (Multi-nivel de directoras)**

**Quién la gana:** Directoras que han entrenado/iniciado a otras directoras  
**Base de cálculo:** Compra Neta de las unidades DIRECTAS (1ra línea) de descendientes  
**Estructura:** MLM multi-nivel. Cada directora gana solo sobre su línea directa, NO sobre todos los niveles.

**Tabla de tasas (por cantidad de unidades descendientes directas):**
```
1 unidad descendiente   →  3%
2 – 4 unidades          →  4%
5+ unidades             →  4.5%
(tiers superiores: confirmar con ARI)
```

**Ejemplos reales (enero 2026, Excel):**
```
ALTAIRA PERALTA    → 1 descendiente (Corazon/Leidy Ledesma): 3% sobre 273,586 neta = 8,207
CARMEN SANTIAGO    → 4 descendientes (Ave Fenix, Aguilas, Lider de Victoria, Mujeres de Valor): 4%
DELFINA MORETA     → 5 descendientes: 4.5%
ELISA OGANDO       → 4 descendientes: 4%
```

**Árbol de jerarquía entre directoras (ejemplo real):**
```
ELISA OGANDO (Mujeres Todo Terreno)
├── OLGA DUVAL (Mujeres Valientes)
│   └── SUGEIRY HERNANDEZ (Estrellas de Dios)
│       └── ROSANNA HERNANDEZ (Herederas de Dios)
├── GLENIA TAVAREZ (Dios con Nosotros)
├── NAYROBI OGANDO (Mujeres Sabias)
└── YISSEL RUIZ (Mujeres Rompiendo Moldes)

CARMEN SANTIAGO (Lucero)
├── YENNI FILPO (Ave Fenix)
│   └── ALTAIRA PERALTA (Legado de Amor)
│       └── LEIDY LEDESMA (Corazon)
├── MARIA ELIZABETH REYES (Aguilas)
│   └── DELFINA MORETA (Larimar)
│       ├── RAQUEL VERAS (Mujeres con Propositos)
│       ├── GREOLANDY ALCANTARA (Bendiciones de Dios)
│       ├── SARAH FELIZ (Metamorfosis)
│       ├── MARIA RAMOS (Joyas de Dios)
│       └── JOHNNA ROSARIO (Jireh)
├── ADELICE CABRAL (Lider de Victoria)
└── JENIFER RAMOS (Mujeres de Valor)
```

**Cómo está en SAP:** La relación directora→directora se mapea via `U_CodIni` en BusinessPartner. Cuando una directora fue iniciada/entrenada por otra, el `U_CodIni` de la directora "hija" apunta al CardCode de la directora "madre".

---

### **TIPO C — Comisión por Asociadas Personales (Iniciadora)**

**Quién la gana:** Cualquier persona (consultora O directora) que haya reclutado personalmente a otras  
**Término técnico:** La reclutadora se llama "Iniciadora". Sus reclutas son "Asociadas Personales".  
**Base de cálculo:** Compra Neta de las RECLUTAS DIRECTAS (solo 1ra línea personal)  
**Definición:** Una Iniciadora es alguien que reclutó a otras. Toda Iniciadora es consultora o directora, pero no toda consultora/directora es Iniciadora.

**Tabla de tasas (por reclutas ACTIVAS = status A1/A2/A3):**
```
1 – 2  activas  →  2%
3 – 4  activas  →  4%
5 – ?  activas  →  6%
?+     activas  →  8%
(umbrales exactos entre 6% y 8% pendientes de confirmar con ARI)
```

**Ejemplos reales (mayo 2026):**
```
ANA BAEZ MELO: 8 reclutas, 2 activas → 2%
BERENICE TRINIDAD: 3 reclutas, 3 activas → 4%
ALTAIRA PERALTA: 17 reclutas, 5 activas → 6%
NOELIA JIMENEZ: 38 reclutas, 24 activas → 8%
CRISTINA BAEZ: 38 reclutas, 16 activas → 8%
```

**Cómo está en SAP:** El campo `U_CodIni` en BusinessPartner contiene el CardCode de quien reclutó a esa persona. `U_NomIni` tiene el nombre del iniciador/unidad.

---

### **CÓDIGOS DE STATUS (de consultoras y directoras)**

Aparecen en los reportes junto al código de cada persona. Son críticos para calcular "reclutas activas".

```
A1  →  Activa nivel 1 (cuenta como activa para comisiones)
A2  →  Activa nivel 2 (cuenta como activa)
A3  →  Activa nivel 3 (cuenta como activa)
I1  →  Inactiva / en proceso nivel 1
I2  →  Inactiva / en proceso nivel 2
I3  →  Inactiva / en proceso nivel 3
T   →  Terminada / Nueva (reciente, sin compras suficientes)
```

Solo A1, A2, A3 cuentan como "activas" para el cálculo del % de comisión de la Iniciadora.

**En SAP:** Probablemente campo `U_Status` o `U_Nivel` en BusinessPartner. Actualmente NO se está sincronizando — se necesita agregar al `$select` en `fetchAllBusinessPartners`.

---

### **CAMPOS SAP RELEVANTES PARA COMISIONES**

```
BusinessPartner:
  CardCode         → ID único (ej: "AC-00001", "P00853")
  CardName         → Nombre completo
  U_Tipo           → 'D' = Directora, null/vacío = Consultora
  GroupCode        → FK a BusinessPartnerGroups.Code (grupo/unidad)
  U_CodIni         → CardCode del iniciador/reclutador (para comisión C y jerarquía B)
  U_NomIni         → Nombre del iniciador o unidad
  U_DIRECTORA      → Nombre de la directora de la unidad
  U_Status / U_Nivel → Status activo/inactivo (A1/A2/A3/T/I1/I2/I3) — CONFIRMAR NOMBRE
  EmailAddress     → Email

BusinessPartnerGroups:
  Code             → ID del grupo (mismo que BusinessPartner.GroupCode)
  Name             → Nombre de la unidad (ej: "Mujeres de Valor")
  U_CardCode       → CardCode de la directora responsable del grupo
  U_CardName       → Nombre de la directora

Orders:
  DocEntry         → ID único de la orden
  DocNum           → Número de documento SAP
  CardCode         → CardCode del cliente (consultora que compró)
  DocDate          → Fecha de la orden
  DocTotal         → Total bruto (con ITBIS 18%)
  DocumentStatus   → 'O' = Abierta, 'C' = Cerrada
  Cancelled        → 'Y' | 'N'
```

---

### **FÓRMULA NETA**

```
Compra Neta = Compra Bruta / 1.18
```

El 18% es el ITBIS (IVA dominicano). Todas las comisiones se calculan sobre el monto NETO.

---

### **PENDIENTES CRÍTICOS PARA EL MOTOR DE COMISIONES**

1. **Confirmar nombre del campo status en SAP** — buscar `U_Status`, `U_Nivel`, o similar en BusinessPartner. Es necesario para clasificar A1/A2/A3/T/I.
2. **Confirmar umbral exacto entre 6% y 8%** para comisión Iniciadora (Tipo C). Actualmente se ve que 5 activas → 6% y hay casos de 6-7 activas con 8%.
3. **Confirmar umbrales superiores** de comisión por descendientes (¿6+ unidades = 5%? ¿más allá?).
4. **Super Admin role** — ver sección siguiente.

---

## 👑 ROL SUPER ADMIN (IMPLEMENTADO)

`isSuperAdmin: true` en el modelo User (campo booleano en Prisma, ya migrado).

**Lo que puede hacer:**
- Ver TODAS las directoras y sus unidades (SuperAdminPage.tsx)
- Tabs: Overview, Unidades, Iniciadoras, DIQ, Metas, Sync
- Asignar metas de unidad a cada directora (campo Target de la directora = meta de unidad)
- Ver árbol de iniciadoras y sus reclutas con producción
- Gestionar sincronización SAP manual

**En el backend:** `req.user.isSuperAdmin` — los endpoints de superadmin están en `backend/src/routes/superadmin.ts`

---

## 🚀 ESTADO ACTUAL DEL PROYECTO (julio 2026)

### **LO QUE ESTÁ IMPLEMENTADO Y FUNCIONANDO**

```
✅ Auth JWT (WordPress Mary Kay DO → token → dashboard)
✅ Dashboard overview (ventas personales + grupo, metas, ranking)
✅ Página Ventas con filtros
✅ Página Consultoras (tabla subordinadas)
✅ Página Metas — NUEVO FLUJO:
   - SuperAdmin asigna meta de unidad (Target de la directora)
   - Directora ve esa meta y la distribuye entre ella + consultoras
   - Distribución equitativa (÷ N miembros) o manual
   - PUT /api/dashboard/metas guarda los targets individuales
✅ Página Comisiones (Tipo A, B, C calculadas)
✅ Página Mi Perfil
✅ SuperAdmin — tabs: Overview, Unidades, Iniciadoras, DIQ, Metas, Sync
✅ SuperAdmin Iniciadoras — tabla de iniciadoras/DIQ con reclutas y producción
✅ DIQ — registro y seguimiento de candidatas a directora
✅ SAP sync (BusinessPartners + Orders + CreditNotes cada 15 min)
✅ Notas de crédito descontadas de ventas
✅ isSuperAdmin, inciadoraId, unitName en schema
```

### **PENDIENTES / PRÓXIMAS TAREAS**

```
⬜ Task #29: SuperAdmin MetasPanel — aclarar que el campo de la directora = meta de unidad global
⬜ Confirmar campo U_Status/U_Nivel en SAP para status A1/A2/A3 de consultoras
⬜ Confirmar umbral exacto 6% vs 8% en comisión Iniciadora (5 activas = 6%, ¿cuántas = 8%?)
⬜ Confirmar umbrales superiores comisión descendientes (5+ = 4.5%, ¿hay más tiers?)
```

### **⚠️ REGLA VIGENTE — NO TOCAR COMISIONES (fase actual)**

🚫 En la fase actual (ajuste del cálculo de producción/Sale.amount con filtro de descuento), **no se modifica la lógica de comisiones** (Tipo A, B, C) bajo ninguna circunstancia, aunque los montos de "Comisión Est." que aparecen junto a producción se vean raros o inconsistentes.
- El campo "Comisión Est." que aparece en tablas de Ventas/Producción es solo informativo y depende de `compraBruta`/`compraNeta`, no es el motor de comisiones real.
- Cualquier cambio a la fórmula, tasas o umbrales de comisión requiere confirmación explícita de Padrino primero.
- El foco actual es exclusivamente: que `Sale.amount` (producción) refleje correctamente el filtro de productos con descuento. Ver sección "ESTRUCTURA DE COMISIONES" más arriba para la lógica real de comisiones (sin tocar).

### **PROBLEMA CONOCIDO — TRUNCACIÓN DE ARCHIVOS**

⚠️ El Write tool de Claude trunca archivos grandes en disco (el archivo queda cortado a ~220 líneas).
**Solución:** Usar Python via bash para escribir/limpiar archivos:
```bash
# Escribir archivo completo
python3 -c "
content = '''...'''
with open('path/to/file.ts', 'w', encoding='ascii', errors='xmlcharrefreplace') as f:
    f.write(content)
"

# Limpiar null bytes / contenido duplicado después de export default
python3 -c "
with open('file.ts','rb') as f: c=f.read()
pos = c.rfind(b'export default router;\n')
with open('file.ts','wb') as f: f.write(c[:pos+len(b'export default router;\n')])
"

# Verificar truncación
tail -5 file.ts | cat -v
wc -l file.ts
```

### **PROCESO DE DEPLOY**

```
BACKEND (Railway):
  cd backend/
  railway up

FRONTEND (SiteGround, dominio real de producción: visionrosa.com):
  cd frontend/
  VITE_API_URL=https://alert-eagerness-production-8cbb.up.railway.app/api npm run build
  # El deploy de frontend SIEMPRE es manual por FTP -- Padrino sube frontend/dist/
  # el mismo por FTP a SiteGround. Claude solo hace el build local, NUNCA intenta
  # subir por FTP ni asume que el deploy quedó completo hasta que Padrino confirme.
  # Archivos a subir: index.html + assets/index-[hash].js + assets/index-[hash].css
  # NOTA: "comisiones.marykay.do" (mencionado en otras secciones de este doc) es
  # el dominio original planeado -- el dominio real en producción es visionrosa.com.

MIGRACIONES (si hay cambios en schema.prisma):
  # Opción A: en local con tunnel a Railway DB
  railway run npx prisma migrate deploy
  # Opción B: conectar DB local al .env de Railway y correr migrate deploy
```

