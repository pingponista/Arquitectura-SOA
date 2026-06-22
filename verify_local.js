import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const processes = [];

function startProcess(name, command, args, env) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      console.log(`[${name}] ${line}`);
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      console.error(`[${name} ERROR] ${line}`);
    });
  });

  processes.push(child);
  return child;
}

async function main() {
  console.log('=== INICIANDO SERVICIOS LOCALES PARA VERIFICACIÓN ===\n');

  // 1. Iniciar Microservicios
  startProcess('Users-Service', 'node', ['service-users/server.js'], { PORT: '4001' });
  startProcess('Products-Service', 'node', ['service-products/server.js'], { PORT: '4002' });
  startProcess('Shippings-Service', 'node', ['service-shippings/server.js'], { PORT: '4003' });

  // 2. Iniciar ESB Bus (conectando a localhost)
  startProcess('ESB-Bus', 'node', ['esb-bus/server.js'], {
    PORT: '5000',
    USERS_SERVICE_URL: 'http://localhost:4001',
    PRODUCTS_SERVICE_URL: 'http://localhost:4002',
    SHIPPINGS_SERVICE_URL: 'http://localhost:4003'
  });

  // Esperar un momento a que los sockets locales estén listos
  await setTimeout(2000);

  // 3. Iniciar Cliente de Pruebas
  console.log('\n=== INICIANDO PRUEBAS DE INTEGRACIÓN DESDE EL CLIENTE ===');
  const client = startProcess('App-Client', 'node', ['app-client/index.js'], {
    ESB_SERVICE_URL: 'http://localhost:5000'
  });

  // Al terminar el cliente, matamos todos los servidores y salimos
  client.on('exit', (code) => {
    console.log(`\n=== PRUEBAS FINALIZADAS CON CÓDIGO DE SALIDA DE CLIENTE: ${code} ===`);
    console.log('Deteniendo todos los servidores de prueba...');
    processes.forEach(proc => proc.kill());
    process.exit(code);
  });
}

main().catch(err => {
  console.error('Error de verificación local:', err);
  processes.forEach(proc => proc.kill());
  process.exit(1);
});
