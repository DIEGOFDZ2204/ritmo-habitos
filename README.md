# Ritmo

App móvil para crear y seguir hábitos, organizar tareas y llevar la cuenta de días sin una conducta. La aplicación funciona sin cuenta y guarda los datos en el almacenamiento local del dispositivo. El tema oscuro, sencillo y enfocado, viene activado por defecto.

Las tareas incluyen fecha y hora. En Pendientes puedes conectar Google Calendar para crear un evento de 30 minutos con un aviso emergente 10 minutos antes. Ritmo pide permiso solo para crear eventos y envía título y horario únicamente al pulsar el botón de Calendar de una tarea. El token de Google vive solo en memoria durante la sesión; los datos de hábitos y tareas siguen locales.

## Conectar Google Calendar

1. En Google Cloud Console, crea un proyecto, habilita **Google Calendar API** y configura la pantalla de consentimiento OAuth como **Externa**. Para uso personal, deja la app en modo de prueba y añade tu cuenta Google como usuario de prueba.
2. Crea un cliente OAuth de tipo **Aplicación web**. Añade como origen JavaScript autorizado `https://diegofdz2204.github.io` (y `http://localhost:5173` para desarrollo). No hace falta URL de redirección: Ritmo usa el flujo de token del navegador.
3. En Ritmo → **Pendientes**, pega el ID público de cliente OAuth (termina en `apps.googleusercontent.com`), guárdalo y pulsa **Conectar Google Calendar**. Después de autorizar, usa el icono de calendario de una tarea para crearla.

El permiso solicitado es `calendar.events`. Un proyecto personal en pruebas solo permite autorizar a sus usuarios de prueba. Para distribuir el acceso OAuth al público general, Google exige verificación de la aplicación y un dominio propio verificado; un subdominio compartido de GitHub Pages puede no cumplir ese requisito. Consulta la [política de privacidad](https://diegofdz2204.github.io/ritmo-habitos/privacy.html) antes de publicar acceso para otros usuarios.

El APK usa una WebView: Google no permite autorizar OAuth dentro de ese navegador integrado. En Android, abre Ritmo en Chrome para usar la conexión directa; el APK conserva el formulario que prepara el evento para guardarlo manualmente. En iPhone, usa Safari.

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

Los hábitos, tareas y sus registros se guardan en `localStorage` en este dispositivo. No hay cuenta, servidor ni sincronización de datos personales. Borrar los datos del navegador elimina ese historial. El repositorio contiene el código de la app, no tus datos personales. Consulta [Privacidad](https://diegofdz2204.github.io/ritmo-habitos/privacy.html) para conocer el tratamiento al usar la conexión opcional con Calendar.

