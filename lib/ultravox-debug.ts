// lib/ultravox-debug.ts

export async function testWebSocketConnection(url: string): Promise<boolean> {
  console.log(`testWebSocketConnection() called with URL: ${url}`);
  
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (ws) {
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        ws = null;
      }
    };
    
    try {
      // Extract the WebSocket URL from the joinUrl (if it's not already a ws:// or wss:// URL)
      let wsUrl = url;
      if (url.startsWith('https://')) {
        wsUrl = url.replace('https://', 'wss://');
      } else if (url.startsWith('http://')) {
        wsUrl = url.replace('http://', 'ws://');
      }
      
      // Set a timeout for the connection attempt
      timeoutId = setTimeout(() => {
        console.log(`WebSocket connection to ${wsUrl} timed out`);
        cleanup();
        resolve(false);
      }, 5000); // 5 second timeout
      
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log(`WebSocket connection to ${wsUrl} successful`);
        cleanup();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        console.error(`WebSocket connection to ${wsUrl} failed:`, error);
        cleanup();
        resolve(false);
      };
      
      ws.onclose = (event) => {
        console.log(`WebSocket connection to ${wsUrl} closed:`, event.code, event.reason);
        cleanup();
        resolve(false);
      };
      
    } catch (error) {
      console.error(`Failed to create WebSocket connection:`, error);
      cleanup();
      resolve(false);
    }
  });
}
