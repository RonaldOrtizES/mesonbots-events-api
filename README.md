# Mesonbots Events API

Servicio independiente para eventos, conversaciones y webhooks de WhatsApp dentro de la arquitectura de microservicios de Mesonbots.

## Responsabilidad

`mesonbots-events-api` administra:

- Webhooks entrantes de Meta WhatsApp y Twilio.
- Apertura, continuidad, escalado, cierre y archivo de conversaciones.
- Registro de mensajes inbound/outbound.
- Comunicación fire-and-forget con `mesonbots-ai-api`, si esta configurado.

Este servicio comparte la misma base de datos Neon Postgres y el mismo `JWT_SECRET` que `mesonbots-core-api`.

## Stack

- Node.js 20+
- TypeScript 5.6
- Express 4
- pg
- Zod
- jsonwebtoken
- helmet, cors, express-rate-limit
- dotenv
- dayjs

## Estructura

```text
mesonbots-events-api/
├── api/
│   └── index.ts
├── migrations/
│   └── 003_unique_open_conversation.sql
├── src/
│   ├── server.ts
│   ├── app.ts
│   ├── config/
│   │   └── env.ts
│   ├── db/
│   │   └── client.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── dual-auth.ts
│   │   └── error-handler.ts
│   ├── modules/
│   │   ├── conversaciones/
│   │   │   ├── conversaciones.routes.ts
│   │   │   ├── conversaciones.service.ts
│   │   │   └── conversaciones.types.ts
│   │   ├── mensajes/
│   │   │   ├── mensajes.routes.ts
│   │   │   └── mensajes.service.ts
│   │   └── webhooks/
│   │       ├── meta.handler.ts
│   │       ├── twilio.handler.ts
│   │       └── webhooks.routes.ts
│   ├── shared/
│   │   ├── ai-client.ts
│   │   └── core-client.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── jwt.ts
│       └── responses.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── vercel.json
```

## Configuracion Local

```bash
npm install
cp .env.example .env
npm run dev
```

El servidor local escucha en `PORT`, por defecto `3000`.

## Variables de Entorno

Configurar las variables de `.env.example`:

- `DATABASE_URL`: pooler de Neon Postgres compartido con core.
- `JWT_SECRET`: mismo secreto que `mesonbots-core-api`.
- `JWT_EXPIRES_IN`: compatibilidad con tokens del core.
- `META_VERIFY_TOKEN`: token para verificacion inicial de webhook. Opcional en local si no verificas Meta.
- `META_ACCESS_TOKEN`: opcional. El servicio no envia mensajes a Meta en modo de registro pasivo.
- `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`: opcionales.
- `CORE_API_URL`: URL publica del core. Opcional.
- `AI_API_URL`: URL publica de AI. Opcional; si falta, el webhook solo registra y omite IA.
- `CORS_ORIGINS`: origenes permitidos separados por coma.
- `NODE_ENV` y `PORT`.

## Migracion

Aplicar antes de recibir trafico concurrente:

```bash
psql "$DATABASE_URL" -f migrations/003_unique_open_conversation.sql
```

El indice `idx_unique_open_conversation` evita conversaciones abiertas duplicadas por race conditions en serverless.

## Deploy en Vercel

Variables **obligatorias** en Vercel (Settings → Environment Variables):

- `DATABASE_URL`
- `JWT_SECRET`

Sin esas dos, la funcion serverless falla al arrancar.

```bash
vercel link
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add META_VERIFY_TOKEN
vercel env add META_ACCESS_TOKEN
vercel env add CORE_API_URL
vercel env add AI_API_URL
vercel env add CORS_ORIGINS
vercel deploy --prod
```

Probar despues del deploy:

```bash
curl https://tu-proyecto.vercel.app/health
```

Si ves `503` con mensaje de configuracion, revisa las variables de entorno en Vercel.

## Conexion con Core API

El dashboard obtiene JWTs desde `mesonbots-core-api`. Este servicio valida esos JWTs localmente con el mismo `JWT_SECRET`, sin llamar al core para autenticar.

Los endpoints internos temporales para el bot reciben `tenantId` explicitamente en el body.

## Ejemplos de Curl

### Simular Webhook de Meta

```bash
curl -X POST http://localhost:3000/webhook/meta \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": { "phone_number_id": "123456789" },
          "contacts": [{ "profile": { "name": "Cliente Demo" } }],
          "messages": [{
            "id": "wamid.demo",
            "from": "50370000000",
            "type": "text",
            "text": { "body": "Hola, quiero informacion" }
          }]
        }
      }]
    }]
  }'
```

### Verificacion Inicial de Meta

```bash
curl "http://localhost:3000/webhook/meta?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=abc123"
```

### Login

El login vive en `mesonbots-core-api`. Usar el JWT emitido por core:

```bash
export JWT="<jwt-del-core-api>"
```

### Listar Conversaciones

```bash
curl "http://localhost:3000/api/conversaciones?estado=open&limit=20&offset=0" \
  -H "Authorization: Bearer $JWT"
```

### Registrar Mensaje Manual

```bash
curl -X POST http://localhost:3000/api/conversaciones/<conversation-id>/mensajes \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "contenido": "Hola, soy del equipo de Mesonbots. Te ayudo con gusto." }'
```

Este endpoint registra el mensaje como `outbound` en la base de datos. No envia nada a Meta.

### Registrar Mensaje desde AI API

```bash
curl -X POST http://localhost:3000/api/conversaciones/<conversation-id>/mensajes \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "contenido": "Claro, puedo ayudarte con eso.", "generatedByAi": true }'
```

## Endpoints

- `GET /health`
- `GET /webhook/meta`
- `POST /webhook/meta`
- `POST /webhook/twilio/sms`
- `POST /webhook/twilio/voice`
- `GET /api/conversaciones`
- `GET /api/conversaciones/:id`
- `GET /api/conversaciones/:id/mensajes`
- `POST /api/conversaciones/:id/mensajes`
- `PATCH /api/conversaciones/:id/estado`
- `POST /api/conversaciones/:id/tomar-control`
- `POST /api/conversaciones/:id/devolver-al-bot`
