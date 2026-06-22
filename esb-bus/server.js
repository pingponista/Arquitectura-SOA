import http from 'node:http';

// ==============================================================================
// REGISTRO DE SERVICIOS (Service Registry via Environment Variables)
// ==============================================================================
// El ESB no tiene hardcodeadas las direcciones de los servicios. Utiliza el patrón
// de Registro de Servicios a través de variables de entorno para resolver dinámicamente
// las ubicaciones físicas de los contratos internos.
const PORT = process.env.PORT || 5000;
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL;
const PRODUCTS_SERVICE_URL = process.env.PRODUCTS_SERVICE_URL;
const SHIPPINGS_SERVICE_URL = process.env.SHIPPINGS_SERVICE_URL;

// Validar que las dependencias del bus estén configuradas correctamente antes de arrancar
if (!USERS_SERVICE_URL || !PRODUCTS_SERVICE_URL || !SHIPPINGS_SERVICE_URL) {
  console.error('[ESB Bus] ERROR: Falta configurar variables de entorno para los servicios internos.');
  process.exit(1);
}

// Crear servidor HTTP nativo del ESB
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const { method, url } = req;

    // ==========================================================================
    // RUTA DE ORQUESTRACIÓN: POST /esb/v1/checkout
    // ==========================================================================
    if (method === 'POST' && url === '/esb/v1/checkout') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          // Parsear payload entrante
          const payload = JSON.parse(body);
          const { userId, productSku } = payload;

          // Validación inicial de parámetros
          if (!userId || !productSku) {
            res.writeHead(400);
            res.end(JSON.stringify({ 
              error: 'Invalid request', 
              message: 'Missing required fields: userId and productSku' 
            }));
            return;
          }

          console.log(`[ESB Bus] Iniciando transacción de Checkout. Usuario: ${userId}, SKU: ${productSku}`);

          // ======================================================================
          // PASO 1: Consumir contrato de service-users y realizar mediación
          // ======================================================================
          console.log(`[ESB Bus] [1/3] Consultando servicio de usuarios en: ${USERS_SERVICE_URL}/users/${userId}`);
          let userResponse;
          try {
            userResponse = await fetch(`${USERS_SERVICE_URL}/users/${userId}`);
          } catch (fetchErr) {
            console.error('[ESB Bus] Error conectando con service-users:', fetchErr.message);
            res.writeHead(502); // Bad Gateway
            res.end(JSON.stringify({ error: 'Gateway Error', message: 'Unable to contact Users Service' }));
            return;
          }

          if (userResponse.status === 404) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Business Validation Failed', message: `User with ID ${userId} does not exist` }));
            return;
          }

          if (!userResponse.ok) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Service Error', message: 'Users service returned an error status' }));
            return;
          }

          const user = await userResponse.json();

          // Regla de Negocio: El usuario debe estar ACTIVO
          if (user.status !== 'ACTIVE') {
            console.warn(`[ESB Bus] Transacción rechazada: El usuario ${userId} está INACTIVO.`);
            res.writeHead(422); // Unprocessable Entity
            res.end(JSON.stringify({ 
              error: 'Business Validation Failed', 
              message: `User status is '${user.status}'. Only ACTIVE users can perform checkouts.` 
            }));
            return;
          }

          // ======================================================================
          // PASO 2: Consumir contrato de service-products y realizar mediación
          // ======================================================================
          console.log(`[ESB Bus] [2/3] Consultando servicio de productos en: ${PRODUCTS_SERVICE_URL}/products/${productSku}`);
          let productResponse;
          try {
            productResponse = await fetch(`${PRODUCTS_SERVICE_URL}/products/${productSku}`);
          } catch (fetchErr) {
            console.error('[ESB Bus] Error conectando con service-products:', fetchErr.message);
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Gateway Error', message: 'Unable to contact Products Service' }));
            return;
          }

          if (productResponse.status === 404) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Business Validation Failed', message: `Product with SKU ${productSku} does not exist` }));
            return;
          }

          if (!productResponse.ok) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Service Error', message: 'Products service returned an error status' }));
            return;
          }

          const product = await productResponse.json();

          // Regla de Negocio: Debe haber stock disponible
          if (product.stock <= 0) {
            console.warn(`[ESB Bus] Transacción rechazada: SKU ${productSku} sin stock disponible.`);
            res.writeHead(422);
            res.end(JSON.stringify({ 
              error: 'Business Validation Failed', 
              message: `Product '${product.title}' is out of stock.` 
            }));
            return;
          }

          // Regla de Negocio: El saldo disponible del usuario debe cubrir el costo del producto
          if (user.balance < product.price) {
            console.warn(`[ESB Bus] Transacción rechazada: Fondos insuficientes. Saldo: ${user.balance}, Precio: ${product.price}`);
            res.writeHead(422);
            res.end(JSON.stringify({ 
              error: 'Business Validation Failed', 
              message: `Insufficient funds. User balance is $${user.balance.toFixed(2)} but product costs $${product.price.toFixed(2)}.` 
            }));
            return;
          }

          // ======================================================================
          // PASO 3: Transformación de Datos y Consumir service-shippings
          // ======================================================================
          // Mediación de Mensajes: Transformamos los payloads independientes en el formato esperado por Shippings
          console.log(`[ESB Bus] [3/3] Solicitando despacho a: ${SHIPPINGS_SERVICE_URL}/shipping/dispatch`);
          let shippingResponse;
          try {
            shippingResponse = await fetch(`${SHIPPINGS_SERVICE_URL}/shipping/dispatch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                sku: product.sku
              })
            });
          } catch (fetchErr) {
            console.error('[ESB Bus] Error conectando con service-shippings:', fetchErr.message);
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Gateway Error', message: 'Unable to contact Shippings Service' }));
            return;
          }

          if (!shippingResponse.ok) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Service Error', message: 'Shippings service returned an error status' }));
            return;
          }

          const shipping = await shippingResponse.json();

          // ======================================================================
          // RESPUESTA CANÓNICA (Canonical Schema Pattern)
          // ======================================================================
          // El ESB abstrae el flujo, agregando los datos de los tres servicios atómicos
          // en una estructura de respuesta unificada, ocultando el diseño interno de la red.
          const remainingBalance = user.balance - product.price;
          const canonicalResponse = {
            status: 'SUCCESS',
            message: 'Checkout completed successfully',
            transaction: {
              timestamp: new Date().toISOString(),
              user: {
                id: user.id,
                name: user.name,
                previousBalance: user.balance,
                remainingBalance: parseFloat(remainingBalance.toFixed(2))
              },
              product: {
                sku: product.sku,
                title: product.title,
                price: product.price
              }
            },
            shipping: {
              trackingId: shipping.trackingId,
              carrier: shipping.carrier,
              estimatedDays: shipping.estimatedDays
            }
          };

          console.log(`[ESB Bus] Transacción exitosa. Checkout completado para Usuario: ${user.name}`);
          res.writeHead(200);
          res.end(JSON.stringify(canonicalResponse));

        } catch (parseError) {
          console.error('[ESB Bus] Error parseando JSON de entrada:', parseError);
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Malformed JSON request body' }));
        }
      });
    } else {
      console.warn(`[ESB Bus] Endpoint no soportado: ${method} ${url}`);
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint or method not supported' }));
    }
  } catch (error) {
    console.error('[ESB Bus] Error crítico en el bus:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal ESB Server Error' }));
  }
});

// Arrancar servidor
server.listen(PORT, () => {
  console.log(`[ESB Bus] Iniciado en puerto ${PORT}. Registrado para mediar flujos empresariales.`);
});
