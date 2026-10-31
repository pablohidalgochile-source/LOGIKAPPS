# TRACKHUNT · portable 0.2.0 beta

Búsquedas, Playlist Hunt, preparación de playlists, calidad y conexiones. Actualizado desde el desarrollo revisado el 31-10-2026.

## Requisitos

Node.js 22.13 o posterior y npm.

## Cómo abrir

Abre Preparar TRACKHUNT.command y, al finalizar, Abrir TRACKHUNT.command. Para conexiones opcionales, copia .env.example a .env.local y completa solo tus propias credenciales. Reinicia después.

## Estado y límites

Playlist Hunt requiere una clave propia del proveedor; no se suministra ni se realiza una llamada de pago al abrir. Spotify/Deezer requieren tus apps OAuth y permisos. CONNECTIONS_ENCRYPTION_KEY debe ser una clave aleatoria base64 de 32 bytes (node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"). Los callbacks deben coincidir con el puerto mostrado en Conexiones. Las conexiones se guardan cifradas en data/connections.sqlite. La revisión web 22 y la versión portable son numeraciones diferentes.

Las actualizaciones se descargan desde la release de LOGIKAPPS. Conserva tus datos antes de reemplazar una carpeta.
