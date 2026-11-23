// Prueba de punta a punta en tamaño celular: código, foto, respuesta en vivo con fórmulas, historial.
// Uso: node test/prueba.mjs [carpeta-capturas]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { iniciar, pedidos } from './servidor.mjs';
import worker from '../worker/worker.js';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const capturas = process.argv[2] || '.';
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fallos++; };

// 1) Worker solo
const env0 = { ANTHROPIC_API_KEY: 'k', CODIGO_ACCESO: 'amira123' };
let r = await worker.fetch(new Request('http://x/chat', { method: 'POST', headers: { 'X-Codigo': 'otro' }, body: '{}' }), env0);
ok(r.status === 401, 'rechaza un código incorrecto');
r = await worker.fetch(new Request('http://x/chat', { method: 'POST', headers: { 'X-Codigo': 'amira123' }, body: JSON.stringify({ messages: [{ role: 'assistant', content: 'hola' }] }) }), env0);
ok(r.status === 400, 'rechaza una conversación mal formada');
r = await worker.fetch(new Request('http://x/chat', { method: 'POST', headers: { 'X-Codigo': 'amira123' }, body: JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'tool_use', id: 'a', name: 'b', input: {} }] }] }) }), env0);
ok(r.status === 400, 'rechaza bloques no permitidos');
r = await worker.fetch(new Request('http://x/', { method: 'OPTIONS', headers: { Origin: 'https://alex1525-cloud.github.io' } }), env0);
ok(r.headers.get('Access-Control-Allow-Origin') === 'https://alex1525-cloud.github.io', 'CORS permite la página de GitHub');
r = await worker.fetch(new Request('http://x/', { method: 'OPTIONS', headers: { Origin: 'https://otra.com' } }), env0);
ok(r.headers.get('Access-Control-Allow-Origin') !== 'https://otra.com', 'CORS no permite otras páginas');

// 2) Página + Worker con IA simulada
const srv = await iniciar(8787);
const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['iPhone 13'] });
const pag = await ctx.newPage();
const errores = []; pag.on('pageerror', e => errores.push(e.message));
await pag.goto('http://localhost:8787/?api=http://localhost:8787', { waitUntil: 'networkidle' });
ok(await pag.isVisible('#acceso'), 'pide el código al entrar');
await pag.screenshot({ path: path.join(capturas, '1-codigo.png') });
await pag.fill('#codigo', 'malo'); await pag.click('.entrar');
await pag.waitForFunction(() => /no es correcto|incorrecto/i.test(document.querySelector('#errAcceso').textContent));
ok(true, 'avisa si el código está mal');
await pag.fill('#codigo', 'amira123'); await pag.click('.entrar');
await pag.waitForSelector('#acceso', { state: 'hidden' });
ok(true, 'entra con el código correcto');
await pag.screenshot({ path: path.join(capturas, '2-bienvenida.png') });

// foto de prueba
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
writeFileSync('/tmp/ej.png', png);
await pag.setInputFiles('#archivo', '/tmp/ej.png');
await pag.waitForSelector('.previa img');
await pag.fill('#texto', 'Ayúdame con este ejercicio de Bernoulli');
await pag.click('#bEnviar');
await pag.waitForSelector('.acciones', { timeout: 15000 });
const katex = await pag.locator('.profe .katex').count();
ok(katex >= 4, `dibuja las fórmulas con KaTeX (${katex})`);
ok(await pag.locator('.profe .katex-display').count() >= 1, 'fórmula en bloque centrada');
ok(!(await pag.locator('.profe .burbuja').innerText()).includes('$'), 'no quedan signos $ sin convertir');
const p0 = pedidos.at(-1).cuerpo;
ok(p0.model === 'claude-haiku-5-5', 'usa Claude Haiku 5.5');
ok(p0.system[0].text.includes('Bernoulli, Riccati, Clairaut y Lagrange'), 'incluye el temario del sílabo');
ok(/semana \d+ de 16/.test(p0.system[1].text), 'indica la semana del ciclo');
ok(p0.messages[0].content[0].type === 'image' && p0.messages[0].content[0].source.media_type === 'image/jpeg', 'envía la foto comprimida en JPEG');
await pag.screenshot({ path: path.join(capturas, '3-respuesta.png') });

// segundo turno: debe reenviar el pensamiento con su firma
await pag.click('text=Siguiente paso');
await pag.waitForFunction(() => document.querySelectorAll('.msg.profe').length === 2 && document.querySelector('.acciones'), null, { timeout: 15000 });
const p1 = pedidos.at(-1).cuerpo;
ok(p1.messages.length === 3 && p1.messages[1].content[0].type === 'thinking' && p1.messages[1].content[0].signature === 'firma-abc', 'reenvía el historial completo sin cambiarlo');

// modo solución completa
await pag.click('#mTodo'); await pag.fill('#texto', 'Resuelve y\'\' + 4y = 0'); await pag.click('#bEnviar');
await pag.waitForFunction(() => document.querySelectorAll('.msg.profe').length === 3 && document.querySelector('.acciones'), null, { timeout: 15000 });
ok(pedidos.at(-1).cuerpo.messages.at(-1).content.at(-1).text.startsWith('[Modo: solución completa]'), 'marca el modo solución completa');

// historial guardado tras recargar
await pag.reload({ waitUntil: 'networkidle' });
ok(await pag.locator('.msg').count() === 6, 'recupera la conversación al recargar');
await pag.click('#bHistorial'); await pag.waitForSelector('.item');
await pag.screenshot({ path: path.join(capturas, '4-historial.png') });
ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));

await nav.close(); srv.close();
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
