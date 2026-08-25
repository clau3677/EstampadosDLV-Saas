/**
 * Obscura CDP Helper
 * Interacts with the Obscura headless browser via Chrome DevTools Protocol.
 */
import WebSocket from 'ws';

export async function fetchWithObscura(url, timeoutMs = 30000) {
  const wsBrowserUrl = 'ws://127.0.0.1:9222/devtools/browser';
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsBrowserUrl);
    let id = 1;
    let targetId = null;
    let sessionId = null;
    
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Obscura timeout'));
    }, timeoutMs);

    const send = (method, params = {}) => {
      ws.send(JSON.stringify({ id: id++, method, params }));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      if (targetId) {
        send('Target.closeTarget', { targetId });
      }
      ws.close();
    };

    ws.on('open', () => {
      // Create a new target (page)
      send('Target.createTarget', { url: 'about:blank' });
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      
      // 1. Target created
      if (msg.id === 1 && msg.result && msg.result.targetId) {
        targetId = msg.result.targetId;
        send('Target.attachToTarget', { targetId, flatten: true });
      }

      // 2. Attached to target
      if (msg.id === 2 && msg.result && msg.result.sessionId) {
        sessionId = msg.result.sessionId;
        // Send navigation command to the session
        ws.send(JSON.stringify({
          id: id++,
          method: 'Page.navigate',
          params: { url },
          sessionId
        }));
        // Enable page events for the session
        ws.send(JSON.stringify({
          id: id++,
          method: 'Page.enable',
          params: {},
          sessionId
        }));
      }

      // 3. Page events and HTML extraction
      if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) {
        ws.send(JSON.stringify({
          id: 1000, // Fixed ID for extraction
          method: 'Runtime.evaluate',
          params: {
            expression: 'document.documentElement.outerHTML',
            returnByValue: true
          },
          sessionId
        }));
      }

      if (msg.id === 1000 && msg.result && msg.result.result && msg.result.result.value) {
        const html = msg.result.result.value;
        resolve(html);
        cleanup();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
