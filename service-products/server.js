import http from 'node:http';

// Leer el puerto de las variables de entorno configuradas por Docker Compose, o usar 4002 por defecto
const PORT = process.env.PORT || 4002;

/**
 * Base de Datos en Memoria para pruebas del catálogo de productos.
 * - LAPTOP-001: En stock, costo de $450.
 * - MOUSE-002: Sin stock disponible (para probar la validación de inventario en el ESB).
 * - KEYBOARD-003: Con stock disponible, costo de $80.
 */
const PRODUCTS_DATABASE = {
  'LAPTOP-001': { sku: 'LAPTOP-001', title: 'Enterprise Laptop', stock: 5, price: 450.00 },
  'MOUSE-002': { sku: 'MOUSE-002', title: 'Wireless Mouse', stock: 0, price: 25.00 },
  'KEYBOARD-003': { sku: 'KEYBOARD-003', title: 'Mechanical Keyboard', stock: 15, price: 80.00 }
};

// Crear el servidor HTTP nativo
const server = http.createServer((req, res) => {
  // Establecer cabeceras de respuesta JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const { method, url } = req;

    // Patrón regex para buscar la ruta: GET /products/:sku
    const productRouteMatch = url.match(/^\/products\/([^/]+)$/);

    if (method === 'GET' && productRouteMatch) {
      const productSku = productRouteMatch[1];
      const product = PRODUCTS_DATABASE[productSku];

      if (product) {
        console.log(`[Products Service] GET /products/${productSku} - SKU encontrado: ${product.title}`);
        res.writeHead(200);
        res.end(JSON.stringify(product));
      } else {
        console.warn(`[Products Service] GET /products/${productSku} - SKU NO encontrado`);
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Product SKU ${productSku} NO encontrado` }));
      }
    } else {
      // Manejar endpoints o métodos no soportados por el contrato del servicio
      console.warn(`[Products Service] Ruta no encontrada o método no permitido: ${method} ${url}`);
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint o método no soportado' }));
    }
  } catch (error) {
    // Captura de excepciones
    console.error('[Products Service] Error interno:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Error interno del servidor' }));
  }
});

// Arrancar el servicio en el puerto configurado
server.listen(PORT, () => {
  console.log(`[Products Service] Escuchando en el puerto ${PORT} (Servicio Interno de Productos)`);
});
