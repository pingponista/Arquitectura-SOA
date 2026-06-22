import http from 'node:http';

// Leer el puerto desde las variables de entorno configuradas por Docker Compose, o usar 4001 por defecto
const PORT = process.env.PORT || 4001;

/**
 * Base de Datos en Memoria para pruebas del flujo de integración.
 * - Usuario 1 (Alice): Activo y con fondos suficientes para el Laptop.
 * - Usuario 2 (Bob): Inactivo (para probar validación de estado en el ESB).
 * - Usuario 3 (Charlie): Activo pero con saldo insuficiente (para probar validación de fondos en el ESB).
 */
const USERS_DATABASE = {
  '1': { id: '1', name: 'Alice Smith', status: 'ACTIVE', balance: 500.00 },
  '2': { id: '2', name: 'Bob Jones', status: 'INACTIVE', balance: 1000.00 },
  '3': { id: '3', name: 'Charlie Brown', status: 'ACTIVE', balance: 10.00 }
};

// Crear el servidor HTTP nativo
const server = http.createServer((req, res) => {
  // Configurar las cabeceras de respuesta estándar para JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const { method, url } = req;

    // Patrón regex para buscar la ruta: GET /users/:id
    const userRouteMatch = url.match(/^\/users\/([^/]+)$/);

    if (method === 'GET' && userRouteMatch) {
      const userId = userRouteMatch[1];
      const user = USERS_DATABASE[userId];

      if (user) {
        console.log(`[Users Service] GET /users/${userId} - Usuario encontrado: ${user.name}`);
        res.writeHead(200);
        res.end(JSON.stringify(user));
      } else {
        console.warn(`[Users Service] GET /users/${userId} - Usuario NO encontrado`);
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Usuario con ID ${userId} no encontrado` }));
      }
    } else {
      // Manejar endpoints o métodos no soportados por el contrato del servicio
      console.warn(`[Users Service] Ruta no encontrada o método no permitido: ${method} ${url}`);
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint o método no soportado' }));
    }
  } catch (error) {
    // Captura de errores internos del servicio para prevenir caídas imprevistas
    console.error('[Users Service] Error interno:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Error interno del servidor' }));
  }
});

// Arrancar el servicio en el puerto configurado
server.listen(PORT, () => {
  console.log(`[Users Service] Escuchando en el puerto ${PORT} (Servicio Interno de Usuarios)`);
});
