# Nido

Panel de widgets para el escritorio de Windows. Reúne en una sola ventana las cosas que
normalmente están repartidas entre pestañas y aplicaciones: notas, tareas, calendario,
música local, radio, el tiempo y paneles web incrustados.

Aplicación de escritorio hecha con Electron, React y TypeScript. Proyecto personal, en
desarrollo activo.

**Versión actual:** 0.3.0 · **Plataforma:** Windows

---

## Qué hace

**Espacios configurables.** Los widgets se colocan arrastrándolos sobre una rejilla, se
redimensionan y se agrupan en espacios distintos (trabajo, ocio, lo que haga falta). La
distribución se guarda y se restaura al abrir.

**25 widgets.** Notas, tareas, calendario, reproductor de música local, «Ahora suena»
(detecta lo que reproduce el sistema), radio, RSS, el tiempo, reloj mundial, pomodoro,
temporizador, calculadora, conversor de unidades, hábitos, festivos, lanzador de
aplicaciones, archivos recientes, buscador, estado del sistema, enlaces, imágenes y
paneles web.

**Integraciones.** Tareas y listas de Notion, y Google Calendar con creación y edición de
eventos. La conexión se hace desde la propia aplicación mediante OAuth.

**Detalles de uso.** Icono en la bandeja del sistema con atajo global, recorrido de
bienvenida al primer arranque, buscador de comandos, actualizaciones automáticas y varios
temas visuales.

---

## Cómo está hecho

| Capa | Tecnología |
| --- | --- |
| Escritorio | Electron 45 |
| Interfaz | React 18 + TypeScript |
| Compilación | electron-vite + Vite 7 |
| Rejilla | react-grid-layout |
| Pruebas | Vitest |
| Instalador | electron-builder (NSIS) |

El código está separado en tres partes: `src/main` (proceso principal de Electron:
almacenamiento, OAuth, integraciones, bandeja, actualizaciones), `src/renderer` (la
interfaz y los widgets) y `src/shared` (tipos comunes a ambos).

---

## Ponerlo en marcha

Requiere Node.js 18 o superior.

```bash
npm install     # instalar dependencias
npm run dev     # arrancar en modo desarrollo
npm test        # ejecutar las pruebas
npm run build   # compilar
npm run dist    # generar el instalador para Windows
```

Las integraciones con Notion y Google necesitan credenciales propias. El proceso está
explicado en [`docs/CONEXIONES.md`](docs/CONEXIONES.md) y hay un asistente:

```bash
npm run oauth
```

Sin configurarlas, el resto de la aplicación funciona igual: solo quedan inactivos los
widgets que dependen de esos servicios.

---

## Pruebas

Vitest cubre el almacenamiento, el motor de distribución de la rejilla y los clientes de
Notion y Google.

```bash
npm test
```

---

## Estado y siguientes pasos

Funciona y se usa a diario, pero sigue en desarrollo. Pendiente:

- Versiones para macOS y Linux (ahora solo se genera instalador de Windows)
- Más integraciones
- Ampliar la cobertura de pruebas en la interfaz

---

## Autor

Alejandro Pérez Marco — [github.com/AlejaanPRZ](https://github.com/AlejaanPRZ)
