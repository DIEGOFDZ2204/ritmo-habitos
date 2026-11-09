# Ritmo

App móvil para crear y seguir hábitos, organizar tareas y llevar la cuenta de días sin una conducta. La aplicación funciona sin cuenta y guarda los datos en el almacenamiento local del dispositivo. El tema oscuro, sencillo y enfocado, viene activado por defecto.

Las tareas incluyen fecha y hora. En Pendientes puedes conectar Google Calendar para crear un evento de 30 minutos con un aviso emergente 10 minutos antes. Ritmo pide permiso solo para crear eventos y envía título y horario únicamente al pulsar el botón de Calendar de una tarea. El token de Google vive solo en memoria durante la sesión; los datos de hábitos y tareas siguen locales.

## Conectar Google Calendar

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto o selecciona uno y habilita **Google Calendar API** desde **APIs y servicios → Biblioteca**.
2. Abre **Google Auth Platform → Branding** y configura el nombre de la app y el correo de soporte. En **Audience**, elige **External** para una cuenta personal de Gmail, deja la publicación en **Testing** y añade tu propia cuenta como usuario de prueba. En **Data Access**, añade el ámbito `https://www.googleapis.com/auth/calendar.events`.
3. En **Google Auth Platform → Clients → Create client**, elige **Web application**. En **Authorized JavaScript origins**, añade `https://diegofdz2204.github.io` y, solo para desarrollo local, `http://localhost:5173`. Introduce solo los orígenes, sin rutas como `/ritmo-habitos/`; este flujo de navegador no necesita redirect URI.
4. Copia el **Client ID** (termina en `apps.googleusercontent.com`) y pégalo en Ritmo → **Pendientes → ID de cliente OAuth web**. Guarda el ID y pulsa **Conectar Google Calendar**. Cuando autorices tu cuenta, el icono de calendario de cada tarea creará un evento.

El Client ID es público y la app no necesita el *client secret*. En el modo **Testing**, Google limita el acceso a las cuentas de prueba y puede pedir que autorices de nuevo cada siete días. Al crear el evento, Ritmo envía a Google solo el título y el horario de la tarea elegida; los hábitos, tareas e historial siguen guardados localmente.

Para distribuir la conexión OAuth al público general, Google exige verificar la aplicación y los dominios asociados; el subdominio compartido de GitHub Pages puede no servir como dominio propio verificable. En ese caso, usa un dominio personalizado y configura sus orígenes en el cliente OAuth. Consulta la [política de privacidad](https://diegofdz2204.github.io/ritmo-habitos/privacy.html).

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

