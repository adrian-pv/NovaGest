import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cerrarSesionApi, consultarPerfil, iniciarSesion as iniciarSesionApi } from '../api/auth'
import { configurarRenovador } from '../api/cliente'
import { tokenVencido } from '../api/token'
import type { Perfil } from '../api/tipos'
import { leerRenovacion } from './almacen'
import { ContextoSesion, type EstadoSesion, type ValorSesion } from './contexto'
import { alExpirarSesion, guardarSesion, olvidarSesion, renovarSesion } from './renovacion'

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>('cargando')
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  const volverAnonimo = useCallback(() => {
    setPerfil(null)
    setEstado('anonimo')
  }, [])

  // El cliente de la API renueva la sesión por su cuenta al recibir 401; si no se logra, la sesión termina.
  useEffect(() => {
    configurarRenovador(renovarSesion)
    const quitar = alExpirarSesion(volverAnonimo)
    return () => {
      configurarRenovador(null)
      quitar()
    }
  }, [volverAnonimo])

  // Al cargar la página no hay token de acceso: se recupera la sesión con el token de renovación guardado.
  useEffect(() => {
    let cancelado = false
    async function restaurar() {
      if (!leerRenovacion()) {
        setEstado('anonimo')
        return
      }
      const renovada = await renovarSesion()
      if (cancelado) return
      if (!renovada) {
        volverAnonimo()
        return
      }
      try {
        const actual = await consultarPerfil()
        if (cancelado) return
        setPerfil(actual)
        setEstado('autenticado')
      } catch {
        if (cancelado) return
        olvidarSesion()
        volverAnonimo()
      }
    }
    void restaurar()
    return () => {
      cancelado = true
    }
  }, [volverAnonimo])

  const iniciarSesion = useCallback(async (correo: string, clave: string) => {
    const tokens = await iniciarSesionApi(correo, clave)
    guardarSesion(tokens)
    try {
      setPerfil(await consultarPerfil())
      setEstado('autenticado')
    } catch (error) {
      olvidarSesion()
      throw error
    }
  }, [])

  const cerrarSesion = useCallback(async () => {
    try {
      // Si el token de acceso ya venció, primero se renueva para revocar el token de renovación vigente y no uno viejo
      if (tokenVencido()) await renovarSesion()
      const renovacion = leerRenovacion()
      // Sin token de renovación no se llama: la API interpretaría "sin token" como cerrar TODAS las sesiones
      if (renovacion) await cerrarSesionApi(renovacion)
    } catch {
      // Si la API no responde, la sesión se cierra igual en este navegador
    } finally {
      olvidarSesion()
      volverAnonimo()
    }
  }, [volverAnonimo])

  const valor = useMemo<ValorSesion>(
    () => ({
      estado,
      perfil,
      iniciarSesion,
      cerrarSesion,
      tienePermiso: (permiso) => perfil?.permisos.includes(permiso) ?? false,
    }),
    [estado, perfil, iniciarSesion, cerrarSesion],
  )

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}
