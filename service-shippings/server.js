import http from 'node:http';

// Leer el puerto de las variables de entorno configuradas por Docker Compose, o usar 4003 por defecto
const PORT = process.env.PORT || 4003;

// Crear el servidor HTTP nativo
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const { method, url } = req;

    // Validar el endpoint y método: POST /shipping/dispatch
    if (method === 'POST' && url === '/shipping/dispatch') {
      let body = '';

      // Leer el flujo de datos (stream) del cuerpo de la petición
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          // Parsear el payload JSON
          const payload = JSON.parse(body);
          const { userId, sku } = payload;

          // Validación básica del contrato
          if (!userId || !sku) {
            console.warn('[Shippings Service] Bad Request - Falta userId o sku');
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Missing required parameters: userId and sku' }));
            return;
          }

          console.log(`[Shippings Service] Despachando SKU: ${sku} para el Usuario: ${userId}`);

          // Simular generación de tracking y despacho logístico
          const trackingId = `TRK-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
          const responsePayload = {
            trackingId,
            carrier: 'SOA Express Logistics Inc.',
            estimatedDays: 3
          };

          res.writeHead(201); // Created
          res.end(JSON.stringify(responsePayload));
        } catch (parseError) {
          console.error('[Shippings Service] JSON Parse Error:', parseError);
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
        }
      });
    } else {
      console.warn(`[Shippings Service] Ruta no encontrada o método no permitido: ${method} ${url}`);
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint or method not supported' }));
    }
  } catch (error) {
    console.error('[Shippings Service] Error interno:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// Arrancar el servicio en el puerto configurado
server.listen(PORT, () => {
  console.log(`[Shippings Service] Escuchando en el puerto ${PORT} (Servicio Interno de Envíos)`);
});
