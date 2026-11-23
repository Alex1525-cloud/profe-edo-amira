# Profe EDO para Amira

Profesor virtual de Ecuaciones Diferenciales (curso ES12-IC, UNAB 2026-2). Amira escribe sus dudas o manda la foto de un ejercicio, y el profe la guía paso a paso con las fórmulas bien dibujadas.

- `index.html`: la página que se abre en el celular (GitHub Pages). Guarda el historial solo en el celular de Amira.
- `lib/`: KaTeX, marked y DOMPurify copiados aquí para que la página no dependa de otros servidores.
- `worker/worker.js`: el servidor seguro en Cloudflare. Guarda la clave de la IA, revisa el código de acceso y añade las instrucciones del profe y el temario del sílabo.
- `test/`: pruebas con una IA simulada (`node test/prueba.mjs`, necesita Playwright).

## Instalación (una sola vez, unos 15 minutos)

### 1. Saldo y clave de la IA (Anthropic)
1. Entra a https://console.anthropic.com y crea tu cuenta (es distinta de la suscripción de Claude.ai).
2. En **Billing**, carga el saldo mínimo que acepte la consola. Con un uso normal se gasta alrededor de US$ 1 a 2 al mes.
3. Si la consola te deja poner un **límite de gasto mensual**, ponlo en US$ 3.
4. En **API Keys**, crea una clave llamada `profe-edo` y cópiala. No la pegues en ningún archivo ni chat.

### 2. El servidor seguro (Cloudflare Worker, gratis)
1. Crea tu cuenta en https://dash.cloudflare.com.
2. Ve a **Workers & Pages → Create → Create Worker**. Ponle de nombre `profe-edo` y pulsa **Deploy**.
3. Pulsa **Edit code**, borra todo lo que hay, pega el contenido de `worker/worker.js` y pulsa **Deploy**.
4. En el Worker, ve a **Settings → Variables and Secrets** y agrega:
   - `ANTHROPIC_API_KEY` (tipo **Secret**): la clave del paso 1.
   - `CODIGO_ACCESO` (tipo **Secret**): el código que le darás a Amira (por ejemplo una palabra y 4 números).
   - `ORIGEN_PERMITIDO` (tipo **Text**): `https://alex1525-cloud.github.io`
   - `TOPE_DIARIO` (tipo **Text**, opcional): mensajes por día, por ejemplo `80`.
5. Tope diario (opcional, recomendado): en **Storage & Databases → KV**, crea un espacio llamado `profe-edo-uso`. Luego en el Worker, **Settings → Bindings → Add → KV namespace**, con nombre de variable `USO` y ese espacio.
6. Copia la dirección del Worker (termina en `.workers.dev`). Esa dirección no es secreta.

### 3. La página
1. En `index.html`, cambia `https://profe-edo.REEMPLAZAR.workers.dev` por la dirección del Worker.
2. En el repositorio de GitHub: **Settings → Pages → Branch: main / root → Save**.
3. Envía a Amira el link de la página y su código de acceso. En el celular puede usar **Agregar a pantalla de inicio** para tenerla como app.

## Costos
- GitHub Pages y Cloudflare Workers: gratis (el Worker gratis permite 100 mil pedidos al día).
- IA: Claude Haiku 5.5, US$ 0.10 por millón de tokens de entrada y US$ 0.50 por millón de salida. Un mensaje con foto cuesta alrededor de US$ 0.0015.
