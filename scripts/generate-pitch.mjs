// scripts/generate-pitch.mjs
import pptxgen from 'pptxgenjs';

// Crear instancia de la presentación
const pptx = new pptxgen();

// Colores del sistema de diseño BBTI
const BG_COLOR = '060B18';     // Azul petróleo oscuro
const AMBER_COLOR = 'EC9D2E';  // Ámbar primario (destacados/títulos)
const WHITE_COLOR = 'F8FAFC';  // Blanco suave (texto de lectura)
const GRAY_COLOR = '94A3B8';   // Slate grisáceo (subtítulos)
const RED_COLOR = 'F43F5E';    // Rojo suave (alertas/problemas)
const TEAL_COLOR = '255468';   // Teal/Petróleo secundario (bloques)

// Función auxiliar para agregar slides de contenido estándar
function crearSlideContenido(titulo, notasExposicion) {
  const slide = pptx.addSlide();
  slide.background = { fill: BG_COLOR };
  
  // Título de la diapositiva
  slide.addText(titulo, {
    x: 0.6,
    y: 0.4,
    w: 12.0,
    h: 0.8,
    fontSize: 28,
    fontFace: 'Trebuchet MS',
    bold: true,
    color: AMBER_COLOR
  });

  // Línea decorativa superior
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.6,
    y: 1.1,
    w: 11.5,
    h: 0.03,
    fill: { fill: AMBER_COLOR }
  });

  // Notas de exposición para el presentador
  if (notasExposicion) {
    slide.addNotes(notasExposicion);
  }

  return slide;
}

// ==========================================
// DIAPOSITIVA 1: PORTADA
// ==========================================
const s1 = pptx.addSlide();
s1.background = { fill: BG_COLOR };

s1.addText('BBTI ERP', {
  x: 1.0,
  y: 1.6,
  w: 11.3,
  h: 1.0,
  fontSize: 48,
  fontFace: 'Trebuchet MS',
  bold: true,
  color: AMBER_COLOR
});

s1.addText('El Centro de Control Digital de Nuestra Planta', {
  x: 1.0,
  y: 2.6,
  w: 11.3,
  h: 0.8,
  fontSize: 24,
  fontFace: 'Arial',
  bold: true,
  color: WHITE_COLOR
});

s1.addText('Eficiencia, Trazabilidad en Tiempo Real y Control Absoluto', {
  x: 1.0,
  y: 3.4,
  w: 11.3,
  h: 0.5,
  fontSize: 16,
  fontFace: 'Arial',
  color: GRAY_COLOR
});

s1.addText('Presentación de Defensa del Proyecto · Junio 2026', {
  x: 1.0,
  y: 5.8,
  w: 11.3,
  h: 0.4,
  fontSize: 12,
  fontFace: 'Arial',
  color: AMBER_COLOR
});

s1.addNotes(
  "Estimada Gerencia, hoy les presento el BBTI ERP, una solución diseñada para transformar la forma en que administramos nuestra fábrica. Dejaremos atrás las llamadas constantes y las hojas de cálculo desconectadas para dar paso a un Centro de Control Digital moderno que unifica todas nuestras áreas en una sola pantalla."
);


// ==========================================
// DIAPOSITIVA 2: EL DESAFÍO OPERACIONAL
// ==========================================
const s2 = crearSlideContenido(
  'El Costo de la Invisibilidad Operativa',
  "Actualmente, el mayor enemigo de nuestra eficiencia es la falta de visibilidad en tiempo real. Perdemos valioso tiempo en reuniones de seguimiento solo para saber en qué estado están los proyectos, quién autorizó un plano, o si los materiales ya llegaron. La invisibilidad cuesta dinero, demoras y frustración."
);

// Puntos de dolor en rojo
s2.addText(
  [
    { text: '• Silencios Operativos: ', options: { bold: true, color: RED_COLOR } },
    { text: 'Dificultad para saber en qué etapa exacta está cada Orden de Proyecto (PR) sin preguntar.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Falta de Trazabilidad: ', options: { bold: true, color: RED_COLOR } },
    { text: 'Documentos (planos, cotizaciones) sin historial claro de quién los subió o eliminó.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Errores Manuales: ', options: { bold: true, color: RED_COLOR } },
    { text: 'Transcribir metrados de Excel a mano consume horas y genera errores de digitación.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Descoordinación de Áreas: ', options: { bold: true, color: RED_COLOR } },
    { text: 'Producción inicia sin insumos completos, o Finanzas calcula pagos bajo parámetros obsoletos.', options: { color: WHITE_COLOR } }
  ],
  {
    x: 0.8,
    y: 1.5,
    w: 11.0,
    h: 4.8,
    fontSize: 16,
    fontFace: 'Arial',
    lineSpacing: 22
  }
);


// ==========================================
// DIAPOSITIVA 3: LA SOLUCIÓN
// ==========================================
const s3 = crearSlideContenido(
  'La Solución: BBTI ERP',
  "BBTI ERP no es solo un software de registro; es el sistema nervioso central de nuestra planta. Automatiza el flujo de trabajo y conecta a Comercial, Ingeniería, Logística, Producción y Finanzas bajo reglas estrictas que garantizan que nada se salte y que todo quede registrado de forma automática."
);

// Cuatro pilares de la solución en bloques
const pilares = [
  { tit: '1. Command Center Feed', desc: 'Historial de actividades unificado en tiempo real con refresco automático y filtros por rol.' },
  { tit: '2. Flujo de Firmas Secuencial', desc: 'Rigor operativo: cada área debe firmar su etapa antes de que el proyecto pueda avanzar.' },
  { tit: '3. Importación Inteligente', desc: 'Carga inmediata de planillas de metrados de Excel, convirtiéndolas en materiales de Logística.' },
  { tit: '4. Parámetros Flexibles', desc: 'Moneda (S/ o USD) e IGV configurables globalmente y aplicados a todos los módulos.' }
];

pilares.forEach((p, idx) => {
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  const xPos = 0.8 + col * 5.8;
  const yPos = 1.6 + row * 2.2;

  // Fondo del bloque
  s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: xPos,
    y: yPos,
    w: 5.4,
    h: 1.9,
    fill: { fill: TEAL_COLOR },
    line: { color: AMBER_COLOR, width: 1 }
  });

  // Texto del bloque
  s3.addText(
    [
      { text: `${p.tit}\n`, options: { bold: true, color: AMBER_COLOR, fontSize: 16 } },
      { text: '\n', options: { fontSize: 6 } },
      { text: p.desc, options: { color: WHITE_COLOR, fontSize: 13 } }
    ],
    {
      x: xPos + 0.3,
      y: yPos + 0.2,
      w: 4.8,
      h: 1.5,
      fontFace: 'Arial'
    }
  );
});


// ==========================================
// DIAPOSITIVA 4: COMMAND CENTER FEED
// ==========================================
const s4 = crearSlideContenido(
  'Superpoder 1: Command Center Feed (Actividad en Vivo)',
  "Para la gerencia, esta es la herramienta de toma de decisiones definitiva. El Command Center Feed le da al gerente el control absoluto del minuto a minuto de la fábrica sin tener que enviar un solo mensaje o hacer una llamada. Sabe exactamente quién subió planos, quién completó compras o quién autorizó un pago."
);

s4.addText(
  [
    { text: '• Visibilidad Operativa 360°: ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Monitoreo dinámico del avance del taller en una única pantalla de inicio.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Ejemplos del Feed de Trazabilidad Real:\n', options: { bold: true, color: WHITE_COLOR } },
    { text: '  - "José Flores (Comercial) importó metrado de Excel para PR-03 (S/ 120,000)"\n', options: { color: GRAY_COLOR } },
    { text: '  - "Giancarlos Oscco (Ingeniería) aprobó planos para PR-02"\n', options: { color: GRAY_COLOR } },
    { text: '  - "Carlos Ramírez (Logística) completó la compra de materiales para PR-02"\n\n', options: { color: GRAY_COLOR } },
    { text: '• Control y Tiempos Reales: ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Sincronización automatizada cada 10 segundos, con tags de proyecto clicables y búsquedas cruzadas por usuario, cliente o acción.', options: { color: WHITE_COLOR } }
  ],
  {
    x: 0.8,
    y: 1.5,
    w: 11.0,
    h: 4.8,
    fontSize: 15,
    fontFace: 'Arial',
    lineSpacing: 18
  }
);


// ==========================================
// DIAPOSITIVA 5: FLUJO DE FIRMAS
// ==========================================
const s5 = crearSlideContenido(
  'Superpoder 2: Flujo de Firmas y Sign-off Secuencial',
  "Hemos implementado un sistema de firmas digitales por área. Un ingeniero no puede autorizar el inicio de producción si Logística no ha firmado la compra de materiales. Y Logística no puede comprar si Ingeniería no ha aprobado el despiece. Esto elimina el desorden y delimita las responsabilidades de cada jefe de área."
);

s5.addText(
  [
    { text: '• Disciplina Operativa (Cero Saltos): ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'El flujo de fabricación sigue una secuencia obligatoria bloqueante.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Hitos del Tablero de Firmas:\n', options: { bold: true, color: WHITE_COLOR } },
    { text: '  - 1. Ingeniería: Requiere planos marcados como "Aprobados y firmados" en el sistema.\n', options: { color: GRAY_COLOR } },
    { text: '  - 2. Logística: Requiere el 100% de materiales comprados (Completados).\n', options: { color: GRAY_COLOR } },
    { text: '  - 3. Producción: Requiere todas las etapas de fabricación al 100%.\n', options: { color: GRAY_COLOR } },
    { text: '  - 4. Pruebas y Envío: Habilitan la entrega del proyecto.\n\n', options: { color: GRAY_COLOR } },
    { text: '• Seguridad Reversible (Cascada): ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Si un área necesita corregir o deshacer su firma previa, el sistema revoca automáticamente por seguridad todas las autorizaciones posteriores.', options: { color: WHITE_COLOR } }
  ],
  {
    x: 0.8,
    y: 1.5,
    w: 11.0,
    h: 4.8,
    fontSize: 15,
    fontFace: 'Arial',
    lineSpacing: 18
  }
);


// ==========================================
// DIAPOSITIVA 6: AUTOMATIZACIÓN DE METRADOS
// ==========================================
const s6 = crearSlideContenido(
  'Superpoder 3: Automatización de Metrados (Excel Import)',
  "Antes, transcribir una cotización con 80 materiales tomaba hasta 2 horas y conllevaba riesgos de tipeo. Con el importador automático, el ERP procesa el archivo de Comercial en menos de 5 segundos, poblando la lista de materiales de Logística con precisión matemática."
);

s6.addText(
  [
    { text: '• Carga Rápida sin Intervención Manual: ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Comercial sube el archivo de metrado generado directamente de las cotizaciones.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Extracción de Datos en Segundos: ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'El parser inteligente procesa la planilla, filtrando tableros y detectando:\n', options: { color: WHITE_COLOR } },
    { text: '  - Códigos de componentes de fabricantes (ej: ABB, Schneider).\n', options: { color: GRAY_COLOR } },
    { text: '  - Unidades de medida (und, metros, kg).\n', options: { color: GRAY_COLOR } },
    { text: '  - Cantidades requeridas y precios unitarios históricos.\n\n', options: { color: GRAY_COLOR } },
    { text: '• Conexión Inmediata con Abastecimiento: ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Crea más de 70 ítems listos para comprar, eliminando el traspaso manual y previniendo errores de digitación en las órdenes de compra.', options: { color: WHITE_COLOR } }
  ],
  {
    x: 0.8,
    y: 1.5,
    w: 11.0,
    h: 4.8,
    fontSize: 15,
    fontFace: 'Arial',
    lineSpacing: 18
  }
);


// ==========================================
// DIAPOSITIVA 7: PARAMETRIZACIÓN FINANCIERA
// ==========================================
const s7 = crearSlideContenido(
  'Parámetros Flexibles y Privacidad Financiera',
  "El sistema es flexible y seguro. Permite cambiar la moneda base de la planta e IGV desde la configuración y se adapta instantáneamente. Además, protege la información confidencial mediante políticas estrictas a nivel de base de datos para que los montos financieros solo sean visibles por las personas autorizadas."
);

s7.addText(
  [
    { text: '• Configuración Unificada de Empresa: ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Permite a Administración cambiar en caliente los parámetros del negocio.\n\n', options: { color: WHITE_COLOR } },
    { text: '• Desglose y Formateo Automático:\n', options: { bold: true, color: WHITE_COLOR } },
    { text: '  - Soporte multi-moneda instantáneo (Soles y Dólares) a nivel global en todos los formularios y vistas.\n', options: { color: GRAY_COLOR } },
    { text: '  - Cálculo dinámico de IGV en la pestaña de Finanzas (desglose de Subtotal e impuesto a partir del monto total del contrato).\n\n', options: { color: GRAY_COLOR } },
    { text: '• Privacidad de Datos y RLS (Row-Level Security): ', options: { bold: true, color: AMBER_COLOR } },
    { text: 'Los presupuestos y estados de pago están encriptados y ocultos para roles no-financieros (Ingeniería y Producción), resguardando la confidencialidad de la información comercial de la planta.', options: { color: WHITE_COLOR } }
  ],
  {
    x: 0.8,
    y: 1.5,
    w: 11.0,
    h: 4.8,
    fontSize: 15,
    fontFace: 'Arial',
    lineSpacing: 18
  }
);


// ==========================================
// DIAPOSITIVA 8: RETORNO DE LA INVERSIÓN (ROI)
// ==========================================
const s8 = crearSlideContenido(
  'Resultados del Negocio y Retorno de Inversión',
  "Con esta implementación, no solo ganamos control, ganamos tiempo y dinero. Reducimos drásticamente los errores de comunicación y compras en planta, aceleramos los tiempos de respuesta y le damos a la gerencia las métricas necesarias para negociar mejor con clientes y optimizar la producción."
);

const metricas = [
  { val: '95%', desc: 'Menos errores en pedidos de materiales a Logística' },
  { val: '90%', desc: 'Ahorro de tiempo en carga e inicialización de proyectos' },
  { val: '100%', desc: 'Trazabilidad de auditoría de documentos y firmas' }
];

metricas.forEach((m, idx) => {
  const xPos = 0.8 + idx * 3.8;

  // Círculo decorativo
  s8.addShape(pptx.shapes.OVAL, {
    x: xPos + 0.8,
    y: 1.6,
    w: 1.8,
    h: 1.8,
    fill: { fill: TEAL_COLOR },
    line: { color: AMBER_COLOR, width: 2 }
  });

  // Valor
  s8.addText(m.val, {
    x: xPos + 0.3,
    y: 2.1,
    w: 2.8,
    h: 0.8,
    fontSize: 32,
    fontFace: 'Trebuchet MS',
    bold: true,
    color: AMBER_COLOR,
    align: 'center'
  });

  // Descripción
  s8.addText(m.desc, {
    x: xPos,
    y: 3.7,
    w: 3.4,
    h: 1.2,
    fontSize: 14,
    fontFace: 'Arial',
    color: WHITE_COLOR,
    align: 'center'
  });
});

s8.addText('➔ Mayor control de planta · ➔ Eliminación de cuellos de botella · ➔ Decisiones basadas en datos', {
  x: 0.8,
  y: 5.2,
  w: 11.0,
  h: 0.5,
  fontSize: 14,
  fontFace: 'Arial',
  bold: true,
  color: AMBER_COLOR,
  align: 'center'
});


// ==========================================
// DIAPOSITIVA 9: CONCLUSIÓN
// ==========================================
const s9 = pptx.addSlide();
s9.background = { fill: BG_COLOR };

s9.addText('El Futuro de Nuestra Operación Comienza Hoy', {
  x: 1.0,
  y: 1.8,
  w: 11.3,
  h: 1.0,
  fontSize: 36,
  fontFace: 'Trebuchet MS',
  bold: true,
  color: AMBER_COLOR
});

s9.addText(
  [
    { text: 'Con BBTI ERP, consolidamos una ', options: { color: WHITE_COLOR } },
    { text: 'planta conectada, transparente y eficiente', options: { bold: true, color: AMBER_COLOR } },
    { text: '. Reducimos costos, delimitamos responsabilidades y brindamos a la gerencia la tranquilidad de tener el control total al alcance de su mano.', options: { color: WHITE_COLOR } }
  ],
  {
    x: 1.0,
    y: 3.0,
    w: 10.5,
    h: 1.5,
    fontSize: 18,
    fontFace: 'Arial',
    lineSpacing: 28
  }
);

s9.addText('Muchas Gracias. ¿Preguntas?', {
  x: 1.0,
  y: 4.8,
  w: 11.3,
  h: 0.6,
  fontSize: 20,
  fontFace: 'Arial',
  bold: true,
  color: AMBER_COLOR
});

s9.addNotes(
  "Gerente, el ERP ya está desplegado en producción, listo para ser adoptado por todos los jefes de área de la planta. Con su aprobación final para iniciar la capacitación y puesta en marcha, daremos el salto definitivo hacia la digitalización total de nuestra operación. Muchas gracias."
);

// Escribir el archivo
console.log('Generando archivo PPTX...');
pptx.writeFile({ fileName: 'Pitch_BBTI_ERP.pptx' })
  .then((fileName) => {
    console.log(`¡Presentación PPTX generada con éxito como "${fileName}"!`);
  })
  .catch((err) => {
    console.error('Error al guardar la presentación:', err);
  });
