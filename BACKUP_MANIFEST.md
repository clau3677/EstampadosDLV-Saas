# Respaldo de seguridad de Estampados DLV

**Fecha:** 2026-08-27 18:40 UTC  
**Repositorio:** `clau3677/EstampadosDLV-Saas`  
**Servidor:** VPS de producción de Estampados DLV

## Alcance

El respaldo del VPS contiene el código seguro de la aplicación, todas las imágenes bajo `public/uploads`, la colección `products` de MongoDB y los inventarios con sus sumas SHA-256. El respaldo local principal se encuentra en `/var/backups/estampadosdlv/catalog-20260827T181955Z/`.

El inventario auditado contiene 584 productos y 3.980 referencias de imagen. Se verificaron 3.967 archivos físicos existentes y 13 referencias que ya estaban faltantes antes de crear este respaldo. No se modificaron productos, precios, variantes ni referencias.

## Archivos principales en el VPS

| Archivo o directorio | Propósito |
|---|---|
| `uploads/` | Copia completa de `public/uploads` |
| `products.archive` | Exportación gzip de `estampados_dlv.products` |
| `source-safe.tgz` | Snapshot del código sin builds, dependencias ni secretos |
| `audit.json` | Resultado de la auditoría de imágenes |
| `SHA256SUMS` | Hashes de los archivos del respaldo |
| `source-safe.tgz.sha256` | Hash del snapshot de código |

## Protección de secretos

No se suben a GitHub archivos `.env`, tokens OAuth, contraseñas, claves privadas, credenciales, dumps de sesiones ni archivos de configuración sensible. Las credenciales deben conservarse únicamente en el gestor seguro o en el VPS protegido.

## Verificación

El respaldo de imágenes y productos ocupa aproximadamente 8,2 GB y fue verificado con `sha256sum -c`. El snapshot seguro del código ocupa aproximadamente 1,2 GB y tiene su hash independiente en `source-safe.tgz.sha256`.

## Restauración

Para restaurar, primero se debe verificar `SHA256SUMS`, extraer `source-safe.tgz` en una copia de trabajo, restaurar `products.archive` solo después de una revisión y copiar `uploads/` de manera no destructiva. Nunca se debe ejecutar una restauración sobre producción sin conservar primero el estado actual y validar las rutas públicas.

El repositorio contiene el código y este manifiesto. Por el tamaño y la seguridad operativa, el respaldo binario completo de 8,2 GB permanece en el VPS; GitHub no es un sustituto de almacenamiento de backups binarios de producción.
