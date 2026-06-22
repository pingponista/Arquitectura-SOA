import { setTimeout } from 'node:timers/promises';

// Recuperar la URL del bus desde el entorno (ej. http://esb-bus:5000)
const ESB_SERVICE_URL = process.env.ESB_SERVICE_URL || 'http://esb-bus:5000';

/**
 * Ejecuta una petición formal al ESB para verificar un caso de negocio específico.
 * @param {string} title Título ilustrativo del escenario de prueba.
 * @param {string} userId Identificador de usuario.
 * @param {string} productSku SKU del producto a comprar.
 */
async function executeTransaction(title, userId, productSku) {
  console.log('\n' + '='.repeat(80));
  console.log(`ESCENARIO: ${title.toUpperCase()}`);
  console.log(`Envío payload: { userId: "${userId}", productSku: "${productSku}" }`);
  console.log('='.repeat(80));

  try {
    // El cliente solo conoce la URL del Bus de Servicios (esb-bus) y no los microservicios subyacentes.
    // Esto asegura el desacoplamiento completo: si la API interna de usuarios cambia,
    // el cliente no se ve afectado porque interactúa únicamente con el contrato canónico del ESB.
    const response = await fetch(`${ESB_SERVICE_URL}/esb/v1/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId, productSku })
    });

    const status = response.status;
    const body = await response.json();

    console.log(`Resultado HTTP Status: ${status}`);
    console.log('Respuesta Canónica del ESB:');
    console.log(JSON.stringify(body, null, 2));

  } catch (error) {
    console.error(`[App Client] Error de conexión al ESB en ${ESB_SERVICE_URL}:`, error.message);
  }
}

/**
 * Función principal del test automatizado
 */
async function main() {
  // 1. Período de gracia para permitir que los servicios internos y el bus inicien.
  // En Docker, aunque dependa de 'esb-bus', el proceso del servidor Node puede tardar
  // un par de segundos en enlazar el socket TCP.
  console.log('[App Client] Esperando 5 segundos para garantizar que el ecosistema SOA esté listo...');
  await setTimeout(5000);

  console.log('[App Client] Iniciando suite de pruebas automatizadas...');

  // Escenario 1: Compra exitosa (Alice compra Laptop)
  // Alice: ACTIVE y balance de $500. Laptop: Stock 5 y costo de $450.
  // Debe dar de alta el envío con trackingId.
  await executeTransaction(
    '1. Checkout Exitoso (Condiciones Óptimas)',
    '1',
    'LAPTOP-001'
  );

  // Escenario 2: Falla por estado inactivo (Bob compra Laptop)
  // Bob: INACTIVE. El ESB debe detener el flujo en el paso 1 sin llamar a productos ni envíos.
  await executeTransaction(
    '2. Rechazo por Usuario Inactivo',
    '2',
    'LAPTOP-001'
  );

  // Escenario 3: Falla por falta de stock (Alice compra Mouse)
  // Mouse: Stock 0. El ESB debe rechazar en el paso 2.
  await executeTransaction(
    '3. Rechazo por Producto sin Stock',
    '1',
    'MOUSE-002'
  );

  // Escenario 4: Falla por fondos insuficientes (Charlie compra Keyboard)
  // Charlie: Balance $10. Keyboard: Precio $80. El ESB debe rechazar por balance insuficiente.
  await executeTransaction(
    '4. Rechazo por Fondos Insuficientes del Usuario',
    '3',
    'KEYBOARD-003'
  );

  // Escenario 5: Falla por recurso inexistente
  // El ESB debe responder con 404 informando la ausencia del SKU.
  await executeTransaction(
    '5. Rechazo por Producto Inexistente (Error 404)',
    '1',
    'SKU-INEXISTENTE'
  );

  console.log('\n' + '='.repeat(80));
  console.log('[App Client] Suite de pruebas completada. Apagando contenedor de pruebas.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('[App Client] Error crítico:', err);
});
