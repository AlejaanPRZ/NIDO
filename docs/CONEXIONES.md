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
aleatorio, PKCE S256, `prompt=select_account consent`). Google considera las apps de escritorio clientes
públicos: su «secreto» no es confidencial y puede ir en la app. Permisos: `calendar.calendarlist.readonly`
(ver la lista de calendarios) y `calendar.events` (ver y editar eventos). Si el usuario desmarca alguno en
la pantalla de Google, Nido no guarda la conexión y lo explica.

### Una sola vez, para probar con tu cuenta (modo «En prueba»)

1. **Proyecto:** en [Google Cloud](https://console.cloud.google.com/projectcreate) crea un proyecto
   (por ejemplo «Nido») o elige uno tuyo.
2. **API:** en [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   pulsa **Habilitar**.
3. **Pantalla de consentimiento:** en [Google Auth Platform](https://console.cloud.google.com/auth/overview)
   → **Empezar**:
   - Información de la app: nombre «Nido» y tu correo de asistencia.
   - Público: **Externo** (con una cuenta @gmail.com no hay «Interno»).
   - Datos de contacto: tu correo. Acepta la política de datos de usuario.
4. **Permisos:** en **Acceso a datos** → **Añadir o quitar permisos**, marca
   `.../auth/calendar.calendarlist.readonly` y `.../auth/calendar.events` y guarda.
5. **Usuarios de prueba:** en **Público** → **Usuarios de prueba** → **Añadir usuarios**, añade tu correo
   de Google (y el de quien vaya a probar; máximo 100).
6. **Cliente:** en **Clientes** → **Crear cliente** → tipo **Aplicación de escritorio**, nombre «Nido».
   Pulsa **Descargar JSON** (`client_secret_….json`).
7. **En Nido:** desde la carpeta del proyecto,
   ```bash
   npm run oauth -- google "C:\ruta\client_secret_….json"
   ```
   Escribe `nido.oauth.json` (fuera de git). Cierra y abre Nido: «Conectar con Google» ya funciona.
   El JSON descargado no hace falta después.

Qué esperar en modo «En prueba»:
- Solo pueden conectar las cuentas añadidas como usuarios de prueba.
- Google muestra el aviso «Google no ha verificado esta aplicación»: pulsa **Continuar**.
- **La autorización caduca a los 7 días.** Nido lo detecta y muestra «Volver a conectar».

### Para distribuir Nido a otras personas

- **Publicar:** en **Público** → **Publicar app** (estado «En producción»). Así cualquier cuenta de Google
  puede intentar conectar y el acceso deja de caducar a los 7 días.
- **Verificación:** `calendar.events` es un permiso **sensible**. Sin verificar:
  - Todo el mundo ve el aviso de app no verificada.
  - Hay un límite de **100 usuarios nuevos en toda la vida del proyecto**, que no se puede reiniciar.
- La verificación pide:
  - Una página de inicio en un dominio propio verificado (Search Console).
  - Una política de privacidad en ese dominio, enlazada desde la pantalla de consentimiento.
  - Justificar cada permiso.
  - Un vídeo (en inglés) del flujo completo con la pantalla de consentimiento.
- Google indica unos días hábiles de revisión; en la práctica puede tardar semanas.
- Excepción: un uso personal con menos de 100 usuarios no necesita verificación, pero mantiene el aviso.
- Las cuentas de Google Workspace pueden tener bloqueadas las apps no verificadas por su administrador.
- **Instalador:** `npm run dist` copia `nido.oauth.json` junto a la app (`extraResources`).

Referencias: [OAuth para apps de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app),
[estado de publicación](https://support.google.com/cloud/answer/15549945),
[cuándo no hace falta verificar](https://support.google.com/cloud/answer/13464323),
[verificación de permisos sensibles](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

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
