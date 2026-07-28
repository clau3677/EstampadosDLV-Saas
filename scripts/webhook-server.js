#!/usr/bin/env node
/**
 * ============================================================================
 * GitHub Webhook Receiver — Estampados DLV
 * ============================================================================
 * Escucha en localhost:9000 y recibe eventos de GitHub. Al recibir un `push`
 * al branch `main` (con firma HMAC-SHA256 válida), dispara el script deploy.sh
 * en background y retorna 202 Accepted inmediatamente (GitHub timeout ~10s).
 *
 * Config vía env vars:
 *   WEBHOOK_SECRET   — secreto HMAC configurado también en GitHub (obligatorio)
 *   WEBHOOK_PORT     — puerto local (default 9000)
 *   DEPLOY_SCRIPT    — path del deploy.sh (default /home/dlv/deploy.sh)
 *   DEPLOY_BRANCH    — branch que dispara deploy (default main)
 *
 * Corre bajo PM2 como usuario `dlv`:
 *   pm2 start /home/dlv/webhook-server.js --name dlv-webhook
 * ============================================================================
 */

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = parseInt(process.env.WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/home/dlv/deploy.sh';
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || 'main';

if (!SECRET) {
  console.error('FATAL: WEBHOOK_SECRET no está configurado en el entorno');
  process.exit(1);
}
if (!fs.existsSync(DEPLOY_SCRIPT)) {
  console.error(`FATAL: script de deploy no encontrado: ${DEPLOY_SCRIPT}`);
  process.exit(1);
}

/** Compara la firma X-Hub-Signature-256 contra el HMAC-SHA256 calculado */
function verifySignature(sig, rawBody) {
  if (!sig || !sig.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  // timingSafeEqual requiere igual longitud
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

let deployInProgress = false;
let lastDeployAt = 0;
const DEBOUNCE_MS = 5000; // no aceptar 2 deploys en menos de 5s

function triggerDeploy(commitInfo) {
  if (deployInProgress) {
    console.log('[webhook] Deploy ya en progreso, ignorando duplicado');
    return { ok: false, reason: 'already_running' };
  }
  if (Date.now() - lastDeployAt < DEBOUNCE_MS) {
    console.log('[webhook] Debounce activo — ignorando');
    return { ok: false, reason: 'debounced' };
  }
  deployInProgress = true;
  lastDeployAt = Date.now();

  const child = spawn('/bin/bash', [DEPLOY_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.on('exit', (code) => {
    deployInProgress = false;
    console.log(`[${new Date().toISOString()}] deploy finished with exit code ${code}`);
  });
  child.unref();
  console.log(`[${new Date().toISOString()}] 🚀 Deploy triggered — commit ${commitInfo.sha?.slice(0, 7)} by ${commitInfo.pusher}`);
  return { ok: true, triggered: true };
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      deployInProgress,
      lastDeployAt: lastDeployAt ? new Date(lastDeployAt).toISOString() : null,
    }));
    return;
  }

  // Sólo aceptamos POST a /webhook/github
  if (req.method !== 'POST' || req.url !== '/webhook/github') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  try {
    const rawBody = await readBody(req);
    const sig = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    // Verificar firma HMAC — CRÍTICO para seguridad
    if (!verifySignature(sig, rawBody)) {
      console.warn(`[${new Date().toISOString()}] ⚠️ Firma inválida desde ${req.socket.remoteAddress}`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid_signature' }));
      return;
    }

    // Ping de GitHub (al crear el webhook)
    if (event === 'ping') {
      console.log(`[${new Date().toISOString()}] 🏓 ping recibido — webhook OK`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, event: 'pong' }));
      return;
    }

    // Sólo procesamos push al branch de deploy
    if (event === 'push') {
      let data;
      try { data = JSON.parse(rawBody); } catch {
        res.writeHead(400); res.end('bad json'); return;
      }
      if (data.ref !== `refs/heads/${DEPLOY_BRANCH}`) {
        console.log(`[webhook] push ignorado (ref=${data.ref}, esperado refs/heads/${DEPLOY_BRANCH})`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, ignored: true, reason: 'wrong_branch' }));
        return;
      }
      const result = triggerDeploy({
        sha: data.after,
        pusher: data.pusher?.name || 'unknown',
      });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Cualquier otro evento (fork, star, etc.) — 200 OK sin acción
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, event, action: 'noop' }));
  } catch (e) {
    console.error('[webhook] error inesperado:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[${new Date().toISOString()}] Webhook server ready → http://127.0.0.1:${PORT}/webhook/github`);
  console.log(`Deploy script: ${DEPLOY_SCRIPT}`);
  console.log(`Deploy branch: ${DEPLOY_BRANCH}`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
