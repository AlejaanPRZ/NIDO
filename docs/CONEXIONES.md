# Conexiones con Google Calendar y Notion

Para el usuario, conectar es un botón: «Conectar con Google» o «Conectar con Notion» abre el
navegador del sistema, el usuario inicia sesión en la web oficial del servicio y autoriza a Nido.
Nido nunca ve contraseñas ni muestra formularios de inicio de sesión.

Para que esos botones funcionen, **quien publica Nido** tiene que registrar la app una vez en cada
servicio. Esa configuración del desarrollador va en `nido.oauth.json` (raíz del proyecto, fuera de
git; plantilla en `nido.oauth.example.json`). `npm run dist` la copia junto a la app instalada.
Sin ella, Ajustes ofrece las alternativas avanzadas (cliente de Google propio o token interno de Notion).

## Google Calendar

Flujo: OAuth 2.0 para apps de escritorio (navegador del sistema, redirección a `127.0.0.1` en un puerto
aleatorio, PKCE S256). Google considera las apps de escritorio clientes públicos: su «secreto» no es
confidencial y puede ir en la app. Permisos: `calendar.calendarlist.readonly` y `calendar.events`.

1. En [Google Cloud](https://console.cloud.google.com/projectcreate), crea un proyecto y habilita
   **Google Calendar API**.
2. En **Google Auth Platform → Branding**, rellena nombre (Nido), correo de asistencia y logo.
3. En **Audience**, elige **Externo**. Mientras esté «En prueba», solo entran los usuarios de prueba
   que añadas (hasta 100) y Google caduca el acceso cada 7 días.
4. En **Data access**, añade los dos permisos de arriba.
5. En **Clients → Create client**, tipo **Aplicación de escritorio**. Copia el ID y el secreto en
   `nido.oauth.json` → `google.clientId` y `google.clientSecret`.
6. Para que cualquiera pueda conectar sin la pantalla de «app no verificada» y sin caducar a los 7 días:
   **Publicar la app** y pasar la verificación de Google (`calendar.events` es un permiso sensible:
   pide política de privacidad, dominio verificado y un vídeo del uso).

## Notion

Flujo: integración pública de Notion (OAuth). El usuario elige en Notion el espacio y las páginas o
bases de datos que comparte; si entra en Notion con Google, eso ocurre dentro de la página de Notion
y no autoriza nada en Google Calendar.

Notion exige un **secreto de cliente confidencial** para canjear el código, y una app de escritorio no
puede guardarlo. Por eso hay un intercambiador mínimo en `server/notion-oauth/` (Cloudflare Worker sin
dependencias) que guarda el secreto, canjea códigos y renueva tokens. No guarda nada más y **no forma
parte de la app distribuida**.

1. En [Notion Developers](https://www.notion.so/profile/integrations), crea una integración
   **pública**, con capacidades de leer, actualizar e insertar contenido.
2. Despliega el intercambiador:
   ```bash
   cd server/notion-oauth
   npx wrangler deploy
   npx wrangler secret put NOTION_CLIENT_ID
   npx wrangler secret put NOTION_CLIENT_SECRET
   ```
   y pon su URL pública en `PUBLIC_URL` (`wrangler.toml`).
3. En la integración, añade como URI de redirección `https://<tu-worker>/callback`.
4. En `nido.oauth.json` → `notion.clientId` (el ID de la integración) y `notion.brokerUrl`
   (la URL del Worker, solo https).
5. Notion revisa las integraciones públicas antes de activar su URL de autorización para todos.

Seguridad del intercambio: el `state` lleva el puerto local de Nido, un valor aleatorio y el hash de un
verificador que solo conoce Nido. El Worker solo canjea el código si recibe ese verificador (como PKCE)
y solo redirige a `127.0.0.1`. Los tokens se guardan cifrados con DPAPI (`safeStorage`) en el equipo.

## Probar sin cuentas reales

```bash
node server/notion-oauth/dev.mjs
```
ejecuta el intercambiador en local (`PORT`, `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `PUBLIC_URL`
y `NOTION_API` por entorno). Con las variables `NIDO_*` de CLAUDE.md («Pruebas») y
`NIDO_OAUTH_CONFIG=<json de prueba>`, Nido completa los flujos contra servicios simulados.
