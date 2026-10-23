# Imagen de SOLO archivos con el frontend ya compilado (frontend/dist). No se ejecuta nunca:
# GHCR es el transporte. tramites-ctl la baja, copia /sitio a /var/www/novagest/releases/<entorno>/<etiqueta>
# y cambia el enlace /var/www/novagest/<entorno> cuando el backend de la misma etiqueta quedó UP.
# Contexto de construcción: frontend/dist (lo arma deploy.yml con npm ci && npm run build).
FROM scratch
COPY . /sitio
# docker create exige un comando aunque el contenedor nunca se arranque.
CMD ["/sitio/no-se-ejecuta"]
