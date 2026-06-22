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
            console.warn('[Servicio de envíos] Solicitud incorrecta - Falta userId o sku');
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Faltan parámetros obligatorios: userId y sku' }));
            return;
          }

          console.log(`[Servicio de envíos] Despachando SKU: ${sku} para el Usuario: ${userId}`);

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
          console.error('[Servicio de envíos] Error al parsear JSON:', parseError);
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Payload JSON con formato incorrecto' }));
        }
      });
    } else {
      console.warn(`[Servicio de envíos] Ruta no encontrada o método no permitido: ${method} ${url}`);
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint o método no soportado' }));
    }
  } catch (error) {
    console.error('[Servicio de envíos] Error interno:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Error interno del servidor' }));
  }
});

// Arrancar el servicio en el puerto configurado
server.listen(PORT, () => {
  console.log(`[Servicio de envíos] Escuchando en el puerto ${PORT} (Servicio Interno de Envíos)`);
});
