# Auditoría de automatización de Marketing — 2026-09-11

## Hallazgos de producción

- VPS auditado: `187.77.40.78`.
- Hora de auditoría UTC: `2026-09-11T12:24:42Z`.
- Servicio `cron`: `active`.
- `/etc/cron.d/estampados-dlv-cron` contiene únicamente los refresh de precios de Cottonext, Textil Ryu y Treck, además de `dispatch-review-requests.sh` cada hora. **No contiene `marketing-cron.sh auto-schedule` ni `marketing-cron.sh dispatch`.**
- `/var/www/estampadosdlv/scripts/estampados-dlv-cron` existe con permisos `-rw-r--r--` y fecha Aug 25; el instalador no está usando la versión actual del repositorio.
- `/var/log/dlv-marketing.log` no existe.
- PM2: `dlv-nextjs` online y `dlv-prospecting` online.
- La consulta de conteos MongoDB no llegó a ejecutarse porque el shell remoto tenía `set -u` y expandió `$group` antes de llegar a `mongosh`; debe repetirse con el comando protegido.

## Implicación

La generación y publicación diaria de Marketing **no están garantizadas actualmente** aunque el código de `marketing-cron.sh` exista en el repositorio. Antes de afirmar que se publicará automáticamente, hay que instalar la versión actual del cron en producción, crear el log y probar ambos endpoints con el secreto sin publicar contenido no autorizado.


## Verificación de automatización diaria — 2026-09-11

La producción tenía la cuenta Meta conectada (`meta_main`, página Estampados DLV e Instagram `estampadosdlv`) y 586 productos activos. Sin embargo, el archivo `/etc/cron.d/estampados-dlv-cron` no tenía inicialmente las entradas de Marketing y el script de Marketing no tenía permiso ejecutable.

Se instaló y recargó cron con estas tareas: generación automática diaria a las 03:00 UTC (`marketing-cron.sh auto-schedule`) y despacho cada 10 minutos (`marketing-cron.sh dispatch`). El script quedó con permisos `0755`.

La primera ejecución detectó que el script evaluaba el `.env` completo como shell; una contraseña de aplicación con espacios provocaba el error `not found`. Se corrigió para leer únicamente `MARKETING_CRON_SECRET`, sin evaluar ni imprimir el resto de las variables. La prueba posterior generó correctamente la tanda automática y creó los posts programados. Las imágenes generadas respondieron `200 OK` desde las URLs públicas de producción.

La generación actual combina el producto principal por categoría con promociones DTF, concurso y videos ya configurados por el flujo existente. La prueba de despacho no publicó una tanda nueva fuera de horario; procesó reintentos antiguos de Instagram, con una recuperación exitosa y cuatro reintentos que siguen sujetos a la lógica existente de reintento. No se borró ni duplicó la cola.

Respaldo de configuración anterior: `/root/backups/marketing-automation-20260911T122625Z/`.

Hash desplegado del script corregido: `c210d66f4b2c3a620dfbe88d776c0696d433c798e5309337b32438bf96b9917b`.
