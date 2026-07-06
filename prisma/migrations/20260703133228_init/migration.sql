-- CreateTable
CREATE TABLE "company_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL DEFAULT 'BBTI',
    "siglas" TEXT DEFAULT 'S.A.C.',
    "rubro" TEXT DEFAULT 'Fabricación de Tableros Eléctricos',
    "ruc" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "website" TEXT,
    "moneda" TEXT DEFAULT 'S/',
    "igv" TEXT DEFAULT '18',
    "orden_prefix" TEXT DEFAULT 'PR',
    "dias_alerta" INTEGER DEFAULT 7,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "fecha_creacion" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usuario_id" UUID,
    "usuario_nombre" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN INGENIERÍA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_comercial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "fecha_entrega" TEXT,
    "dias_plazo" INTEGER,
    "adelanto" DOUBLE PRECISION DEFAULT 0,
    "adelanto_fijado" BOOLEAN DEFAULT false,
    "metrado" TEXT,
    "alerta" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_comercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_ingenieria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "estado_planos" TEXT DEFAULT 'Solicitud de planos',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_ingenieria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_materiales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER DEFAULT 0,
    "unidad" TEXT DEFAULT 'und',
    "comprado" INTEGER DEFAULT 0,
    "estado" TEXT DEFAULT 'PENDIENTE',
    "codigo" TEXT,
    "precio_unitario" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "proyecto_materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_produccion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "progreso" INTEGER DEFAULT 0,
    "pruebas" BOOLEAN DEFAULT false,
    "envio" BOOLEAN DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_etapas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" TEXT DEFAULT 'PENDIENTE',

    CONSTRAINT "proyecto_etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_finanzas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "adelanto" DOUBLE PRECISION DEFAULT 0,
    "fecha_adelanto" TEXT,
    "porcentaje" INTEGER DEFAULT 0,
    "forma_pago" TEXT,
    "alerta" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_finanzas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_pagos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "descripcion" TEXT,
    "monto" DOUBLE PRECISION,
    "fecha" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_comentarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_observaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_observaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "storage_path" TEXT,
    "subido_por" TEXT,
    "subido_por_rol" TEXT,
    "estado" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT,
    "tipo" TEXT,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_confirmaciones" (
    "proyecto_id" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "confirmada_por" TEXT,
    "confirmada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_confirmaciones_pkey" PRIMARY KEY ("proyecto_id","etapa")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "destinatario_id" UUID NOT NULL,
    "proyecto_id" TEXT,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "actor" TEXT,
    "leida" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_eventos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documento_id" UUID,
    "proyecto_id" TEXT,
    "documento_nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "usuario" TEXT,
    "rol" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proyecto_id" TEXT,
    "cliente" TEXT,
    "usuario" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actividad_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "rol" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("rol")
);

-- CreateTable
CREATE TABLE "proyecto_alertas_enviadas" (
    "id" SERIAL NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_alertas_enviadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "proyectos_estado_idx" ON "proyectos"("estado");

-- CreateIndex
CREATE INDEX "proyectos_usuario_id_idx" ON "proyectos"("usuario_id");

-- CreateIndex
CREATE INDEX "proyectos_activo_idx" ON "proyectos"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_comercial_proyecto_id_key" ON "proyecto_comercial"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_ingenieria_proyecto_id_key" ON "proyecto_ingenieria"("proyecto_id");

-- CreateIndex
CREATE INDEX "proyecto_materiales_proyecto_id_idx" ON "proyecto_materiales"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_produccion_proyecto_id_key" ON "proyecto_produccion"("proyecto_id");

-- CreateIndex
CREATE INDEX "proyecto_etapas_proyecto_id_idx" ON "proyecto_etapas"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_finanzas_proyecto_id_key" ON "proyecto_finanzas"("proyecto_id");

-- CreateIndex
CREATE INDEX "proyecto_pagos_proyecto_id_idx" ON "proyecto_pagos"("proyecto_id");

-- CreateIndex
CREATE INDEX "proyecto_comentarios_proyecto_id_idx" ON "proyecto_comentarios"("proyecto_id");

-- CreateIndex
CREATE INDEX "proyecto_observaciones_proyecto_id_idx" ON "proyecto_observaciones"("proyecto_id");

-- CreateIndex
CREATE INDEX "proyecto_documentos_proyecto_id_idx" ON "proyecto_documentos"("proyecto_id");

-- CreateIndex
CREATE INDEX "alertas_proyecto_id_idx" ON "alertas"("proyecto_id");

-- CreateIndex
CREATE INDEX "alertas_leida_idx" ON "alertas"("leida");

-- CreateIndex
CREATE INDEX "notificaciones_destinatario_id_leida_idx" ON "notificaciones"("destinatario_id", "leida");

-- CreateIndex
CREATE INDEX "documento_eventos_created_at_idx" ON "documento_eventos"("created_at" DESC);

-- CreateIndex
CREATE INDEX "actividad_log_created_at_idx" ON "actividad_log"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_alertas_enviadas_proyecto_id_tipo_key" ON "proyecto_alertas_enviadas"("proyecto_id", "tipo");

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_comercial" ADD CONSTRAINT "proyecto_comercial_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_ingenieria" ADD CONSTRAINT "proyecto_ingenieria_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_materiales" ADD CONSTRAINT "proyecto_materiales_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_produccion" ADD CONSTRAINT "proyecto_produccion_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_etapas" ADD CONSTRAINT "proyecto_etapas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_finanzas" ADD CONSTRAINT "proyecto_finanzas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_pagos" ADD CONSTRAINT "proyecto_pagos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_comentarios" ADD CONSTRAINT "proyecto_comentarios_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_observaciones" ADD CONSTRAINT "proyecto_observaciones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_documentos" ADD CONSTRAINT "proyecto_documentos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_confirmaciones" ADD CONSTRAINT "proyecto_confirmaciones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_alertas_enviadas" ADD CONSTRAINT "proyecto_alertas_enviadas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
