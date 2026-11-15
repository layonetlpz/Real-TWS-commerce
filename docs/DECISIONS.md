# REGISTRO DE DECISIONES DE ARQUITECTURA (ADR) — REAL TWS COMMERCE SYSTEM

Este documento registra todas las decisiones técnicas y de diseño relevantes tomadas en el proyecto para mantener la coherencia a largo plazo.

---

## ADR-001: Propiedad de Mercancía Basada en Lote (`stock_lot_ownership`) y No en Producto Maestro
- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Contexto:** Actualmente toda la mercancía inicial pertenece a **Eberto** (`OWN-0001`), pero en el futuro otros propietarios comercializarán productos a través de REAL TWS, pudiendo coincidir en el mismo modelo o SKU con costos de compra distintos.
- **Decisión:** Desacoplar por completo las tablas `products` y `product_variants` del campo `owner_id`. La propiedad y el costo de adquisición viven en `stock_lot_ownership` (`lot_id + sku + owner_id`), y las ventas se atribuyen mediante `sales_item_allocations`.
- **Consecuencias:**
  - Un mismo SKU puede tener existencias simultáneas de varios propietarios sin duplicar el catálogo ni alterar los códigos SKU.
  - Cada venta conoce con exactitud matemática el costo unitario del lote/propietario del que salió la unidad física.

---

## ADR-002: Segregación Estricta de Stock Disponible (`qty_available = qty_good - qty_reserved`)
- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Contexto:** Los 38 artículos físicos en stock del inventario inicial aún no cuentan con inspección técnica aprobada. Anunciar o vender unidades sin verificar genera riesgo operativo y reclamos.
- **Decisión:** Definir `qty_available` como columna generada calculada exclusivamente a partir de unidades aprobadas en calidad menos unidades reservadas (`GREATEST(0, qty_good - qty_reserved)`). Las unidades en `qty_pending` o `qty_defective` quedan bloqueadas para venta y marketing.
- **Consecuencias:** Ningún producto sin control de calidad aprobado puede venderse ni anunciarse por error.

---

## ADR-003: Transacciones Atómicas en PostgreSQL (`PL/pgSQL` RPC) para Movimientos de Stock y Dinero
- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Contexto:** Ejecutar múltiples peticiones desde el navegador para descontar stock, crear asignaciones de venta y registrar kardex expone el sistema a condiciones de carrera o estados inconsistentes si falla la red a mitad del proceso.
- **Decisión:** Encapsular toda operación crítica (confirmación de venta, liberación de calidad, transferencia entre propietarios y liquidación de ganancias) en funciones RPC transaccionales en PostgreSQL con bloqueo pesimista (`FOR UPDATE`).
- **Consecuencias:** Garantía ACID completa: o se registra toda la operación con su auditoría, o se revierte íntegramente (`ROLLBACK`).

---

## ADR-004: Motor Local de Plantillas como Base e IA Generativa (`Gemini Flash`) 100 % Opcional
- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Contexto:** El sistema debe operar con costo \$0 de infraestructura externa, mantener `Antigravity AI Credit Overages` en `Never` y no depender de que una API de IA esté activa.
- **Decisión:** Construir primero un generador determinístico local de plantillas comerciales (para WhatsApp Business, Instagram, Facebook y etiquetas). La integración con **Gemini Flash** se implementa detrás de una Edge Function opcional controlada por interruptor (`gemini_enabled`) y límite diario.
- **Consecuencias:** Disponibilidad operativa del 100 % sin costos fijos ni dependencia de servicios externos de IA.

---

## ADR-005: Integración Oficial con WhatsApp Business App y Meta Graph API con Aprobación Humana
- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Contexto:** Automatizar navegadores de forma no oficial en plataformas de Meta provoca bloqueos de cuenta. Además, publicar anuncios o contenido sin supervisión humana conlleva riesgo comercial y financiero.
- **Decisión:** Utilizar exclusivamente enlaces profundos oficiales de WhatsApp Business (`wa.me`) y llamadas oficiales a **Meta Graph API** únicamente para publicaciones orgánicas que hayan sido aprobadas previamente (`approval_status = 'approved'`). Queda prohibida la pauta pagada automática.
- **Consecuencias:** Cumplimiento total de políticas de Meta y control absoluto del administrador sobre lo que se publica.
