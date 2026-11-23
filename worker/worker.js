/**
 * Profe EDO para Amira: servidor seguro (Cloudflare Worker).
 *
 * Qué hace:
 *  - Guarda la clave de la API de Anthropic como secreto (nunca llega al celular ni a GitHub).
 *  - Solo atiende a quien tenga el código de acceso.
 *  - Pone un tope diario de mensajes (si se conecta el almacén KV "USO").
 *  - Añade las instrucciones del profesor y el temario del sílabo, y reenvía la respuesta en vivo.
 *
 * Variables del Worker (Settings → Variables and Secrets):
 *  - ANTHROPIC_API_KEY  (secreto)  clave de console.anthropic.com
 *  - CODIGO_ACCESO      (secreto)  el código que usará Amira
 *  - ORIGEN_PERMITIDO   (texto)    https://alex1525-cloud.github.io   (se pueden poner varios separados por coma)
 *  - TOPE_DIARIO        (texto, opcional)  mensajes por día, por defecto 80
 *  - USO                (KV, opcional)     almacén para contar los mensajes del día
 */

const MODELO = 'claude-haiku-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const VERSION_API = '2026-10-21';
const MAX_CUERPO = 25 * 1024 * 1024; // 25 MB
const MAX_MENSAJES = 300;
const INICIO_CICLO = Date.UTC(2026, 7, 31, 5); // lunes 31/08/2026, 00:00 hora de Lima

const SEMANAS = [
  'Unidad I: EDO de primer orden, separación de variables',
  'Unidad I: EDO homogéneas y reducibles a homogéneas, EDO exactas',
  'Unidad I: factor de integración, EDO lineales de primer orden',
  'Unidad I: Bernoulli, Riccati, Clairaut y Lagrange; problemas de aplicación de primer orden',
  'Unidad II: EDO de orden superior con coeficientes constantes y variables, independencia lineal y Wronskiano',
  'Unidad II: homogéneas y no homogéneas, ecuación característica, coeficientes indeterminados',
  'Unidad II: variación de parámetros, ecuación de Euler (Cauchy-Euler), aplicaciones',
  'Evaluación parcial (Unidades I y II)',
  'Unidad III: sucesiones y series, criterios de convergencia, series de potencias, solución de EDO por series',
  'Unidad III: transformada de Laplace, definición, propiedades, transformada inversa',
  'Unidad III: solución de EDO con la transformada de Laplace y su inversa',
  'Unidad III: sistemas de EDO lineales',
  'Unidad IV: series de Fourier, definición y propiedades; transformada de Fourier y propiedades',
  'Unidad IV: transformada inversa de Fourier, problema de Sturm-Liouville, series de Bessel y de Legendre',
  'Unidad IV: ecuaciones en derivadas parciales, EDP separables, EDP de fenómenos físicos y de ingeniería',
  'Evaluación final',
];

const INSTRUCCIONES = `Eres "Profe EDO", un profesor particular de Ecuaciones Diferenciales, paciente, cálido y muy claro. Tu única alumna es Amira, estudiante de Ingeniería Civil (IV ciclo) de la Universidad Nacional de Barranca (Perú). Ella lleva el curso ES12-IC Ecuaciones Diferenciales, ciclo 2026-2 (31/08/2026 al 18/12/2026). Su amigo Alexander creó esta app para ella.

# Temario oficial de su sílabo (sigue este orden y estos nombres)
Unidad I. EDO ordinarias de primer orden
- Sem. 1: EDO de primer orden, método de separación de variables.
- Sem. 2: EDO homogéneas y reducibles a homogéneas; EDO exactas y su solución.
- Sem. 3: factor de integración; EDO lineales de primer orden.
- Sem. 4: EDO especiales: Bernoulli, Riccati, Clairaut y Lagrange; problemas de aplicación de primer orden.
Unidad II. EDO de orden superior
- Sem. 5: EDO de orden superior con coeficientes constantes y variables; independencia lineal y Wronskiano.
- Sem. 6: método de solución de EDO homogéneas y no homogéneas; ecuación característica; coeficientes indeterminados.
- Sem. 7: variación de parámetros; ecuaciones de Euler (Cauchy-Euler); problemas de aplicación.
- Sem. 8: evaluación.
Unidad III. Series y transformada de Laplace
- Sem. 9: sucesiones y series, criterios de convergencia, series de potencias y solución de EDO por series.
- Sem. 10: transformada de Laplace: definición, propiedades, transformada inversa.
- Sem. 11: solución de EDO mediante la transformada de Laplace y su inversa.
- Sem. 12: sistemas de EDO lineales.
Unidad IV. Series de Fourier y EDP
- Sem. 13: series de Fourier (definición y propiedades); transformada de Fourier y propiedades.
- Sem. 14: transformada inversa de Fourier; problema de Sturm-Liouville; series de Bessel y de Legendre.
- Sem. 15: ecuaciones en derivadas parciales; EDP separables (calor, onda, Laplace); EDP de fenómenos físicos y de ingeniería.
- Sem. 16: evaluación final.
Su profesor evalúa el dominio conceptual y procedimental, el razonamiento, y el uso correcto de la notación y el lenguaje matemático. Cuando venga al caso, usa ejemplos de Ingeniería Civil (vigas, vibraciones de estructuras, enfriamiento del concreto, flujo de calor, tanques y mezclas, deflexión, cables).

# Cómo enseñas
1. Si ella manda una foto, primero transcribe el enunciado en LaTeX y pregúntale si lo leíste bien. Si una parte no se lee, dilo y pide que la confirme. No resuelvas hasta que confirme (salvo que ella diga que está bien o pida la solución completa).
2. Antes de resolver, ayúdala a CLASIFICAR la ecuación: orden, linealidad y tipo (separable, homogénea, exacta, lineal, Bernoulli, etc.). Pregúntale qué tipo cree que es y explica la pista que lo delata.
3. Avanza UN paso por mensaje. Cada paso: qué se hace, por qué se hace y la operación. Termina con una pregunta corta que la invite a hacer o pensar el siguiente paso (por ejemplo: "¿Qué crees que hacemos con el factor integrante ahora?").
4. Si ella responde con un intento, revísalo con cuidado. Si está bien, felicítala de forma concreta. Si hay un error, señala exactamente dónde y por qué, sin dar toda la respuesta de golpe.
5. Al terminar un ejercicio: verifica la solución (sustituye en la EDO o en la condición inicial) y cierra con un resumen del método en 3 líneas, listo para su cuaderno.
6. Si su mensaje empieza con "[Modo: solución completa]", resuelve TODO el ejercicio de una vez, ordenado en pasos numerados con su justificación, verificación y resumen final.
7. Si pide teoría, explica con intuición primero, luego la fórmula, y un ejemplo corto resuelto. Menciona errores típicos de examen.
8. Si ella pide practicar, propón un ejercicio del tema, de dificultad parecida a un examen universitario, sin la solución; luego corrige su respuesta.

# Rigor
- Haz las cuentas con cuidado y revisa cada derivada, integral y constante. Nunca inventes un resultado: si no estás seguro de un paso, dilo y verifícalo.
- Cuida las constantes de integración, los valores absolutos en los logaritmos, las soluciones singulares que se pierden al dividir, y el dominio de la solución.
- Usa la notación habitual en Perú y en libros como Zill y Espinoza Ramos: y', dy/dx, $\\mathcal{L}\\{f(t)\\}$, $C_1, C_2$.

# Formato (muy importante, se lee en un celular)
- Escribe en español peruano, tono cercano y motivador, sin exagerar. Puedes llamarla por su nombre a veces.
- Mensajes cortos: máximo unas 12 líneas por paso, salvo en modo solución completa.
- TODA la matemática en LaTeX: en línea con $...$ y en bloque con $$...$$ (cada bloque en su propia línea). No uses \\( \\) ni \\[ \\]. No pongas matemática dentro de bloques de código.
- Usa **negritas** para lo clave y listas numeradas para pasos. No uses tablas anchas.
- No uses emojis salvo uno ocasional de ánimo.

# Límites
- Solo enseñas matemáticas del curso y temas cercanos (cálculo, álgebra lineal, física e ingeniería aplicadas a EDO). Si te pide algo ajeno, respóndele con amabilidad que aquí solo ves EDO y temas del curso.
- Si te pregunta quién eres: eres su profe virtual de EDO, hecho por Alexander con un modelo de IA. Puedes equivocarte, así que en exámenes y notas lo que manda es su profesor.`;

function semanaActual(ahora) {
  const n = Math.floor((ahora - INICIO_CICLO) / (7 * 864e5)) + 1;
  if (n < 1) return 'El ciclo todavía no empieza.';
  if (n > 16) return 'El ciclo ya terminó; ayúdala a repasar lo que necesite.';
  return `Esta es la semana ${n} de 16 del ciclo. En clase toca: ${SEMANAS[n - 1]}.`;
}

function fechaLima(ahora) {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ahora));
}

function cabecerasCors(req, env) {
  const origen = req.headers.get('Origin') || '';
  const permitidos = (env.ORIGEN_PERMITIDO || 'https://alex1525-cloud.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const ok = permitidos.includes('*') || permitidos.includes(origen);
  return {
    'Access-Control-Allow-Origin': ok ? origen : permitidos[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Codigo',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}

function igualSeguro(a, b) {
  a = String(a || ''); b = String(b || '');
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0 && b.length > 0;
}

const TIPOS_USUARIO = new Set(['text', 'image']);
const TIPOS_ASISTENTE = new Set(['text', 'thinking', 'redacted_thinking']);
const IMAGENES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Revisa que la conversación tenga la forma correcta; devuelve un texto de error o null. */
function validar(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'No hay mensajes.';
  if (messages.length > MAX_MENSAJES) return 'La conversación es muy larga; empieza una nueva.';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const rol = i % 2 === 0 ? 'user' : 'assistant';
    if (!m || m.role !== rol) return 'El orden de los mensajes no es válido.';
    if (typeof m.content === 'string') continue;
    if (!Array.isArray(m.content) || m.content.length === 0) return 'Hay un mensaje vacío.';
    const permitidos = rol === 'user' ? TIPOS_USUARIO : TIPOS_ASISTENTE;
    for (const b of m.content) {
      if (!b || !permitidos.has(b.type)) return 'Hay un bloque de mensaje no permitido.';
      if (b.type === 'image' && !(b.source && b.source.type === 'base64' && IMAGENES.has(b.source.media_type))) return 'Formato de imagen no permitido.';
    }
  }
  if (messages[messages.length - 1].role !== 'user') return 'El último mensaje debe ser de Amira.';
  return null;
}

function sinPensamientos(messages) {
  return messages.map(m => (m.role === 'assistant' && Array.isArray(m.content))
    ? { role: 'assistant', content: m.content.filter(b => b.type === 'text') }
    : m).filter(m => typeof m.content === 'string' || m.content.length > 0);
}

async function llamarModelo(env, messages, ahora) {
  const cuerpo = {
    model: MODELO,
    max_tokens: 16000,
    stream: true,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: [
      { type: 'text', text: INSTRUCCIONES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Hoy es ${fechaLima(ahora)} (hora de Lima). ${semanaActual(ahora)}` },
    ],
    messages,
  };
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': VERSION_API },
    body: JSON.stringify(cuerpo),
  });
}

async function contarUso(env) {
  if (!env.USO) return { ok: true };
  const tope = parseInt(env.TOPE_DIARIO || '80', 10);
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const clave = `uso:${dia}`;
  const usados = parseInt((await env.USO.get(clave)) || '0', 10);
  if (usados >= tope) return { ok: false, tope };
  await env.USO.put(clave, String(usados + 1), { expirationTtl: 3 * 86400 });
  return { ok: true, usados: usados + 1, tope };
}

export default {
  async fetch(req, env) {
    const cors = cabecerasCors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (req.method !== 'POST') return json({ ok: true, app: 'Profe EDO' }, 200, cors);

    if (!env.ANTHROPIC_API_KEY || !env.CODIGO_ACCESO) return json({ error: 'El servidor aún no está configurado (falta la clave o el código).' }, 500, cors);
    if (!igualSeguro(req.headers.get('X-Codigo'), env.CODIGO_ACCESO)) return json({ error: 'Código de acceso incorrecto.' }, 401, cors);

    if (url.pathname.endsWith('/verificar')) return json({ ok: true }, 200, cors);

    const largo = parseInt(req.headers.get('Content-Length') || '0', 10);
    if (largo > MAX_CUERPO) return json({ error: 'La foto es demasiado pesada.' }, 413, cors);

    let datos;
    try { datos = await req.json(); } catch { return json({ error: 'Pedido no válido.' }, 400, cors); }
    const error = validar(datos && datos.messages);
    if (error) return json({ error }, 400, cors);

    const uso = await contarUso(env);
    if (!uso.ok) return json({ error: `Llegaste al tope de ${uso.tope} mensajes de hoy. Mañana se reinicia.` }, 429, cors);

    const ahora = Date.now();
    let resp = await llamarModelo(env, datos.messages, ahora);
    if (resp.status === 400) {
      // Si el historial guardado tiene un pensamiento que la API ya no acepta, se reintenta sin pensamientos.
      const detalle = await resp.text();
      if (/thinking|signature/i.test(detalle)) resp = await llamarModelo(env, sinPensamientos(datos.messages), ahora);
      else return json({ error: 'La IA no aceptó el pedido.', detalle: detalle.slice(0, 500) }, 400, cors);
    }
    if (!resp.ok) {
      const detalle = (await resp.text()).slice(0, 500);
      const msg = resp.status === 429 || resp.status === 529 ? 'La IA está muy ocupada; intenta en un minuto.'
        : resp.status === 401 || resp.status === 403 ? 'La clave de la IA no es válida o se acabó el saldo.'
        : 'La IA respondió con un error.';
      return json({ error: msg, detalle }, resp.status === 401 ? 502 : resp.status, cors);
    }
    return new Response(resp.body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', ...cors },
    });
  },
};

