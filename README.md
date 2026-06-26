# JMicha Dominó Cam

Prototipo de app móvil/PWA para contar puntos visibles en fichas de dominó usando la cámara del teléfono y guardar anotaciones por jugador/equipo.

## Qué hace

- Abre la cámara trasera del teléfono.
- Captura una imagen.
- Detecta puntos negros en fichas claras o puntos claros en fichas oscuras.
- Muestra el total detectado.
- Permite corregir manualmente con +1 / -1.
- Guarda anotaciones por Equipo A, Equipo B, Jugador 1 o Jugador 2.
- Guarda el marcador e historial en `localStorage`.
- Puede instalarse como PWA desde el navegador.

## Cómo probarlo

### En computadora

Abre una terminal dentro de esta carpeta y ejecuta:

```bash
python -m http.server 8080
```

Luego abre:

```text
http://localhost:8080
```

### En teléfono

La cámara móvil exige HTTPS. Para probar en producción:

1. Sube todos estos archivos a una carpeta de tu hosting, por ejemplo `public_html/domino/`.
2. Abre `https://tudominio.com/domino/`.
3. Acepta el permiso de cámara.
4. En Chrome/Android puedes tocar “Instalar” o “Agregar a pantalla de inicio”.

## Consejos para mejor lectura

- Coloca las fichas separadas, boca arriba.
- Usa fondo liso y contraste alto.
- Evita sombras fuertes.
- Haz la foto lo más perpendicular posible.
- Ajusta sensibilidad si marca puntos de más o de menos.

## Limitación importante

Esta versión usa visión por computadora básica en el navegador. Para una app comercial con lectura casi perfecta, lo ideal es entrenar un modelo de detección con fotos reales de tus fichas de dominó, distintas luces, ángulos y fondos.
