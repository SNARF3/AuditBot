# AuditBot v2

Herramienta de auditoría de TI asistida por IA basada en el marco **COBIT 4.1**. Permite gestionar entidades auditadas, cargar documentos, analizar cobertura de procesos, generar hallazgos y producir informes formales, todo con apoyo de modelos de lenguaje (Gemini y Ollama).

---

## Estructura del repositorio

```
auditbot-v2/
├── backend/          # API REST (FastAPI + Python)
├── frontend/         # SPA (React + Vite + Tailwind)
├── docker-compose.yml
├── start.sh          # Script de inicio local (sin Docker)
└── .gitignore
```

---

## Stack tecnológico

### Backend
| Tecnología | Rol |
|---|---|
| Python 3.11 | Lenguaje principal |
| FastAPI | Framework API REST + WebSockets |
| SQLModel + SQLite | ORM y base de datos local |
| aiosqlite | Acceso asíncrono a SQLite |
| Gemini API | Análisis IA (cobertura, hallazgos, copilot) |
| Ollama (llama3.2:3b) | LLM local opcional |
| MarkItDown | Extracción de texto de documentos |
| ReportLab + python-docx | Generación de informes PDF/DOCX |

### Frontend
| Tecnología | Rol |
|---|---|
| React 19 | UI |
| Vite 5 | Build tool / dev server |
| Tailwind CSS | Estilos |
| React Router v6 | Navegación SPA |
| Recharts | Gráficas de cobertura |
| Lucide React | Iconografía |
| xlsx | Exportación a Excel |

---

## Funcionalidades principales

- **Setup** — Configuración de API key de Gemini y detección de Ollama local
- **Entidades** — Gestión de empresas/organizaciones auditadas con alcance COBIT
- **Documentos** — Carga, clasificación y fragmentación de documentos (PDF, DOCX, TXT, etc.)
- **Cobertura COBIT** — Mapeo automático de evidencia a los 34 procesos de COBIT 4.1
- **Análisis IA** — Análisis profundo por proceso con Gemini; detección de brechas
- **Hallazgos** — Gestión de hallazgos (manuales, por regla automática o sugeridos por IA)
- **Inconsistencias** — Detección de contradicciones entre documentos
- **Trazabilidad** — Vinculación entre hallazgos, procesos y fragmentos de evidencia
- **Copilot** — Chat contextual sobre la auditoría activa
- **Informe** — Generación de informe formal en PDF/DOCX
- **WebSockets** — Progreso en tiempo real durante análisis largos

---

## Endpoints de la API

La API corre en `http://localhost:8000`. Documentación interactiva en `/docs`.

| Prefijo | Descripción |
|---|---|
| `/setup` | Configuración del sistema |
| `/entities` | CRUD de entidades auditadas |
| `/entities/{id}/documents` | Carga y gestión de documentos |
| `/entities/{id}/coverage` | Cobertura de procesos COBIT |
| `/entities/{id}/analysis` | Análisis IA por proceso |
| `/entities/{id}/findings` | Hallazgos de auditoría |
| `/entities/{id}/traceability` | Trazabilidad de evidencia |
| `/entities/{id}/report` | Generación de informes |
| `/entities/{id}/copilot` | Chat IA contextual |
| `/entities/{id}/inconsistencies` | Detección de inconsistencias |
| `/ws/{entity_id}` | WebSocket para progreso en tiempo real |
| `/health` | Health check |
| `/gemini/usage` | Uso diario de la API de Gemini |

---

## Requisitos previos

- Python 3.11+
- Node.js 18+
- Una [Gemini API Key](https://aistudio.google.com/app/apikey) (gratuita)
- Docker y Docker Compose *(solo para despliegue con contenedores)*
- Ollama *(opcional, para LLM local)*

---

## Instalación y ejecución

### Opción 1 — Script local (recomendado para desarrollo)

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd auditbot-v2

# Dar permisos y ejecutar
chmod +x start.sh
./start.sh
```

El script:
1. Crea automáticamente el entorno virtual de Python e instala dependencias
2. Instala las dependencias de Node si no existen
3. Levanta backend en el puerto `8000` y frontend en el `3000`

### Opción 2 — Manual

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
mkdir -p data/documents
uvicorn main:app --reload --port 8000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev -- --port 3000
```

### Opción 3 — Docker Compose

```bash
docker compose up --build
```

Levanta tres servicios: `backend`, `frontend` y `ollama` (con modelo `llama3.2:3b` precargado).

---

## URLs de acceso

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Documentación API | http://localhost:8000/docs |
| Ollama (Docker) | http://localhost:11434 |

---

## Configuración inicial

1. Abrir `http://localhost:3000`
2. En la pantalla de **Setup**, ingresar la Gemini API Key
3. (Opcional) Activar Ollama si está disponible localmente
4. Crear una entidad auditada y comenzar a cargar documentos

---

## Variables de entorno

| Variable | Servicio | Descripción | Default |
|---|---|---|---|
| `DATABASE_URL` | Backend | URL de conexión a SQLite | `sqlite+aiosqlite:///./data/auditbot.db` |
| `OLLAMA_URL` | Backend | URL del servidor Ollama | `http://ollama:11434` |
| `VITE_API_URL` | Frontend | URL base del backend | `http://localhost:8000` |

---

## Modelo de datos principal

```
Entity (empresa auditada)
  └── Document (documentos cargados)
        └── DocumentFragment (fragmentos extraídos)
              └── CobitCoverage (mapeo a procesos COBIT 4.1)
                    └── Finding (hallazgos de auditoría)
```

---

## Límites de uso

- **Gemini API (gratuita):** 250 requests/día. El endpoint `/gemini/usage` muestra el consumo actual.
- **Ollama:** Sin límite, corre localmente. Requiere hardware suficiente para `llama3.2:3b`.

---

## Marco COBIT 4.1

El sistema cubre los **34 procesos** de los 4 dominios de COBIT 4.1:

| Dominio | Sigla | Descripción |
|---|---|---|
| Planear y Organizar | PO | Estrategia y organización de TI |
| Adquirir e Implementar | AI | Adquisición y desarrollo de soluciones |
| Entregar y Dar Soporte | DS | Entrega de servicios y soporte |
| Monitorear y Evaluar | ME | Supervisión y evaluación |
