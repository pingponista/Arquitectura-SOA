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
              error: 'Solicitud inválida', 
              message: 'Faltan campos obligatorios: userId y productSku' 
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
            res.end(JSON.stringify({ error: 'Error de pasarela', message: 'No se pudo establecer conexión con el servicio de usuarios' }));
            return;
          }

          if (userResponse.status === 404) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Validación de negocio fallida', message: `El usuario con ID ${userId} no existe` }));
            return;
          }

          if (!userResponse.ok) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Error del servicio', message: 'El servicio de usuarios devolvió un estado de error' }));
            return;
          }

          const user = await userResponse.json();

          // Regla de Negocio: El usuario debe estar ACTIVO
          if (user.status !== 'ACTIVE') {
            console.warn(`[ESB Bus] Transacción rechazada: El usuario ${userId} está INACTIVO.`);
            res.writeHead(422); // Unprocessable Entity
            res.end(JSON.stringify({ 
              error: 'Validación de negocio fallida', 
              message: `El estado del usuario es '${user.status}'. Solo los usuarios activos pueden realizar compras.` 
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
            res.end(JSON.stringify({ error: 'Error de pasarela', message: 'No se pudo establecer conexión con el servicio de productos' }));
            return;
          }

          if (productResponse.status === 404) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Validación de negocio fallida', message: `El producto con SKU ${productSku} no existe` }));
            return;
          }

          if (!productResponse.ok) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Error del servicio', message: 'El servicio de productos devolvió un estado de error' }));
            return;
          }

          const product = await productResponse.json();

          // Regla de Negocio: Debe haber stock disponible
          const productStock = Number(product.stock);
          if (isNaN(productStock) || productStock <= 0) {
            console.warn(`[ESB Bus] Transacción rechazada: SKU ${productSku} sin stock disponible.`);
            res.writeHead(422);
            res.end(JSON.stringify({ 
              error: 'Validación de negocio fallida', 
              message: `El producto '${product.title}' no tiene stock disponible.` 
            }));
            return;
          }

          // Regla de Negocio: El saldo disponible del usuario debe cubrir el costo del producto
          // Se convierten de forma explícita a números para evitar comparaciones incorrectas de cadenas.
          const userBalance = Number(user.balance);
          const productPrice = Number(product.price);

          if (
            user.balance === undefined || 
            product.price === undefined || 
            isNaN(userBalance) || 
            isNaN(productPrice) || 
            userBalance < productPrice
          ) {
            console.warn(`[ESB Bus] Transacción rechazada: Fondos insuficientes o datos de saldo/precio inválidos. Saldo: ${user.balance}, Precio: ${product.price}`);
            res.writeHead(422);
            res.end(JSON.stringify({ 
              error: 'Validación de negocio fallida', 
              message: `Fondos insuficientes. El saldo del usuario es $${(userBalance || 0).toFixed(2)} pero el producto cuesta $${(productPrice || 0).toFixed(2)}.` 
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
            res.end(JSON.stringify({ error: 'Error de pasarela', message: 'No se pudo establecer conexión con el servicio de envíos' }));
            return;
          }

          if (!shippingResponse.ok) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Error del servicio', message: 'El servicio de envíos devolvió un estado de error' }));
            return;
          }

          const shipping = await shippingResponse.json();

          // ======================================================================
          // RESPUESTA CANÓNICA (Canonical Schema Pattern)
          // ======================================================================
          // El ESB abstrae el flujo, agregando los datos de los tres servicios atómicos
          // en una estructura de respuesta unificada, ocultando el diseño interno de la red.
          const remainingBalance = userBalance - productPrice;
          const canonicalResponse = {
            status: 'EXITOSO',
            message: 'Compra completada con éxito',
            transaction: {
              timestamp: new Date().toISOString(),
              user: {
                id: user.id,
                name: user.name,
                previousBalance: userBalance,
                remainingBalance: parseFloat(remainingBalance.toFixed(2))
              },
              product: {
                sku: product.sku,
                title: product.title,
                price: productPrice
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
          res.end(JSON.stringify({ error: 'Cuerpo de la solicitud JSON con formato incorrecto' }));
        }
      });
    } else {
      console.warn(`[ESB Bus] Endpoint no soportado: ${method} ${url}`);
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint o método no soportado' }));
    }
  } catch (error) {
    console.error('[ESB Bus] Error crítico en el bus:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Error interno del servidor ESB' }));
  }
});

// Arrancar servidor
server.listen(PORT, () => {
  console.log(`[ESB Bus] Iniciado en puerto ${PORT}. Registrado para mediar flujos empresariales.`);
});
