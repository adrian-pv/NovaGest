package com.proyecto.tramites.usuarios.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

/** Un rol es solo un conjunto de permisos guardado en la base. */
@Entity
@Table(name = "rol")
public class Rol {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 50, unique = true)
	private String nombre;

	@Column(length = 255)
	private String descripcion;

	/** Si es verdadero, el rol ve y toca los registros de todos; si no, solo los propios. */
	@Column(name = "alcance_total", nullable = false)
	private boolean alcanceTotal;

	@ManyToMany(fetch = FetchType.LAZY)
	@JoinTable(name = "rol_permiso",
			joinColumns = @JoinColumn(name = "rol_id"),
			inverseJoinColumns = @JoinColumn(name = "permiso_id"))
	private Set<Permiso> permisos = new HashSet<>();

	@Column(name = "creado_en", nullable = false, updatable = false)
	private Instant creadoEn;

	@Column(name = "actualizado_en", nullable = false)
	private Instant actualizadoEn;

	protected Rol() {
	}

	public Rol(String nombre, String descripcion) {
		this.nombre = nombre;
		this.descripcion = descripcion;
	}

	/** Cambia los datos del rol. Los permisos se cambian directamente sobre getPermisos(). */
	public void definir(String nombre, String descripcion, boolean alcanceTotal) {
		this.nombre = nombre;
		this.descripcion = descripcion;
		this.alcanceTotal = alcanceTotal;
	}

	@PrePersist
	void alCrear() {
		creadoEn = Instant.now();
		actualizadoEn = creadoEn;
	}

	@PreUpdate
	void alActualizar() {
		actualizadoEn = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public String getNombre() {
		return nombre;
	}

	public String getDescripcion() {
		return descripcion;
	}

	public boolean isAlcanceTotal() {
		return alcanceTotal;
	}

	public Set<Permiso> getPermisos() {
		return permisos;
	}

	public Instant getCreadoEn() {
		return creadoEn;
	}

	public Instant getActualizadoEn() {
		return actualizadoEn;
	}

}
