# Ritmo

App móvil para crear y seguir hábitos, organizar tareas y llevar la cuenta de días sin una conducta. La aplicación funciona sin cuenta y guarda los datos en el almacenamiento local del dispositivo. El tema oscuro, sencillo y enfocado, viene activado por defecto.

Las tareas incluyen fecha y hora. El botón de Google Calendar prepara un evento de 30 minutos para que lo revises y guardes en tu cuenta; no hay sincronización automática ni OAuth configurado. Google Calendar aplica los recordatorios que tengas predeterminados para los eventos.

## Usar en desarrollo

Requisitos: Node.js 22 o posterior y pnpm 9.

```sh
pnpm install
pnpm dev
```

## Instalar

- **iPhone:** abre la web publicada en Safari, pulsa Compartir y elige **Añadir a pantalla de inicio**.
- **Android:** instala la versión web desde el navegador o descarga `app-debug.apk` desde la sección **Releases** del repositorio.

La web se publica en GitHub Pages al actualizar `main` (selecciona **GitHub Actions** como origen en *Settings → Pages* la primera vez). Para publicar una nueva versión Android, crea una etiqueta como `v1.0.0`; GitHub Actions compilará el APK y lo adjuntará a un Release. También se puede iniciar ese flujo manualmente desde la pestaña Actions.

## Datos y privacidad

Los hábitos, tareas y sus registros se guardan en `localStorage` en este dispositivo. No hay cuenta, servidor ni sincronización de datos personales. Borrar los datos del navegador elimina ese historial. El repositorio contiene el código de la app, no tus datos personales.

