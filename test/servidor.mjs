// Servidor de prueba: sirve la página y ejecuta el Worker real con una IA simulada.
// Uso: node test/servidor.mjs   → http://localhost:8787/?api=http://localhost:8787
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import worker from '../worker/worker.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const pedidos = [];
const kv = new Map();
const env = {
  ANTHROPIC_API_KEY: 'sk-prueba', CODIGO_ACCESO: 'amira123', ORIGEN_PERMITIDO: '*', TOPE_DIARIO: '50',
  USO: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) },
};

const RESPUESTA = `¡Buena, Amira! Primero **clasifiquemos** la ecuación:

$$\\frac{dy}{dx} + \\frac{2}{x}\\,y = x^{2}\\,y^{3}$$

1. Es de **primer orden**.
2. Tiene $y^{n}$ con $n = 3$ en el lado derecho, así que es de **Bernoulli**.

El cambio es $v = y^{1-n} = y^{-2}$, entonces $\\dfrac{dv}{dx} = -2y^{-3}\\dfrac{dy}{dx}$.

¿Qué crees que pasa si multiplicamos toda la ecuación por $-2y^{-3}$?`;

function sse(ev) { return `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`; }

const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.anthropic.com')) return fetchReal(url, init);
  const cuerpo = JSON.parse(init.body);
  pedidos.push({ headers: init.headers, cuerpo });
  const partes = [];
  partes.push(sse({ type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: cuerpo.model } }));
  partes.push(sse({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }));
  partes.push(sse({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'firma-abc' } }));
  partes.push(sse({ type: 'content_block_stop', index: 0 }));
  partes.push(sse({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }));
  for (let i = 0; i < RESPUESTA.length; i += 25) partes.push(sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: RESPUESTA.slice(i, i + 25) } }));
  partes.push(sse({ type: 'content_block_stop', index: 1 }));
  partes.push(sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 120 } }));
  partes.push(sse({ type: 'message_stop' }));
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) { for (const p of partes) { c.enqueue(enc.encode(p)); await new Promise(r => setTimeout(r, 8)); } c.close(); },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

export function iniciar(puerto = 8787) {
  const srv = http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/index.html'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(path.join(dir, '..', 'index.html')));
    }
    if (req.method === 'GET' && req.url.startsWith('/lib/')) {
      const f = path.join(dir, '..', decodeURIComponent(req.url.split('?')[0]));
      const tipo = f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
      try { res.writeHead(200, { 'Content-Type': tipo }); return res.end(readFileSync(f)); } catch { res.writeHead(404); return res.end(); }
    }
    const trozos = []; for await (const t of req) trozos.push(t);
    const body = trozos.length ? Buffer.concat(trozos) : undefined;
    const r = new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
    const out = await worker.fetch(r, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    if (out.body) { const rd = out.body.getReader(); for (;;) { const { value, done } = await rd.read(); if (done) break; res.write(value); } }
    res.end();
  });
  return new Promise(ok => srv.listen(puerto, () => ok(srv)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) iniciar().then(() => console.log('http://localhost:8787/?api=http://localhost:8787'));
