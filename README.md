# Chiffre & Chaos · Arcana et Chaos

Simulador web en tiempo real del juego de examen de Criptografía (UNJBG): los **líderes** de 3 a 6 cónclaves compiten por responder preguntas, mientras los **40 Arcanos** (cartas) les permiten salvarse o hundir a los demás. El docente dirige la partida.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TanStack Router (file-based) + TanStack Query, Tailwind v4, componentes estilo shadcn (Radix), GSAP, Vite |
| Backend | **Hono** sobre Bun (REST + WebSocket), Zod |
| Datos | **Drizzle ORM** + PostgreSQL (Neon, driver `postgres`) |
| Auth | **better-auth** con el plugin **admin** (roles `admin`/`user`, permisos propios, vetos) |

El estado de cada sala vive en memoria del servidor (autoritativo) y se difunde por WebSocket; los resultados, preguntas y ajustes se guardan en PostgreSQL.

## Puesta en marcha

```bash
bun install
cp .env.example .env      # define DATABASE_URL (PostgreSQL) y BETTER_AUTH_SECRET
bun run dev               # API :3001 + web :3000 (proxy /api)
```

Abre <http://localhost:3000>. **La primera cuenta registrada es administradora** (o define `ADMIN_EMAILS=a@b.com,c@d.com`).

Producción: `bun run build && bun run start` (Hono sirve `dist/` y la API en `PORT`). Necesita un host con WebSockets persistentes (VPS, Fly, Railway, Render…); **no** sirve en Vercel serverless.

## Cómo se juega

1. El docente crea una sala (puede dirigir sin jugar o también como líder) y comparte el código.
2. Se necesitan **≥ 3 líderes conectados**. Para ensayar en solitario el docente puede añadir *cultistas* (bots).
3. Cada líder recibe 7 arcanos boca abajo (6 si hay 6 equipos: el mazo tiene 40) y 3 fichas (integrantes).
4. Por pregunta: un dado (CSPRNG) elige un equipo, 30 s. Acierto +2; si falla, otro dado elige a otro equipo: acierto +1; si no, se descarta.
5. Durante esos 30 s todos pueden jugar arcanos. Al terminar la pregunta N‑2 los arcanos se retiran (−1 por carta sin usar).
6. Conversar con otro equipo cuesta 1 punto (susurros). Los equipos con más de 20 pts donan el excedente.
7. Al final: podio, nota de cada integrante (los retirados conservan la nota que tenía su equipo al salir) e historial.

Las reglas completas de los 40 arcanos están en `/grimorio` y en `shared/cards.ts`; la implementación en `server/game/cards.ts`.

### Interpretaciones donde el instructivo era ambiguo
- **Compañía de querubines**: cada equipo gana 1 punto por cada integrante que le falte para llegar a 4.
- **El quita trampas**: se puede activar cuando *algún* equipo tiene más de 6 puntos.
- **Dadofón / El acertado**: el efecto lo determina el número del dado; las elecciones (objetivos) se piden después.
- **Dado caridad**: el dado tiene tantas caras como equipos; "negar" abre una votación de unos segundos.
- **Escudo / Apostador / Segunda opinión** son reactivas: se ofrecen automáticamente cuando corresponde. Un equipo con *Símbolo de la amistad* se considera protegido de todo efecto adverso.
- Puntajes nunca bajan de 0; el tope final es `scoreCap` (20).

## Preguntas

~176 preguntas sembradas en `server/data/questions.ts`:
- **📜 Semanario 1‑7**: basadas estrictamente en los PDF (con etiqueta de semana).
- **✦ Libre · general**: añadidas por afinidad temática (AES, hashes, TLS, historia…). Se muestran con otra etiqueta durante la partida.

El administrador (`/admin`) puede crear/editar/desactivar preguntas (4 alternativas, correcta, etiqueta de origen, semana, explicación), ajustar tiempos y puntos, gestionar roles y cerrar salas.

## Pruebas

```bash
bun scripts/engine-test.ts   # juega los 40 arcanos con bots y comprueba invariantes
bun scripts/simulate.ts      # partida completa con cuentas y WebSockets reales (API en :3001)
bun run typecheck
```
