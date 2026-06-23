# Ecosistema de Arquitectura SOA en Docker

Este proyecto es una simulación empresarial y didáctica de una **Arquitectura Orientada a Servicios (SOA)**. Utiliza un **Bus de Servicios Empresariales (ESB)** que actúa como mediador y orquestador central, interactuando con tres servicios atómicos e independientes para completar un flujo de compras (Checkout).

---

## 🗺️ Mapa de la Arquitectura

El siguiente diagrama ilustra cómo fluyen los datos en el sistema. Los servicios internos están aislados de la red exterior y solo se comunican con el ESB:

graph TD
    %% Subgrafos con nombres entre comillas para evitar errores de parseo por caracteres especiales
    subgraph "Red Pública (Host / Cliente)"
        frontend[Interfaz Web / Navegador]
        postman[Postman / curl]
    end
    
    subgraph "soa_enterprise_network (Red Aislada de Docker)"
        esb_bus[ESB Orchestrator / Puerto :5000]
        service_users[Servicio de Usuarios / Puerto :4001]
        service_products[Servicio de Productos / Puerto :4002]
        service_shippings[Servicio de Envíos / Puerto :4003]
        app_client[Cliente de Integración Automático]
    end

    %% Flujos de Clientes Externos hacia el BUS
    frontend -->|POST /esb/v1/checkout| esb_bus
    postman -->|POST /esb/v1/checkout| esb_bus
    app_client -->|POST /esb/v1/checkout| esb_bus

    %% Orquestación Interna del ESB (Patrón SOA)
    esb_bus -->|1. GET /users/:id| service_users
    esb_bus -->|2. GET /products/:sku| service_products
    esb_bus -->|3. POST /shipping/dispatch| service_shippings

---

## 🧠 ¿Cómo apreciar la Arquitectura SOA en esta App?

SOA se basa en principios de diseño específicos. En este proyecto puedes ver reflejados los siguientes pilares:

### 1. Desacoplamiento Absoluto (Autonomía de Servicios)
Ninguno de los servicios internos (`service-users`, `service-products`, `service-shippings`) sabe de la existencia de los demás:
* El servicio de usuarios no sabe qué productos se venden ni cómo se envían.
* El servicio de productos no sabe quién compra ni cuánto saldo tiene.
* Cada servicio es dueño de su propio contrato y base de datos (representados en memoria por simplicidad).

### 2. Mediación y Orquestación de Mensajes (El Rol del ESB)
El **ESB (Enterprise Service Bus)** centraliza la lógica del flujo de negocio. En lugar de que el cliente llame a cada microservicio por separado, el ESB orquesta las llamadas secuencialmente:
1. Valida el estado del usuario (`service-users`).
2. Valida la existencia, stock y costo del producto (`service-products`).
3. Compara el saldo contra el precio del producto (lógica de mediación financiera).
4. Si todo es válido, solicita el despacho logístico (`service-shippings`).

### 3. Patrón de Esquema Canónico (Canonical Schema)
El ESB recibe una solicitud sencilla del cliente (`userId` y `productSku`) y le devuelve una respuesta unificada y limpia. El cliente nunca ve las respuestas crudas de los servicios internos; el ESB las transforma y las consolida en un único JSON estructurado (Formato Canónico) que abstrae la complejidad interna del sistema.

### 4. Aislamiento de Red e Interfaz Unificada (API Gateway)
En el archivo `docker-compose.yml`, notarás que solo el contenedor `esb-bus` tiene puertos mapeados hacia el host exterior (`5000:5000`). Los servicios internos están protegidos en la red privada `soa_enterprise_network`. 
* Para que el **frontend** pueda consultar los perfiles y el stock sin conectarse a los puertos internos (lo cual fallaría en producción por seguridad), el ESB actúa como **API Gateway/Proxy**, exponiendo rutas seguras como `/esb/v1/users/:id` y `/esb/v1/products/:sku`.

---

## 📂 Estructura del Proyecto

* **`esb-bus/`**: Mediador central y orquestador (Puerto `5000`).
* **`service-users/`**: Proveedor de contratos de perfiles de usuario y saldos (Puerto `4001`).
* **`service-products/`**: Proveedor de catálogo e inventario físico (Puerto `4002`).
* **`service-shippings/`**: Proveedor de despacho y logística de envíos (Puerto `4003`).
* **`app-client/`**: Cliente automatizado para pruebas de integración en Docker.
* **`frontend/`**: Interfaz visual dinámica e interactiva para probar casos de negocio directamente en el navegador.
* **`Dockerfile`**: Plantilla multi-etapa optimizada reutilizada por cada contenedor.
* **`docker-compose.yml`**: Configuración de redes aisladas y variables de entorno del ecosistema.
* **`verify_local.js`**: Script de automatización de pruebas locales (ejecución directa con Node.js).

---

## 🚀 Guía de Uso Rápido

### A. Ejecución de Pruebas Automáticas (Docker)
Reconstruye e inicia todo el ecosistema. Ejecutará las pruebas y detendrá los contenedores al finalizar:
```bash
docker compose up --build --abort-on-container-exit
```

### B. Pruebas Manuales Interactivas (Frontend / Postman)
Para interactuar con el sistema de manera libre:
1. Levanta los servidores (manteniéndolos activos):
   ```bash
   docker compose up --build
   ```
   *(O alternativamente, corre localmente con `node verify_local.js`)*.
2. Abre la interfaz web haciendo doble clic sobre el archivo [index.html](file:///c:/Users/alexd/OneDrive/Escritorio/REVOLUTION-JS/Developer/arquitectura-SOA/frontend/index.html) en la carpeta `frontend`.
3. Selecciona un usuario y un producto en la interfaz interactiva para ver cómo reacciona dinámicamente el bus de servicios en base a las reglas de negocio (fondos, stock o estado de cuenta).


# Fuentes Bibliográficas y Estándares Técnicos Aplicados

Este documento detalla las fuentes oficiales, autores y especificaciones de la industria que respaldan el diseño arquitectónico, los patrones de integración y las decisiones de infraestructura implementadas en esta aplicación SOA.

---

## 1. Arquitectura SOA y Patrones de Integración Empresarial (EIP)

* **Hohpe, G., & Woolf, B. (2003).** *Enterprise Integration Patterns: Designing, Building, and Deploying Messaging Solutions*. Addison-Wesley Professional.
    * **Patrones aplicados:** *Process Manager (Orchestrator)*, *Message Translator* y *Canonical Data Model*. Respaldan la existencia del `esb-bus` como el mediador centralizado que coordina la secuencia de llamadas y unifica el formato de las respuestas.
* **Erl, T. (2016).** *SOA Principles of Service Design*. Prentice Hall.
    * **Principios aplicados:** *Service Composability* (Composición de Servicios), *Service Autonomy* (Autonomía) y *Service Loose Coupling* (Acoplamiento Débil). Sustentan el diseño de los contratos de usuarios, productos y envíos como entidades totalmente independientes y agnósticas entre sí.

---

## 2. Estándares de Protocolo y Comunicación Web

* **Internet Engineering Task Force (IETF). (2007).** *RFC 4918: HTTP Extensions for Web Distributed Authoring and Versioning (WebDAV)*. Sección 11.2: "422 Unprocessable Entity".
    * **Estándar aplicado:** Uso del código de estado HTTP `422` en Postman para manejar rechazos semánticos por reglas de negocio (ej. fondos insuficientes o falta de stock), diferenciándolo de un error de sintaxis (`400 Bad Request`).
* **Fielding, R., & Reschke, J. (2014).** *RFC 7231: Hypertext Transfer Protocol (HTTP/1.1): Semantics and Content*.
    * **Estándar aplicado:** Definición de los contratos semánticos REST mediante verbos HTTP (`GET` para consultas atómicas de contratos y `POST` para la mutación u orquestación de transacciones en el ESB).

---

## 3. Infraestructura de Contenedores y Buenas Prácticas de Software

* **Docker Documentation.** *Docker Bridge Network Drivers Reference*. Recuperado de [https://docs.docker.com](https://docs.docker.com)
    * **Mecanismo aplicado:** *User-Defined Bridge Networks* y *Automatic Service Discovery*. Respalda el aislamiento perimetral de los contratos internos mediante el uso de `expose` en el archivo `docker-compose.yml`, forzando la comunicación exclusiva a través de la resolución DNS interna de Docker.
* **Wiggins, A. (2011).** *The Twelve-Factor App*. Factor III: Configuración. Recuperado de [https://12factor.net/config](https://12factor.net/config)
    * **Buena práctica aplicada:** Inyección dinámica de dependencias e infraestructura mediante variables de entorno (`process.env`), permitiendo que las URLs de ubicación de los servicios se desacoplen del código fuente del Bus de Servicios.
