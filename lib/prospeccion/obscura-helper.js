/**
 * Obscura CDP Helper
 * Interacts with the Obscura headless browser via Chrome DevTools Protocol.
 */
import WebSocket from 'ws';

export async function fetchWithObscura(url, timeoutMs = 30000) {
  const cdpUrl = 'http://127.0.0.1:9222/json/new';
  
  try {
    // 1. Create a new page
    const res = await fetch(cdpUrl, { method: 'PUT' });
    const page = await res.json();
    const wsUrl = page.webSocketDebuggerUrl;
    const pageId = page.id;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let id = 1;
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Obscura timeout'));
      }, timeoutMs);

      const send = (method, params = {}) => {
        ws.send(JSON.stringify({ id: id++, method, params }));
      };

      ws.on('open', () => {
        send('Page.enable');
        send('Page.navigate', { url });
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        // Wait for page to finish loading
        if (msg.method === 'Page.loadEventFired') {
          send('Runtime.evaluate', {
            expression: 'document.documentElement.outerHTML',
            returnByValue: true
          });
        }

        if (msg.id && msg.result && msg.result.result && msg.result.result.value) {
          const html = msg.result.result.value;
          clearTimeout(timeout);
          ws.close();
          
          // Cleanup: close the page
          fetch(`http://127.0.0.1:9222/json/close/${pageId}`, { method: 'DELETE' }).catch(() => {});
          
          resolve(html);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Obscura helper error:', error);
    return null;
  }
}
